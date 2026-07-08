import {
  createContext, useContext, useReducer, useEffect, useCallback,
  type ReactNode, type Dispatch,
} from 'react'
import { getBookingByRef, getBookingsByGroupRef, checkInBooking } from '@/lib/db/bookings'
import type { Booking } from '@/data/types'
import { createWalkIn } from '@/lib/db/walk-ins'
import { createCheckinRecord } from '@/lib/db/checkin-records'
import { playSuccessTone, playErrorTone } from '@/lib/kioskSound'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import type { WalkInPurpose } from '@/data/types'

export type KioskScreen =
  | 'welcome' | 'lookup' | 'scan' | 'confirm' | 'consent'
  | 'idscan' | 'arrived' | 'purpose' | 'walkin' | 'screensaver'
  | 'slot-picker'

export interface LookupResult {
  found: boolean
  bookingId: string
  ref: string
  name: string
  driverName: string
  slot: string
  service: string
  loadType: string
  status: string
}

export interface LicenceData {
  name: string
  licenceNo: string
  dob: string
  expiry: string
  address: string
  nameMatchResult: 'matched' | 'warning' | 'mismatch' | 'not_checked'
  nameMatchScore: number
}

export interface KioskState {
  currentScreen: KioskScreen
  referenceInput: string
  lookupResult: LookupResult | null
  lookupError: boolean
  lookupLoading: boolean
  lookupBlockMessage: string | null
  slotPickerBookings: Booking[]   // multiple slots sharing a group ref
  licenceData: LicenceData | null
  licenceExpired: boolean
  arrivedCountdown: number
  arrivedVisitorName: string
  walkInPurpose: WalkInPurpose | null
  walkInName: string
  walkInPhone: string
  walkInCompany: string
  walkInVehicle: string
  walkInBLRef: string
  walkInPersonVisited: string
  walkInReason: string
}

type KioskAction =
  | { type: 'GO_TO'; screen: KioskScreen }
  | { type: 'SET_REF_INPUT'; value: string }
  | { type: 'SET_LOOKUP'; result: LookupResult | null; error: boolean; loading: boolean; blockMessage?: string | null }
  | { type: 'SET_SLOT_PICKER'; bookings: Booking[] }
  | { type: 'SET_LICENCE'; data: LicenceData | null; expired: boolean }
  | { type: 'SET_ARRIVED_VISITOR'; name: string }
  | { type: 'SET_COUNTDOWN'; value: number }
  | { type: 'TICK_COUNTDOWN' }
  | { type: 'SET_WALK_IN_FIELD'; field: keyof Pick<KioskState, 'walkInPurpose' | 'walkInName' | 'walkInPhone' | 'walkInCompany' | 'walkInVehicle' | 'walkInBLRef' | 'walkInPersonVisited' | 'walkInReason'>; value: string | WalkInPurpose }
  | { type: 'RESET_FLOW' }

const INITIAL: KioskState = {
  currentScreen: 'welcome',
  referenceInput: '', lookupResult: null, lookupError: false, lookupLoading: false, lookupBlockMessage: null,
  slotPickerBookings: [],
  licenceData: null, licenceExpired: false,
  arrivedCountdown: 0, arrivedVisitorName: '',
  walkInPurpose: null, walkInName: '', walkInPhone: '', walkInCompany: '', walkInVehicle: '',
  walkInBLRef: '', walkInPersonVisited: '', walkInReason: '',
}

function reducer(state: KioskState, action: KioskAction): KioskState {
  switch (action.type) {
    case 'GO_TO':         return { ...state, currentScreen: action.screen }
    case 'SET_REF_INPUT': return { ...state, referenceInput: action.value, lookupError: false, lookupBlockMessage: null }
    case 'SET_LOOKUP':      return { ...state, lookupResult: action.result, lookupError: action.error, lookupLoading: action.loading, lookupBlockMessage: action.blockMessage ?? null }
    case 'SET_SLOT_PICKER': return { ...state, slotPickerBookings: action.bookings }
    case 'SET_LICENCE':   return { ...state, licenceData: action.data, licenceExpired: action.expired }
    case 'SET_ARRIVED_VISITOR': return { ...state, arrivedVisitorName: action.name }
    case 'SET_COUNTDOWN':       return { ...state, arrivedCountdown: action.value }
    case 'TICK_COUNTDOWN':      return { ...state, arrivedCountdown: Math.max(0, state.arrivedCountdown - 1) }
    case 'SET_WALK_IN_FIELD':    return { ...state, [action.field]: action.value }
    case 'RESET_FLOW': return { ...INITIAL }
    default: return state
  }
}

