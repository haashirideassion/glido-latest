import {
  createContext, useContext, useReducer, useEffect, useRef,
  type ReactNode, type Dispatch,
} from 'react'
import { todaySydney } from '@/lib/time'
import { getTenant } from '@/lib/db/tenants'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import type { TimeSlot } from '@/data/types'
import type { ShipmentLookupResult } from '@/lib/db/cfs-shipments'
import type { TenantRow } from '@/lib/db/tenants'

// Shared document file type used by both top-level and per-slot arrays
export type DocumentFile = {
  name: string
  size: number
  docType?: string
  storagePath: string | null
}

// Per-slot configuration — extends service/load type with independent date/time/details/docs
export interface SlotConfig {
  index:       number                        // 1-based
  serviceType: 'pickup' | 'dropoff' | null
  loadType:    'fcl' | 'lcl' | null
  // Per-slot date/time (multi-slot mode)
  selectedDate:      string
  selectedSlotId:    string | null
  selectedSlotLabel: string
  // Per-slot shipment details (multi-slot mode)
  hbl:              string
  containerNumber:  string
  containerSize:    string
  entryNumber:      string
  purpose:          string
  consolidator:     string
  bookingReference: string
  // ICS status from shipment lookup
  icsStatus:        string
  // Per-slot documents (multi-slot mode)
  documentFiles:    DocumentFile[]
  // Per-slot driver (multi-slot mode)
  driverName:          string
  driverPhone:         string
  vehicleRegistration: string
}

function getDefaultDateEarly(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' })
}

function makeSlotConfig(index: number): SlotConfig {
  return {
    index, serviceType: null, loadType: null,
    selectedDate: getDefaultDateEarly(), selectedSlotId: null, selectedSlotLabel: '',
    hbl: '', containerNumber: '', containerSize: '',
    entryNumber: '', purpose: '', consolidator: '', bookingReference: '',
    icsStatus: '',
    documentFiles: [],
    driverName: '', driverPhone: '', vehicleRegistration: '',
  }
}

function makeSlotConfigs(count: number): SlotConfig[] {
  return Array.from({ length: count }, (_, i) => makeSlotConfig(i + 1))
}

// Document requirement as stored in tenants.required_documents JSON array
export interface TenantDoc {
  id:        string
  name:      string
  required:  boolean
  fileTypes: string[]   // e.g. ['PDF', 'JPG']
  appliesTo: string[]   // e.g. ['pickup_lcl', 'dropoff_fcl']
  notes:     string
}

// Pricing-relevant subset of tenant config used by calcCharges
export interface TenantPricing {
  storage_rate_per_cbm:        number
  shrink_wrap_rate_per_pallet: number
  // Legacy 2-field fees (used as fallback)
  slot_fee_pickup:             number
  slot_fee_dropoff:            number
  // Per-combo fees (stored in working_hours.pricing)
  slot_fee_pickup_lcl:         number
  slot_fee_pickup_fcl:         number
  slot_fee_dropoff_lcl:        number
  slot_fee_dropoff_fcl:        number
  gst_rate:                    number
  gst_enabled:                 boolean
  fcl_free_days:               number   // stored in working_hours.pricing
  lcl_free_days:               number   // stored in working_hours.pricing
  slot_duration_min:           number
  max_bookings_per_slot:       number
  hold_duration_min:           number   // from tenants.slot_hold_duration_min
}

