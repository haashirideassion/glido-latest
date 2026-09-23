import { createContext, useContext, useReducer, useEffect, type ReactNode, type Dispatch } from 'react'
import type { ServiceCategory, ServiceKey, StoreSubType, StoreDetailEntry, ShipmentMode } from '@/data/types'
import { requiredDocTypesForServices } from '@/lib/serviceRequestDocs'

export interface SelectedService {
  serviceKey: ServiceKey
  subType?: StoreSubType
  // Multi-select storage sub-options (Underbond/Reefer/General/Other) with per-option fields.
  storeDetails?: StoreDetailEntry[]
}

export interface ParsedField {
  name: string
  value: string
  parsed: boolean
}

export interface RequestDocumentFile {
  name: string
  size: number
  docType: string
  storagePath: string | null
  // Simulated document-parsing result (FR 1.1.3.3) — no real OCR/extraction service is wired up,
  // so this is a mocked "auto-fill" pass over a per-doc-type field list.
  parsedFields?: ParsedField[]
}

export interface ServiceRequestWizardState {
  step: number   // 1-5; step 5 is Confirmation
  mode: ShipmentMode | null
  serviceCategory: ServiceCategory | null
  selectedServices: SelectedService[]
  documentFiles: RequestDocumentFile[]
  // FR 2.3 — Out of Gauge cargo indicator; dimensions (cm) only relevant when isOOG is true.
  isOOG: boolean
  oogLength: string
  oogWidth: string
  oogHeight: string
  termsAccepted: boolean
  submitting: boolean
  submitError: string | null
  // Generated client-side on reaching the Confirmation step (FRD FR 1.1.4.2 shows the Request
  // ID before submission) and sent with the create request so the server persists this same id.
  pendingRequestId: string | null
  confirmationRequestId: string | null
  requestConfirmed: boolean
}

export type ServiceRequestWizardAction =
  | { type: 'SET'; field: keyof ServiceRequestWizardState; value: ServiceRequestWizardState[keyof ServiceRequestWizardState] }
  // Auto-advance from a tile step, but only if the user is still standing on it — see the reducer.
  | { type: 'ADVANCE_FROM'; from: number; to: number }
  | { type: 'TOGGLE_SERVICE'; serviceKey: ServiceKey; subType?: StoreSubType; storeDetails?: StoreDetailEntry[] }
  | { type: 'REMOVE_SERVICE'; serviceKey: ServiceKey }
  | { type: 'ADD_DOCUMENT'; doc: RequestDocumentFile }
  | { type: 'REMOVE_DOCUMENT'; name: string }
  | { type: 'RESET' }

export const INITIAL_STATE: ServiceRequestWizardState = {
  step: 1,
  mode: null,
  serviceCategory: null,
  selectedServices: [],
  documentFiles: [],
  isOOG: false,
  oogLength: '',
  oogWidth: '',
  oogHeight: '',
  termsAccepted: false,
  submitting: false,
  submitError: null,
  pendingRequestId: null,
  confirmationRequestId: null,
  requestConfirmed: false,
}

// Request ID is prefixed by category per FRD comment: I = Import, E = Export.
function generateClientRequestId(category: ServiceCategory | null): string {
  const prefix = category === 'export' ? 'E' : 'I'
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `${prefix}${seq}`
}

function reducer(state: ServiceRequestWizardState, action: ServiceRequestWizardAction): ServiceRequestWizardState {
  switch (action.type) {
    case 'SET': {
      // Switching Import <-> Export invalidates any Request ID already reserved: the prefix is
      // part of the id (I vs E), and the server rejects a mismatched one and silently substitutes
      // its own. Without this, going back to Service Type after reaching Confirmation left the
      // user looking at an id that is not the one their request ends up with.
      if (action.field === 'serviceCategory' && action.value !== state.serviceCategory) {
        return { ...state, serviceCategory: action.value as ServiceCategory | null, pendingRequestId: null }
      }
      // Reserve the Request ID the moment the user reaches Confirmation, so it can be displayed
      // there per FR 1.1.4.2 — generated once and reused for the actual submission.
      if (action.field === 'step' && action.value === 5 && !state.pendingRequestId) {
        return { ...state, step: 5, pendingRequestId: generateClientRequestId(state.serviceCategory) }
      }
      return { ...state, [action.field]: action.value }
    }
    case 'ADVANCE_FROM':
      // Mode and Service Type auto-advance on a short delay so the selection animation is visible.
      // If the user hits Back inside that window the pending timer must not yank them forward
      // again, so the move only lands while they are still on the step that scheduled it.
      return state.step === action.from ? { ...state, step: action.to } : state
    case 'TOGGLE_SERVICE': {
      const exists = state.selectedServices.find(s => s.serviceKey === action.serviceKey)
      if (exists) {
        return { ...state, selectedServices: state.selectedServices.filter(s => s.serviceKey !== action.serviceKey) }
      }
      return { ...state, selectedServices: [...state.selectedServices, { serviceKey: action.serviceKey, subType: action.subType, storeDetails: action.storeDetails }] }
    }
    case 'REMOVE_SERVICE':
      return { ...state, selectedServices: state.selectedServices.filter(s => s.serviceKey !== action.serviceKey) }
    case 'ADD_DOCUMENT':
      if (state.documentFiles.find(d => d.name === action.doc.name)) return state
      return { ...state, documentFiles: [...state.documentFiles, action.doc] }
    case 'REMOVE_DOCUMENT':
      return { ...state, documentFiles: state.documentFiles.filter(d => d.name !== action.name) }
    case 'RESET':
      try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
      return INITIAL_STATE
    default:
      return state
  }
}

const STORAGE_KEY = 'glido_service_request_wizard'

function load(): ServiceRequestWizardState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL_STATE
    const saved = JSON.parse(raw) as Partial<ServiceRequestWizardState>
    if (saved.requestConfirmed) {
      sessionStorage.removeItem(STORAGE_KEY)
      return INITIAL_STATE
    }
    return { ...INITIAL_STATE, ...saved, submitting: false }
  } catch {
    return INITIAL_STATE
  }
}

interface ServiceRequestWizardContextValue {
  state: ServiceRequestWizardState
  dispatch: Dispatch<ServiceRequestWizardAction>
  canProceed: boolean
}

const ServiceRequestWizardContext = createContext<ServiceRequestWizardContextValue | null>(null)

export function ServiceRequestWizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* noop */ }
  }, [state])

  const canProceed = deriveCanProceed(state)

  return (
    <ServiceRequestWizardContext.Provider value={{ state, dispatch, canProceed }}>
      {children}
    </ServiceRequestWizardContext.Provider>
  )
}

export function useServiceRequestWizard() {
  const ctx = useContext(ServiceRequestWizardContext)
  if (!ctx) throw new Error('useServiceRequestWizard must be used inside ServiceRequestWizardProvider')
  return ctx
}

function deriveCanProceed(s: ServiceRequestWizardState): boolean {
  switch (s.step) {
    case 1: return s.mode !== null
    case 2: return s.serviceCategory !== null
    case 3: return s.selectedServices.length > 0
    case 4: {
      const uploaded = new Set(s.documentFiles.map(d => d.docType))
      const required = requiredDocTypesForServices(s.selectedServices.map(svc => svc.serviceKey))
      return required.every(t => uploaded.has(t))
    }
    case 5: return s.termsAccepted
    default: return false
  }
}