// Jaro-Winkler for name matching
function jaroWinkler(s1: string, s2: string): number {
  if (!s1 || !s2) return 0
  s1 = s1.toLowerCase().trim(); s2 = s2.toLowerCase().trim()
  if (s1 === s2) return 1
  const len1 = s1.length, len2 = s2.length
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)
  const s1m = new Array(len1).fill(false), s2m = new Array(len2).fill(false)
  let matches = 0, transpositions = 0
  for (let i = 0; i < len1; i++) {
    for (let j = Math.max(0, i - matchDist); j < Math.min(i + matchDist + 1, len2); j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue
      s1m[i] = s2m[j] = true; matches++; break
    }
  }
  if (!matches) return 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1m[i]) continue
    while (!s2m[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] !== s2[i]) break; prefix++
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

function getStatusBlockMessage(status: string): string | null {
  switch (status) {
    case 'checked_in': return "You're already checked in. Please proceed to the reception area."
    case 'completed':  return 'This booking has already been completed.'
    case 'cancelled':  return 'This booking has been cancelled. Please contact reception for assistance.'
    default:           return null
  }
}

interface KioskContextValue {
  state: KioskState
  dispatch: Dispatch<KioskAction>
  goTo: (screen: KioskScreen) => void
  startBookingLookup: () => void
  startVisitingFlow: () => void
  performLookup: () => void
  confirmBooking: () => void
  acceptConsent: () => void
  simulateScan: () => void
  completeCheckIn: () => void
  submitWalkIn: () => void
  wakeFromScreensaver: () => void
}

const KioskContext = createContext<KioskContextValue | null>(null)