function extractPricing(t: TenantRow): TenantPricing {
  const p = (t.working_hours as any)?.pricing ?? {}
  const pickupFallback  = Number(t.slot_fee_pickup)  || 5.00
  const dropoffFallback = Number(t.slot_fee_dropoff) || 5.00
  return {
    storage_rate_per_cbm:        Number(t.storage_rate_per_cbm)        || 8.50,
    shrink_wrap_rate_per_pallet: Number(t.shrink_wrap_rate_per_pallet) || 12.00,
    slot_fee_pickup:             pickupFallback,
    slot_fee_dropoff:            dropoffFallback,
    slot_fee_pickup_lcl:         Number(p.slot_fee_pickup_lcl)    || pickupFallback,
    slot_fee_pickup_fcl:         Number(p.slot_fee_pickup_fcl)    || pickupFallback,
    slot_fee_dropoff_lcl:        Number(p.slot_fee_dropoff_lcl)   || dropoffFallback,
    slot_fee_dropoff_fcl:        Number(p.slot_fee_dropoff_fcl)   || dropoffFallback,
    gst_rate:                    Number(t.gst_rate)                    || 10,
    gst_enabled:                 t.gst_enabled                        ?? true,
    fcl_free_days:               Number(p.fcl_free_days) || 7,
    lcl_free_days:               Number(p.lcl_free_days) || 3,
    slot_duration_min:           Number(t.slot_duration_min)           || 60,
    max_bookings_per_slot:       Number(t.max_bookings_per_slot)       || 5,
    hold_duration_min:           Number(t.slot_hold_duration_min)      || 10,
  }
}

export interface WizardState {
  step: number                          // 1-7; 8 = confirmed
  slotCount: number
  slotConfigs: SlotConfig[]             // per-slot service + load type (length = slotCount)
  // Step 1 — booker info
  guestName: string
  guestEmail: string
  guestPhone: string
  companyName: string
  // Step 2 — serviceType mirrors slotConfigs[0].serviceType for backward compat
  serviceType: 'pickup' | 'dropoff' | null
  // Step 3 — loadType mirrors slotConfigs[0].loadType for backward compat
  loadType: 'fcl' | 'lcl' | null
  // Step 4 — slot selection
  selectedDate: string                  // YYYY-MM-DD
  slots: TimeSlot[]
  slotsLoading: boolean
  selectedSlotId: string | null
  selectedSlotLabel: string             // e.g. "08:00 – 09:00"
  holdSeconds: number                   // 600 = 10 min; 0 = no active hold
  // Step 5 — shipment details
  hbl: string
  containerNumber: string
  shipmentData: ShipmentLookupResult | null
  shipmentFetched: boolean
  shipmentLoading: boolean
  shipmentError: string | null
  // Step 5 — new load-information fields
  containerSize: string        // FCL combos
  entryNumber: string          // Drop-off combos
  purpose: string              // Drop-off combos (dropdown)
  consolidator: string         // Dropoff + LCL only
  bookingReference: string     // Dropoff + LCL only
  // Step 5 — driver (person physically visiting)
  driverName: string
  driverPhone: string
  vehicleRegistration: string
  // Step 5 — drop-off specific
  cargoDescription: string
  estimatedWeightKg: string
  estimatedVolumeCbm: string
  destinationPort: string
  // Step 6 — documents (top-level used for single-slot; per-slot stored in slotConfigs[i].documentFiles)
  documentFiles: DocumentFile[]
  // Step 7 — payment
  paymentMethod: 'card' | 'eft' | 'compay'
  cardNumber: string
  cardExpiry: string
  cardCvv: string
  cardName: string
  termsAccepted: boolean
  eftConfirmed: boolean
  // Submission
  submitting: boolean
  submitError: string | null
  confirmationRef: string | null        // first ref (backward compat)
  confirmationRefs: Array<{ ref: string; slotLabel: string; date: string }>  // one per slot, carries time info
  bookingConfirmed: boolean             // true after successful submission — suppresses leave-page blocker
  // Step 5 — active slot tab index (lifted so BookingWizard footer can react to it)
  step5ActiveSlot: number
  // Tenant pricing config (loaded on wizard mount)
  tenantPricing: TenantPricing | null
  // Tenant document requirements (loaded on wizard mount)
  tenantDocs: TenantDoc[] | null
}

export type WizardAction =
  | { type: 'SET'; field: keyof WizardState; value: WizardState[keyof WizardState] }
  | { type: 'SET_SLOT_CONFIG'; slotIndex: number; field: 'serviceType' | 'loadType'; value: string }
  | { type: 'SET_SLOT_DETAIL'; slotIndex: number; field: string; value: any }
  | { type: 'SELECT_DATE'; date: string }
  | { type: 'SET_SLOTS'; slots: TimeSlot[]; loading: boolean }
  | { type: 'SELECT_SLOT'; slotId: string; label: string }
  | { type: 'SET_SHIPMENT'; data: ShipmentLookupResult | null; loading: boolean; error: string | null; fetched: boolean }
  | { type: 'ADD_DOCUMENT'; doc: { name: string; size: number; docType?: string; storagePath: string | null } }
  | { type: 'REMOVE_DOCUMENT'; name: string }
  | { type: 'TICK_HOLD' }
  | { type: 'CLEAR_HOLD' }
  | { type: 'STOP_HOLD_TIMER' }   // stop countdown without clearing the selected slot
  | { type: 'DESELECT_SLOT' }
  | { type: 'PATCH_SLOT_AVAILABILITY'; slots: TimeSlot[] }
  | { type: 'RESET' }