export function KioskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const goTo = useCallback((screen: KioskScreen) => dispatch({ type: 'GO_TO', screen }), [])

  const resetFlow = useCallback(() => dispatch({ type: 'RESET_FLOW' }), [])

  const startBookingLookup = useCallback(() => { resetFlow(); dispatch({ type: 'GO_TO', screen: 'lookup' }) }, [resetFlow])
  const startVisitingFlow  = useCallback(() => { resetFlow(); dispatch({ type: 'GO_TO', screen: 'purpose' }) }, [resetFlow])

  const performLookup = useCallback(async () => {
    const ref = state.referenceInput.trim().toUpperCase()
    if (!ref) return
    dispatch({ type: 'SET_LOOKUP', result: null, error: false, loading: true })
    try {
      // 1. Try by reference_number (exact slot ref, e.g. GLD-2026-AB3XY-S1)
      let booking = await getBookingByRef(ref)

      if (!booking) {
        // 2. Fall back: try as a group_reference (master ref, e.g. GLD-2026-AB3XY)
        const groupSlots = await getBookingsByGroupRef(ref)
        if (groupSlots.length === 0) {
          dispatch({ type: 'SET_LOOKUP', result: null, error: true, loading: false })
          playErrorTone()
          return
        }
        const activeSlots = groupSlots.filter(s => s.status === 'scheduled')
        const candidates  = activeSlots.length > 0 ? activeSlots : groupSlots
        if (candidates.length > 1) {
          dispatch({ type: 'SET_LOOKUP', result: null, error: false, loading: false })
          dispatch({ type: 'SET_SLOT_PICKER', bookings: candidates })
          dispatch({ type: 'GO_TO', screen: 'slot-picker' })
          return
        }
        // Only one slot under this group ref — treat it as a direct match
        booking = candidates[0]
      }

      // Check if this booking belongs to a multi-slot group (found via slot ref)
      const groupRef = booking.groupReference
      if (groupRef) {
        const groupSlots = await getBookingsByGroupRef(groupRef)
        const activeSlots = groupSlots.filter(s => s.status === 'scheduled')
        if (activeSlots.length > 1) {
          dispatch({ type: 'SET_LOOKUP', result: null, error: false, loading: false })
          dispatch({ type: 'SET_SLOT_PICKER', bookings: activeSlots })
          dispatch({ type: 'GO_TO', screen: 'slot-picker' })
          return
        }
      }

      // Block already-processed bookings
      const blockMsg = getStatusBlockMessage(booking.status)
      if (blockMsg) {
        dispatch({ type: 'SET_LOOKUP', result: null, error: true, loading: false, blockMessage: blockMsg })
        playErrorTone()
        return
      }

      dispatch({
        type: 'SET_LOOKUP',
        loading: false, error: false,
        result: {
          found: true,
          bookingId: booking.id,
          ref: booking.referenceNumber,
          name: booking.driverName,
          driverName: booking.driverName,
          slot: `${booking.slotDate} ${booking.slotStartTime} – ${booking.slotEndTime}`,
          service: booking.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off',
          loadType: booking.loadType.toUpperCase(),
          status: booking.status,
        },
      })
      playSuccessTone()
      dispatch({ type: 'GO_TO', screen: 'confirm' })
    } catch {
      dispatch({ type: 'SET_LOOKUP', result: null, error: true, loading: false })
      playErrorTone()
    }
  }, [state.referenceInput])

  const confirmBooking = useCallback(() => goTo('consent'), [goTo])
  const acceptConsent  = useCallback(() => goTo('idscan'),  [goTo])

  const simulateScan = useCallback(() => {
    const isWalkIn     = !state.lookupResult
    // For walk-ins (yard visits), use the name they entered — no booking to mismatch against
    const scannedName  = isWalkIn ? (state.walkInName.trim() || 'Visitor') : (state.lookupResult?.driverName ?? 'Carlos Mendez')
    const bookingName  = isWalkIn ? scannedName : (state.lookupResult?.driverName ?? '')
    const score        = jaroWinkler(scannedName, bookingName)
    const matchResult: LicenceData['nameMatchResult'] = isWalkIn ? 'matched' : (score >= 0.85 ? 'matched' : score >= 0.60 ? 'warning' : 'mismatch')
    const expiryDate   = new Date(2028, 5, 12)
    const expired      = expiryDate < new Date()
    dispatch({ type: 'SET_LICENCE', expired, data: {
      name: scannedName, licenceNo: 'NSW8832145',
      dob: '12/06/1983', expiry: '12/06/2028',
      address: '18 Harbour St, Sydney NSW 2000',
      nameMatchResult: matchResult, nameMatchScore: Math.round(score * 100),
    }})
    if (matchResult === 'mismatch' || expired) playErrorTone(); else playSuccessTone()
  }, [state.lookupResult, state.walkInName])

  const completeCheckIn = useCallback(async () => {
    const ld = state.licenceData
    const bookingId = state.lookupResult?.bookingId
    dispatch({ type: 'SET_ARRIVED_VISITOR', name: ld?.name ?? state.lookupResult?.name ?? 'Visitor' })

    if (bookingId) {
      // Mark booking checked-in — await so status is persisted before we navigate
      try { await checkInBooking(bookingId) }
      catch (err) { console.error('[kiosk] checkInBooking failed', err) }

      // Write audit record with licence scan data
      createCheckinRecord({
        bookingId,
        tenantId:          DEFAULT_TENANT_ID,
        isWalkIn:          false,
        licenceName:       ld?.name            ?? undefined,
        licenceNumber:     ld?.licenceNo       ?? undefined,
        licenceDob:        ld?.dob             ?? undefined,
        licenceExpiry:     ld?.expiry          ?? undefined,
        licenceAddress:    ld?.address         ?? undefined,
        nameMatchResult:   ld?.nameMatchResult ?? 'not_checked',
        nameMatchScore:    ld?.nameMatchScore  ?? undefined,
        expiryValid:       !state.licenceExpired,
      }).catch(() => {})
    } else if (state.walkInPurpose === 'visit_yard') {
      // Yard walk-in completed ID scan — submit walk-in record with licence data included
      const licenceNote = ld ? `Licence: ${ld.licenceNo} | DOB: ${ld.dob}` : ''
      const visitorName = state.walkInName.trim() || ld?.name || 'Visitor'
      let walkInId: string | undefined
      try {
        const wi = await createWalkIn({
          tenantId: DEFAULT_TENANT_ID,
          purpose: 'visit_yard',
          visitorName,
          companyName: state.walkInCompany.trim() || undefined,
          personBeingVisited: state.walkInPersonVisited.trim() || undefined,
          reason: [state.walkInReason, licenceNote].filter(Boolean).join(' | ') || undefined,
          licenceCaptured: !!ld,
        })
        walkInId = wi?.id
      } catch (err) { console.error('[kiosk] createWalkIn failed', err) }
      // Write audit record for yard walk-in so Identity Check card renders in VisitorDetailPage
      createCheckinRecord({
        tenantId:          DEFAULT_TENANT_ID,
        walkInId,
        isWalkIn:          true,
        walkInPurpose:     'visit_yard',
        visitPersonName:   state.walkInPersonVisited.trim() || undefined,
        licenceName:       ld?.name            ?? undefined,
        licenceNumber:     ld?.licenceNo       ?? undefined,
        licenceDob:        ld?.dob             ?? undefined,
        licenceExpiry:     ld?.expiry          ?? undefined,
        licenceAddress:    ld?.address         ?? undefined,
        nameMatchResult:   ld?.nameMatchResult ?? 'not_checked',
        nameMatchScore:    ld?.nameMatchScore  ?? undefined,
        expiryValid:       !state.licenceExpired,
      }).catch((err: any) => console.error('[kiosk] createCheckinRecord failed', err))
    }
    goTo('arrived')
  }, [state.licenceData, state.lookupResult, state.walkInPurpose, state.walkInName, state.walkInCompany, state.walkInPersonVisited, state.walkInReason, state.licenceExpired, goTo])

  const submitWalkIn = useCallback(async () => {
    if (!state.walkInName.trim()) return
    dispatch({ type: 'SET_ARRIVED_VISITOR', name: state.walkInName.trim() })
    // Build reason string — include licence data for yard visits if scanned
    const licenceNote = state.walkInPurpose === 'visit_yard' && state.licenceData
      ? `Licence: ${state.licenceData.licenceNo} | DOB: ${state.licenceData.dob}`
      : ''
    const isOfficeOrYard = state.walkInPurpose === 'visit_office' || state.walkInPurpose === 'visit_yard'
    createWalkIn({
      tenantId: DEFAULT_TENANT_ID,
      purpose: state.walkInPurpose ?? 'visit_person',
      visitorName: state.walkInName.trim(),
      // Office/yard visitors give a company name instead of a phone number
      contactNumber: isOfficeOrYard ? undefined : (state.walkInPhone.trim() || undefined),
      companyName: isOfficeOrYard ? (state.walkInCompany.trim() || undefined) : undefined,
      personBeingVisited: state.walkInPersonVisited.trim() || undefined,
      reason: [state.walkInReason, state.walkInVehicle ? `Vehicle: ${state.walkInVehicle}` : '', state.walkInBLRef ? `B/L: ${state.walkInBLRef}` : '', licenceNote].filter(Boolean).join(' | ') || undefined,
      licenceCaptured: !!state.licenceData,
    }).catch(() => {})
    goTo('arrived')
  }, [state, goTo])

  const wakeFromScreensaver = useCallback(() => {
    if (state.currentScreen === 'screensaver') { resetFlow(); goTo('welcome') }
  }, [state.currentScreen, resetFlow, goTo])

  // Arrived countdown — initialise to 10 then tick every second
  useEffect(() => {
    if (state.currentScreen !== 'arrived') return
    dispatch({ type: 'SET_COUNTDOWN', value: 10 })
    const id = setInterval(() => {
      dispatch({ type: 'TICK_COUNTDOWN' })
    }, 1000)
    // After 11 s (10 ticks + 1 buffer) reset to welcome
    const reset = setTimeout(() => {
      clearInterval(id)
      dispatch({ type: 'RESET_FLOW' })
    }, 11000)
    return () => { clearInterval(id); clearTimeout(reset) }
  }, [state.currentScreen]) // eslint-disable-line react-hooks/exhaustive-deps

  // (empty placeholder removed)
  useEffect(() => {
    if (state.currentScreen === 'arrived') {
    }
  }, [state.currentScreen])

  // Idle screensaver
  useEffect(() => {
    const noIdle = ['welcome', 'screensaver', 'arrived']
    let idle = 0
    const reset = () => { idle = 0 }
    const id = setInterval(() => {
      if (noIdle.includes(state.currentScreen)) { idle = 0; return }
      idle++
      if (idle >= 60) { dispatch({ type: 'GO_TO', screen: 'screensaver' }); idle = 0 }
    }, 1000)
    document.addEventListener('mousemove', reset)
    document.addEventListener('touchstart', reset)
    document.addEventListener('keydown', reset)
    document.addEventListener('click', reset)
    return () => {
      clearInterval(id)
      document.removeEventListener('mousemove', reset)
      document.removeEventListener('touchstart', reset)
      document.removeEventListener('keydown', reset)
      document.removeEventListener('click', reset)
    }
  }, [state.currentScreen])

  // Fullscreen disabled — browser default behaviour preserved

  return (
    <KioskContext.Provider value={{ state, dispatch, goTo, startBookingLookup, startVisitingFlow, performLookup, confirmBooking, acceptConsent, simulateScan, completeCheckIn, submitWalkIn, wakeFromScreensaver }}>
      {children}
    </KioskContext.Provider>
  )
}

export function useKiosk() {
  const ctx = useContext(KioskContext)
  if (!ctx) throw new Error('useKiosk must be used inside KioskProvider')
  return ctx
}