const DEFAULT_HOLD_MIN = 10   // fallback when tenant config not yet loaded

function getDefaultDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' })
}

export const INITIAL_STATE: WizardState = {
  step: 1,
  slotCount: 1,
  slotConfigs: makeSlotConfigs(1),
  guestName: '', guestEmail: '', guestPhone: '', companyName: '',
  serviceType: null,
  loadType: null,
  selectedDate: getDefaultDate(),
  slots: [], slotsLoading: false,
  selectedSlotId: null, selectedSlotLabel: '',
  holdSeconds: 0,
  hbl: '', containerNumber: '',
  shipmentData: null, shipmentFetched: false, shipmentLoading: false, shipmentError: null,
  containerSize: '', entryNumber: '', purpose: '', consolidator: '', bookingReference: '',
  driverName: '', driverPhone: '', vehicleRegistration: '',
  cargoDescription: '', estimatedWeightKg: '', estimatedVolumeCbm: '', destinationPort: '',
  documentFiles: [],
  paymentMethod: 'eft',
  cardNumber: '', cardExpiry: '', cardCvv: '', cardName: '',
  termsAccepted: false, eftConfirmed: false,
  submitting: false, submitError: null,
  confirmationRef: null,
  confirmationRefs: [],
  bookingConfirmed: false,
  step5ActiveSlot: 0,
  tenantPricing: null,
  tenantDocs: null,
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET': {
      // When slotCount changes, rebuild slotConfigs preserving existing entries
      if (action.field === 'slotCount') {
        const newCount = action.value as number
        const existing = state.slotConfigs
        // Fix 6: merge existing slot data onto a fresh makeSlotConfig so new fields always exist
        const newConfigs: SlotConfig[] = Array.from({ length: newCount }, (_, i) => {
          const ex = existing[i]
          return ex ? { ...makeSlotConfig(i + 1), ...ex, index: i + 1 } : makeSlotConfig(i + 1)
        })
        return { ...state, slotCount: newCount, slotConfigs: newConfigs }
      }
      return { ...state, [action.field]: action.value }
    }
    case 'SET_SLOT_CONFIG': {
      const newConfigs = state.slotConfigs.map(cfg =>
        cfg.index === action.slotIndex
          ? { ...cfg, [action.field]: action.value }
          : cfg
      )
      // Mirror slot 0 values into top-level serviceType/loadType for backward compat
      const first = newConfigs[0]
      return {
        ...state,
        slotConfigs: newConfigs,
        serviceType: first?.serviceType ?? state.serviceType,
        loadType:    first?.loadType    ?? state.loadType,
      }
    }
    case 'SET_SLOT_DETAIL': {
      // Fix 5: spread existing slot (preserving all fields including documentFiles) then apply update
      const newConfigs = state.slotConfigs.map(cfg =>
        cfg.index === action.slotIndex
          ? { ...makeSlotConfig(cfg.index), ...cfg, [action.field]: action.value }
          : cfg
      )
      return { ...state, slotConfigs: newConfigs }
    }
    case 'SELECT_DATE':
      return {
        ...state,
        selectedDate: action.date,
        selectedSlotId: null,
        selectedSlotLabel: '',
        // Only reset the hold timer if no slot had been selected yet — prevents a redundant
        // SELECT_DATE dispatch from killing an active hold the user already established
        holdSeconds: state.selectedSlotId ? state.holdSeconds : 0,
        slots: [],
        slotsLoading: true,
      }
    case 'SET_SLOTS':
      return { ...state, slots: action.slots, slotsLoading: action.loading }
    case 'SELECT_SLOT':
      console.log('[SELECT_SLOT fired] setting holdSeconds to:', (state.tenantPricing?.hold_duration_min ?? DEFAULT_HOLD_MIN) * 60)
      return { ...state, selectedSlotId: action.slotId, selectedSlotLabel: action.label,
        holdSeconds: (state.tenantPricing?.hold_duration_min ?? DEFAULT_HOLD_MIN) * 60 }
    case 'SET_SHIPMENT':
      return { ...state, shipmentData: action.data, shipmentLoading: action.loading, shipmentError: action.error, shipmentFetched: action.fetched }
    case 'ADD_DOCUMENT':
      if (state.documentFiles.find(d => d.name === action.doc.name)) return state
      return { ...state, documentFiles: [...state.documentFiles, action.doc] }
    case 'REMOVE_DOCUMENT':
      return { ...state, documentFiles: state.documentFiles.filter(d => d.name !== action.name) }
    case 'TICK_HOLD':
      return { ...state, holdSeconds: Math.max(0, state.holdSeconds - 1) }
    case 'CLEAR_HOLD':
      return { ...state, holdSeconds: 0, selectedSlotId: null, selectedSlotLabel: '' }
    case 'STOP_HOLD_TIMER':
      // Sets holdSeconds to -1 (sentinel: "deliberately stopped") without nulling selectedSlotId.
      // -1 means: timer is inactive (holdActive = false) but slot is still held for submission.
      // The expiry watcher only fires on holdSeconds === 0, so it won't trigger the expired modal.
      return { ...state, holdSeconds: -1 }
    case 'DESELECT_SLOT':
      return { ...state, holdSeconds: 0, selectedSlotId: null, selectedSlotLabel: '' }
    case 'RESET':
      try { sessionStorage.removeItem('glido_wizard_v2') } catch { /* noop */ }
      return { ...INITIAL_STATE, selectedDate: getDefaultDate() }
    default:
      return state
  }
}

const STORAGE_KEY = 'glido_wizard_v2'

function load(): WizardState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL_STATE
    const saved = JSON.parse(raw) as Partial<WizardState>
    // Never restore a confirmed state across sessions — always start fresh
    if (saved.step === 8 || saved.bookingConfirmed) {
      sessionStorage.removeItem(STORAGE_KEY)
      return INITIAL_STATE
    }
    return { ...INITIAL_STATE, ...saved, holdSeconds: saved.holdSeconds ?? 0, submitting: false }
  } catch {
    return INITIAL_STATE
  }
}

interface WizardContextValue {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  canProceed: boolean
}

const WizardContext = createContext<WizardContextValue | null>(null)

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  // Persist to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* noop */ }
  }, [state])

  // Fetch tenant config once on mount — pricing for calcCharges + docs for Step 6
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        dispatch({ type: 'SET', field: 'tenantPricing', value: extractPricing(tenant) })
        const raw = tenant.required_documents
        if (Array.isArray(raw) && raw.length > 0) {
          dispatch({ type: 'SET', field: 'tenantDocs', value: raw as unknown as TenantDoc[] })
        }
      })
      .catch(() => { /* keep null — fallbacks apply */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const canProceed = deriveCanProceed(state)

  return (
    <WizardContext.Provider value={{ state, dispatch, canProceed }}>
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard() {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used inside WizardProvider')
  return ctx
}

function deriveCanProceed(s: WizardState): boolean {
  switch (s.step) {
    case 1: {
      const nameOk  = s.guestName.trim().length >= 2
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.guestEmail.trim())
      // If email is pre-populated from auth (non-empty), require it valid; guest must enter one
      return nameOk && emailOk
    }
    case 2: return s.slotConfigs.length > 0 && s.slotConfigs.every(c => c.serviceType !== null)
    case 3: return s.slotConfigs.length > 0 && s.slotConfigs.every(c => c.loadType !== null)
    case 4:
      if (s.slotCount === 1) return !!s.selectedSlotId
      return s.slotConfigs.every(c => !!(c.selectedSlotId ?? null))
    case 5: {
      if (s.slotCount === 1) {
        const driver = !!s.driverName.trim()
        const rego   = !!s.vehicleRegistration.trim()
        if (!driver || !rego) return false
        if (s.serviceType === 'pickup'  && s.loadType === 'lcl')
          return !!s.containerNumber.trim() && !!s.hbl.trim()
        if (s.serviceType === 'pickup'  && s.loadType === 'fcl')
          return !!s.containerNumber.trim() && !!s.containerSize.trim()
        if (s.serviceType === 'dropoff' && s.loadType === 'lcl')
          return !!s.bookingReference.trim() && !!s.consolidator.trim() && !!s.purpose.trim()
        if (s.serviceType === 'dropoff' && s.loadType === 'fcl')
          return !!s.containerNumber.trim() && !!s.containerSize.trim() && !!s.purpose.trim()
        return true
      }
      // Multi-slot: each slot must have its own driver + combo fields
      return s.slotConfigs.every(cfg => {
        if (!(cfg.driverName?.trim()) || !(cfg.vehicleRegistration?.trim())) return false
        const svc = cfg.serviceType; const lt = cfg.loadType
        if (svc === 'pickup'  && lt === 'lcl')   return !!(cfg.containerNumber?.trim()) && !!(cfg.hbl?.trim())
        if (svc === 'pickup'  && lt === 'fcl')   return !!(cfg.containerNumber?.trim()) && !!(cfg.containerSize?.trim())
        if (svc === 'dropoff' && lt === 'lcl')   return !!(cfg.bookingReference?.trim()) && !!(cfg.consolidator?.trim()) && !!(cfg.purpose?.trim())
        if (svc === 'dropoff' && lt === 'fcl')   return !!(cfg.containerNumber?.trim()) && !!(cfg.containerSize?.trim()) && !!(cfg.purpose?.trim())
        return true
      })
    }
    case 6: {
      // Helper: check one set of doc files against tenant/hardcoded requirements for a combo
      // Fix 2: guard files with ?? [] in case documentFiles is undefined (old sessionStorage)
      function slotDocsOk(files: DocumentFile[] | undefined, serviceType: string | null, loadType: string | null): boolean {
        const safeFiles = files ?? []
        const uploaded = new Set(safeFiles.map(d => d.docType).filter(Boolean))
        const comboCode = `${serviceType}_${loadType}`
        if (s.tenantDocs && s.tenantDocs.length > 0) {
          const required = s.tenantDocs.filter(d =>
            d.required && (!d.appliesTo || d.appliesTo.length === 0 || d.appliesTo.includes(comboCode))
          )
          return required.every(d => uploaded.has(d.id))
        }
        const has = (t: string) => uploaded.has(t)
        if (serviceType === 'pickup'  && loadType === 'lcl')   return has('delivery_order')
        if (serviceType === 'dropoff' && loadType === 'lcl')   return has('interim_receipt') && has('booking_confirmation')
        if (serviceType === 'pickup'  && loadType === 'fcl')   return has('cartage_advice') && has('delivery_order')
        if (serviceType === 'dropoff' && loadType === 'fcl')   return has('cartage_advice') && has('delivery_order')
        return safeFiles.length > 0
      }
      if (s.slotCount === 1) {
        const svc = s.slotConfigs?.[0]?.serviceType ?? s.serviceType
        const lt  = s.slotConfigs?.[0]?.loadType    ?? s.loadType
        return slotDocsOk(s.documentFiles, svc, lt)
      }
      return s.slotConfigs.every(cfg => slotDocsOk(cfg.documentFiles, cfg.serviceType, cfg.loadType))
    }
    case 7: {
      if (!s.termsAccepted) return false
      if (s.paymentMethod === 'eft')    return s.eftConfirmed
      if (s.paymentMethod === 'compay') return true   // ComPay: no extra fields needed
      // Card: require valid name, number, expiry, cvv
      const digits = s.cardNumber.replace(/\s/g, '')
      const isAmex = digits.startsWith('34') || digits.startsWith('37')
      const validNum    = isAmex ? digits.length === 15 : digits.length === 16
      const exParts     = s.cardExpiry.split('/')
      const validExpiry = exParts.length === 2 && /^\d{2}$/.test(exParts[0]) && /^\d{2}$/.test(exParts[1])
      const validCvv    = isAmex ? s.cardCvv.length === 4 : s.cardCvv.length === 3
      const validName   = s.cardName.trim().length >= 2
      return validNum && validExpiry && validCvv && validName
    }
    default: return false
  }
}

export function useHoldTimer(onExpire?: () => void) {
  const { state, dispatch } = useWizard()
  const prevSeconds = useRef(state.holdSeconds)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire  // keep ref fresh without re-running effects

  // Tick every second while a hold is active
  useEffect(() => {
    if (state.holdSeconds <= 0) return
    const id = setInterval(() => dispatch({ type: 'TICK_HOLD' }), 1000)
    return () => clearInterval(id)
  }, [state.holdSeconds > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Expiry watcher — fires once when countdown reaches zero from a positive value.
  // Guard: if selectedSlotId is already null the drop to zero was a manual deselect,
  // not a natural expiry — skip the modal in that case.
  useEffect(() => {
    if (state.holdSeconds === 0 && prevSeconds.current > 0 && state.selectedSlotId !== null) {
      dispatch({ type: 'CLEAR_HOLD' })
      onExpireRef.current?.()
    }
    prevSeconds.current = state.holdSeconds
  }, [state.holdSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  const mins = String(Math.floor(state.holdSeconds / 60)).padStart(2, '0')
  const secs = String(state.holdSeconds % 60).padStart(2, '0')
  return {
    holdSeconds: state.holdSeconds,
    holdActive: state.holdSeconds > 0,
    holdLabel: `${mins}:${secs}`,
    expiring: state.holdSeconds > 0 && state.holdSeconds <= 60,
  }
}

export function calcCharges(s: WizardState) {
  const sd = s.shipmentData
  const tp = s.tenantPricing

  // Rates — use live tenant config with hardcoded fallbacks
  const primaryService = s.slotConfigs[0]?.serviceType ?? s.serviceType
  const primaryLoad    = s.slotConfigs[0]?.loadType    ?? s.loadType
  const storageRate    = tp?.storage_rate_per_cbm        ?? 8.50
  const shrinkWrapRate = tp?.shrink_wrap_rate_per_pallet ?? 12.00
  // Per-combo slot fee — each slot independently looks up its own combo fee
  const comboFee = (svc: string | null, ld: string | null): number => {
    const s_ = svc ?? 'pickup'; const l_ = ld ?? 'lcl'
    if (tp) {
      if (s_ === 'pickup'  && l_ === 'lcl')   return tp.slot_fee_pickup_lcl
      if (s_ === 'pickup'  && l_ === 'fcl')   return tp.slot_fee_pickup_fcl
      if (s_ === 'dropoff' && l_ === 'lcl')   return tp.slot_fee_dropoff_lcl
      if (s_ === 'dropoff' && l_ === 'fcl')   return tp.slot_fee_dropoff_fcl
    }
    return s_ === 'pickup' ? 5.00 : 5.00
  }
  const slotFee  = s.slotConfigs.reduce((sum, cfg) => sum + comboFee(cfg.serviceType, cfg.loadType), 0)
  const gstRate  = (tp?.gst_enabled ?? true) ? ((tp?.gst_rate ?? 10) / 100) : 0
  const freeDays = primaryLoad === 'fcl' ? (tp?.fcl_free_days ?? 7) : (tp?.lcl_free_days ?? 3)

  // Total days since storage start; subtract free period
  const rawDays = sd?.storageStartDate
    ? Math.max(0, Math.ceil((new Date(s.selectedDate).getTime() - new Date(sd.storageStartDate).getTime()) / 86400000))
    : 0
  const storageDays    = Math.max(0, rawDays - freeDays)
  const storageCharge    = sd?.volumeCbm ? sd.volumeCbm * storageRate * storageDays : 0
  const shrinkWrapCharge = sd?.palletCount ? sd.palletCount * shrinkWrapRate : 0
  const subtotal         = storageCharge + shrinkWrapCharge + slotFee
  const gst              = subtotal * gstRate
  const total            = subtotal + gst

  return { storageCharge, shrinkWrapCharge, slotFee, subtotal, gst, total, storageDays }
}
