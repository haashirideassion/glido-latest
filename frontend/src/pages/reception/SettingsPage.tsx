import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { getTenant, updateTenant } from '@/lib/db/tenants'
import { fetcher, postFetcher, patchFetcher, deleteFetcher, rawFetcher } from '@/lib/fetcher'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import { toast } from '@/lib/toast'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtDateTime } from '@/lib/time'
import { useReceptionAuth } from '@/contexts/ReceptionAuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayHours { enabled: boolean; open: string; close: string }

interface WorkingHoursState {
  mon: DayHours; tue: DayHours; wed: DayHours; thu: DayHours
  fri: DayHours; sat: DayHours; sun: DayHours
}

interface SlotPeriod { enabled: boolean; label: string; start: string; end: string }
interface SlotPeriodsState { morning: SlotPeriod; afternoon: SlotPeriod; evening: SlotPeriod }

interface PricingState {
  storageRate:      string
  shrinkWrapRate:   string
  slotFeePickup:    string  // legacy fallback (not shown in UI)
  slotFeeDropoff:   string  // legacy fallback (not shown in UI)
  slotFeePickupLcl: string
  slotFeePickupFcl: string
  slotFeeDropoffLcl: string
  slotFeeDropoffFcl: string
  fclFreeDays:      string
  lclFreeDays:      string
}

interface ClientPricingException {
  carrier_id:        string
  carrier_name:      string
  slot_fee_override: number
}

interface KioskDevice {
  id:           string
  token:        string
  label:        string | null
  is_active:    boolean
  last_seen_at: string | null
  created_at:   string
}

const DEFAULT_PRICING: PricingState = {
  storageRate:      '8.50',
  shrinkWrapRate:   '12.00',
  slotFeePickup:    '5.00',
  slotFeeDropoff:   '5.00',
  slotFeePickupLcl: '5.00',
  slotFeePickupFcl: '5.00',
  slotFeeDropoffLcl: '5.00',
  slotFeeDropoffFcl: '5.00',
  fclFreeDays:      '7',
  lclFreeDays:      '3',
}

interface SlotConfigState {
  slotDuration:       string
  maxBookingsPerSlot: string
  advanceBookingDays: string
  sameDayCutoff:      string
  holdDuration:       string
  capacityByHour:     Record<string, number>  // e.g. { "08:00": 4, "09:00": 6 }
  capacityByCombo:    Record<string, number>
}

const DEFAULT_SLOT_CONFIG: SlotConfigState = {
  slotDuration:       '60',
  maxBookingsPerSlot: '5',
  advanceBookingDays: '30',
  sameDayCutoff:      '08:00',
  holdDuration:       '10',
  capacityByHour:     {},
  capacityByCombo:    { 'pickup-lcl': 5, 'pickup-fcl': 5, 'dropoff-lcl': 5, 'dropoff-fcl': 5 },
}

/** Generate hourly (or sub-hourly) time-bucket start times between open and close. */
function makeTimeBuckets(openTime: string, closeTime: string, durationMin: number): string[] {
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  const startMin = oh * 60 + om
  const endMin   = ch * 60 + cm
  const buckets: string[] = []
  for (let t = startMin; t < endMin; t += durationMin) {
    const h = String(Math.floor(t / 60)).padStart(2, '0')
    const m = String(t % 60).padStart(2, '0')
    buckets.push(`${h}:${m}`)
  }
  return buckets
}

/** Format a bucket start time + duration into a range label e.g. "08:00 – 09:00" */
function bucketLabel(start: string, durationMin: number): string {
  const [h, m] = start.split(':').map(Number)
  const endMin  = h * 60 + m + durationMin
  const eh = String(Math.floor(endMin / 60)).padStart(2, '0')
  const em = String(endMin % 60).padStart(2, '0')
  return `${start} – ${eh}:${em}`
}

interface CargowiseState {
  apiUrl:          string
  apiKey:          string
  tenantCode:      string
  refreshInterval: string
}

const DEFAULT_CARGOWISE: CargowiseState = {
  apiUrl: '', apiKey: '', tenantCode: '', refreshInterval: '30',
}

interface SmtpState {
  host:        string
  port:        string
  username:    string
  password:    string
  fromAddress: string
  fromName:    string
}

const DEFAULT_SMTP: SmtpState = {
  host: '', port: '587', username: '', password: '', fromAddress: '', fromName: '',
}

interface DocRequirement {
  id:        string
  name:      string
  required:  boolean
  fileTypes: string[]   // e.g. ['PDF', 'JPG']
  appliesTo: string[]   // e.g. ['pickup_lcl', 'dropoff_fcl']
}

const PREDEFINED_DOCS = [
  'Delivery Order', 'Biosecurity Direction', 'Interim Receipt',
  'Booking Confirmation', 'Packing List', 'Cartage Advice',
  'Dangerous Goods Declaration', 'Driver Licence',
  'Vehicle Registration', 'Container Details',
]

const APPLIES_TO_OPTIONS = [
  { key: 'pickup_lcl',  label: 'Pickup + LCL'  },
  { key: 'dropoff_lcl', label: 'Dropoff + LCL' },
  { key: 'pickup_fcl',  label: 'Pickup + FCL'  },
  { key: 'dropoff_fcl', label: 'Dropoff + FCL' },
]

const FILE_TYPE_OPTIONS = ['PDF', 'JPG', 'PNG', 'DOCX']

// Pre-populated defaults derived from the combo mapping spec
const COMBO_DEFAULTS: DocRequirement[] = [
  { id: 'cd1', name: 'Delivery Order',             required: true,  fileTypes: ['PDF'], appliesTo: ['pickup_lcl', 'pickup_fcl', 'dropoff_fcl'] },
  { id: 'cd2', name: 'Biosecurity Direction',       required: false, fileTypes: ['PDF'], appliesTo: ['pickup_lcl', 'dropoff_fcl'] },
  { id: 'cd3', name: 'Interim Receipt',             required: true,  fileTypes: ['PDF'], appliesTo: ['dropoff_lcl'] },
  { id: 'cd4', name: 'Booking Confirmation',        required: true,  fileTypes: ['PDF'], appliesTo: ['dropoff_lcl'] },
  { id: 'cd5', name: 'Packing List',                required: false, fileTypes: ['PDF'], appliesTo: ['dropoff_lcl'] },
  { id: 'cd6', name: 'Cartage Advice',              required: true,  fileTypes: ['PDF'], appliesTo: ['pickup_fcl', 'dropoff_fcl'] },
  { id: 'cd7', name: 'Dangerous Goods Declaration', required: false, fileTypes: ['PDF'], appliesTo: ['pickup_fcl', 'dropoff_fcl'] },
]

interface StaffUser {
  id:                      string
  email:                   string
  first_name:              string | null
  last_name:               string | null
  role:                    string
  is_active:               boolean
  last_login_at:           string | null
  created_at:              string
  password_reset_required: boolean
}

const DEFAULT_DOC_REQUIREMENTS: DocRequirement[] = COMBO_DEFAULTS

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUPS = [
  { id: 'General',      label: 'General',      sections: ['General', 'Working Hours'] },
  { id: 'Bookings',     label: 'Bookings',     sections: ['Slot Config', 'Pricing', 'Payment', 'Document Requirements'] },
  { id: 'Integrations', label: 'Integrations', sections: ['Integrations'] },
  { id: 'Team',         label: 'Team',         sections: ['User Management'] },
] as const
type GroupId = typeof GROUPS[number]['id']

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }

function GroupLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: `${first ? 8 : 28}px 0 14px` }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
    </div>
  )
}
const INPUT: React.CSSProperties = { width: '100%', padding: '11px 14px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 20 }

// ─── Brand Colour Picker ──────────────────────────────────────────────────────
const COLOR_PRESETS = [
  // Oranges & reds
  '#FC6514','#F97316','#EF4444','#DC2626','#E11D48',
  // Blues & cyans
  '#3B82F6','#2563EB','#0EA5E9','#06B6D4','#6366F1',
  // Purples & pinks
  '#8B5CF6','#7C3AED','#EC4899','#DB2777','#F43F5E',
  // Greens
  '#22C55E','#16A34A','#10B981','#059669','#84CC16',
  // Neutrals & darks
  '#1C1917','#374151','#64748B','#78716C','#0F172A',
]

function BrandColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open,   setOpen]   = useState(false)
  const [draft,  setDraft]  = useState(value)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const pick = (color: string) => {
    setDraft(color)
    onChange(color)
  }

  const commitDraft = (raw: string) => {
    const c = raw.startsWith('#') ? raw : '#' + raw
    if (/^#[0-9A-Fa-f]{6}$/.test(c)) pick(c)
    else setDraft(value) // revert invalid
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* ── Trigger ── */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#FFFFFF', border: `1.5px solid ${open ? '#9CA3AF' : '#E2E0DD'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', boxSizing: 'border-box', userSelect: 'none', transition: 'border-color 0.15s' }}
        onMouseOver={e => { if (!open) e.currentTarget.style.borderColor = '#9CA3AF' }}
        onMouseOut={e  => { if (!open) e.currentTarget.style.borderColor = open ? '#9CA3AF' : '#E2E0DD' }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 6, background: value, border: '1px solid rgba(0,0,0,0.14)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: '#1C1917', fontFamily: 'ui-monospace,monospace', letterSpacing: '0.06em' }}>{value.toUpperCase()}</span>
        <Icon name={ICONS.arrowDown} size={14} style={{ color: '#9CA3AF', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>

      {/* ── Popover ── */}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.13),0 2px 8px rgba(0,0,0,0.06)', padding: '16px' }}>

          {/* Presets */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Presets</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
            {COLOR_PRESETS.map(c => (
              <button key={c} type="button" title={c} onClick={() => pick(c)}
                style={{ height: 36, borderRadius: 8, background: c, border: value.toUpperCase() === c.toUpperCase() ? '3px solid #1C1917' : '2px solid transparent', cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s', outline: 'none', boxSizing: 'border-box', boxShadow: value.toUpperCase() === c.toUpperCase() ? '0 0 0 2px rgba(255,255,255,0.9) inset' : 'none' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.18)' }}
                onMouseOut={e  => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = value.toUpperCase() === c.toUpperCase() ? '0 0 0 2px rgba(255,255,255,0.9) inset' : 'none' }}
              />
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 0 14px' }} />

          {/* Custom hex */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Custom hex</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: draft, border: '1px solid rgba(0,0,0,0.14)', flexShrink: 0 }} />
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={e  => commitDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { commitDraft((e.target as HTMLInputElement).value); setOpen(false) } }}
              maxLength={7}
              placeholder="#000000"
              style={{ flex: 1, height: 38, padding: '0 12px', fontSize: 14, fontFamily: 'ui-monospace,monospace', letterSpacing: '0.06em', color: '#1C1917', background: '#FAFAF9', border: '1.5px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e  => (e.target.style.borderColor = 'var(--brand-color)')}
              onBlurCapture={e => (e.target.style.borderColor = '#E2E0DD')}
            />
            <button type="button"
              onClick={() => { commitDraft(draft); setOpen(false) }}
              style={{ height: 38, padding: '0 16px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--brand-color)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
const SAVE: React.CSSProperties  = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-full)', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22),0 4px 14px rgba(var(--brand-rgb),0.40)', marginTop: 20, transition: 'box-shadow 0.15s ease' }

// 30-min increments 00:00 → 23:30
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

const DAYS: { key: keyof WorkingHoursState; label: string }[] = [
  { key: 'mon', label: 'Monday'    },
  { key: 'tue', label: 'Tuesday'   },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday'  },
  { key: 'fri', label: 'Friday'    },
  { key: 'sat', label: 'Saturday'  },
  { key: 'sun', label: 'Sunday'    },
]

const PERIODS: { key: keyof SlotPeriodsState; defaultLabel: string }[] = [
  { key: 'morning',   defaultLabel: 'Morning'   },
  { key: 'afternoon', defaultLabel: 'Afternoon' },
  { key: 'evening',   defaultLabel: 'Evening'   },
]

const DEFAULT_HOURS: WorkingHoursState = {
  mon: { enabled: true,  open: '07:00', close: '18:00' },
  tue: { enabled: true,  open: '07:00', close: '18:00' },
  wed: { enabled: true,  open: '07:00', close: '18:00' },
  thu: { enabled: true,  open: '07:00', close: '18:00' },
  fri: { enabled: true,  open: '07:00', close: '18:00' },
  sat: { enabled: false, open: '07:00', close: '18:00' },
  sun: { enabled: false, open: '07:00', close: '18:00' },
}

const DEFAULT_PERIODS: SlotPeriodsState = {
  morning:   { enabled: true,  label: 'Morning',   start: '06:00', end: '12:00' },
  afternoon: { enabled: true,  label: 'Afternoon', start: '12:00', end: '17:00' },
  evening:   { enabled: false, label: 'Evening',   start: '17:00', end: '20:00' },
}

// ─── Helper components ────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )
}

function FocusInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ ...INPUT, ...props.style as React.CSSProperties }}
      onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
      onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function FocusSelect({ children, disabled, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} disabled={disabled}
      style={{ ...INPUT, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'default' }}
      onFocus={e => { if (!disabled) { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' } }}
      onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
    >
      {children}
    </select>
  )
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: desc ? 4 : 0 }}>{title}</h3>
      {desc && <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{desc}</p>}
    </div>
  )
}

function SaveBtn({ loading, dirty }: { loading?: boolean; dirty?: boolean }) {
  const disabled = loading || !dirty
  return (
    <button type="submit" disabled={disabled} style={{ ...SAVE, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {loading ? 'Saving…' : 'Save changes'}
    </button>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {DAYS.map(d => (
        <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 80px', gap: 16, alignItems: 'center' }}>
          <div style={{ height: 14, width: 80, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.07)' }} />
          <div style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
          <div style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
          <div style={{ height: 16, width: 60, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  usePageTitle('Glido | Settings')
  const { isAdmin, isSuperAdmin, userId: currentUserId } = useReceptionAuth()

  // ── Visible groups — hide Team (User Management) from reception_staff ─────
  const visibleGroups = GROUPS.filter(g => g.id !== 'Team' || isAdmin)

  // ── Hash ↔ group mapping (backward-compat with old per-section hashes) ────
  const HASH_TO_GROUP: Record<string, GroupId> = {
    '#general': 'General', '#working-hours': 'General',
    '#slot-config': 'Bookings', '#pricing': 'Bookings', '#payment': 'Bookings',
    '#integrations': 'Integrations', '#doc-requirements': 'Bookings',
    '#user-management': 'Team',
  }
  const GROUP_TO_HASH: Record<GroupId, string> = {
    General: '#general', Bookings: '#slot-config',
    Integrations: '#integrations', Team: '#user-management',
  }
  const tabFromHash = (): GroupId => HASH_TO_GROUP[window.location.hash] ?? 'General'

  const [tab, setTab] = useState<GroupId>(tabFromHash)
  const [saved, setSaved] = useState(false)

  // Sync tab when the hash changes (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // General state
  const [general,         setGeneral]         = useState({ name: '', address: '', logoUrl: '', primaryColor: 'var(--brand-color)', timezone: 'Australia/Sydney', contactEmail: '', contactPhone: '' })
  const [generalLoading,  setGeneralLoading]  = useState(true)
  const [generalSaving,   setGeneralSaving]   = useState(false)
  const [logoUploading,   setLogoUploading]   = useState(false)

  // Payment state
  const [eft,             setEft]             = useState({ bankName: '', accountName: '', bsb: '', accountNumber: '' })
  const [stripe,          setStripe]          = useState({ publishableKey: '', secretKey: '' })
  const [compay,          setCompay]          = useState({ clientNumber: '' })
  const [requirePayment,  setRequirePayment]  = useState(false)
  const [paymentLoading,  setPaymentLoading]  = useState(true)
  const [eftSaving,       setEftSaving]       = useState(false)
  const [stripeSaving,    setStripeSaving]    = useState(false)
  const [compaySaving,    setCompaySaving]    = useState(false)
  const [showSecretKey,   setShowSecretKey]   = useState(false)

  // Pricing state
  const [pricing,        setPricing]        = useState<PricingState>(DEFAULT_PRICING)
  const [pricingLoading, setPricingLoading] = useState(true)
  const [pricingSaving,  setPricingSaving]  = useState(false)

  // Client Exception Pricing state
  const [exceptions,          setExceptions]          = useState<ClientPricingException[]>([])
  const [carriersForExc,      setCarriersForExc]      = useState<{ id: string; name: string }[]>([])
  const [carriersForExcLoading, setCarriersForExcLoading] = useState(false)
  const [showAddException,    setShowAddException]    = useState(false)
  const [newExcCarrierId,     setNewExcCarrierId]     = useState('')
  const [newExcFee,           setNewExcFee]           = useState('')

  // Slot Config state
  const [slotConfig,        setSlotConfig]        = useState<SlotConfigState>(DEFAULT_SLOT_CONFIG)
  const [slotConfigLoading, setSlotConfigLoading] = useState(true)
  const [slotConfigSaving,  setSlotConfigSaving]  = useState(false)

  // Integrations state
  const [cargowise,            setCargowise]            = useState<CargowiseState>(DEFAULT_CARGOWISE)
  const [smtp,                 setSmtp]                 = useState<SmtpState>(DEFAULT_SMTP)
  const [integrationsLoading,  setIntegrationsLoading]  = useState(true)
  const [cargowiseSaving,      setCargowiseSaving]      = useState(false)
  const [smtpSaving,           setSmtpSaving]           = useState(false)
  const [showCwApiKey,         setShowCwApiKey]         = useState(false)
  const [showSmtpPassword,     setShowSmtpPassword]     = useState(false)

  // Document Requirements state
  const [docRequirements, setDocRequirements] = useState<DocRequirement[]>(DEFAULT_DOC_REQUIREMENTS)
  const [docLoading,      setDocLoading]      = useState(true)
  const [docSaving,       setDocSaving]       = useState(false)
  const [customInputIds,  setCustomInputIds]  = useState<Set<string>>(new Set())

  // Kiosk Agreement state
  const [kioskTerms,       setKioskTerms]       = useState('')
  const [kioskTermsDirty,  setKioskTermsDirty]  = useState(false)
  const [kioskTermsSaving, setKioskTermsSaving] = useState(false)

  // Kiosk Devices state
  const [kioskDevices,        setKioskDevices]        = useState<KioskDevice[]>([])
  const [kioskDevicesLoading, setKioskDevicesLoading] = useState(false)
  const [kioskDeviceAdding,   setKioskDeviceAdding]   = useState(false)
  const [newDeviceLabel,      setNewDeviceLabel]      = useState('')
  const [showAddDevice,       setShowAddDevice]       = useState(false)
  const [copiedDeviceId,      setCopiedDeviceId]      = useState<string | null>(null)
  const [deletingDeviceId,    setDeletingDeviceId]    = useState<string | null>(null)

  // User Management state
  const [staffUsers,      setStaffUsers]      = useState<StaffUser[]>([])
  const [usersLoading,    setUsersLoading]    = useState(false)
  const [showInviteForm,  setShowInviteForm]  = useState(false)
  const [inviteSending,   setInviteSending]   = useState(false)
  const [invite,          setInvite]          = useState({ firstName: '', lastName: '', email: '', role: 'reception_staff' })
  const [setupLink,       setSetupLink]       = useState<string | null>(null)
  const [setupLinkEmail,  setSetupLinkEmail]  = useState('')
  const [deleteTarget,    setDeleteTarget]    = useState<StaffUser | null>(null)
  const [deleting,        setDeleting]        = useState(false)
  const [resendingId,     setResendingId]     = useState<string | null>(null)

  // Staff Permissions state
  const SP_DEFAULTS = { can_view_id_scan: true, can_mark_complete: true, can_override_status: false, can_create_manual_booking: false, can_export_csv: true, can_manual_ics_refresh: true, can_view_charge_details: true, can_confirm_eft: false }
  type SpKey = keyof typeof SP_DEFAULTS
  const [staffPerms,      setStaffPerms]      = useState(SP_DEFAULTS)
  const [staffPermsSaved, setStaffPermsSaved] = useState(SP_DEFAULTS)
  const [staffPermsSaving, setStaffPermsSaving] = useState(false)
  const staffPermsDirty = JSON.stringify(staffPerms) !== JSON.stringify(staffPermsSaved)

  // Working Hours state
  const [whLoading,  setWhLoading]  = useState(true)
  const [whSaving,   setWhSaving]   = useState(false)
  const [workingHours, setWorkingHours] = useState<WorkingHoursState>(DEFAULT_HOURS)
  const [slotPeriods,  setSlotPeriods]  = useState<SlotPeriodsState>(DEFAULT_PERIODS)

  // ── Dirty flags — true when user has unsaved changes ───────────────────────
  const [generalDirty,     setGeneralDirty]     = useState(false)
  const [whDirty,          setWhDirty]          = useState(false)
  const [slotConfigDirty,  setSlotConfigDirty]  = useState(false)
  const [pricingDirty,     setPricingDirty]     = useState(false)
  const [eftDirty,         setEftDirty]         = useState(false)
  const [stripeDirty,      setStripeDirty]      = useState(false)
  const [compayDirty,      setCompayDirty]      = useState(false)
  const [cargowiseDirty,   setCargowiseDirty]   = useState(false)
  const [smtpDirty,        setSmtpDirty]        = useState(false)
  const [docDirty,         setDocDirty]         = useState(false)

  // Load general settings on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        setGeneral(prev => ({
          name:         tenant.name              ?? '',
          address:      tenant.address           ?? '',
          // Don't overwrite logoUrl if an upload just completed — stale DB value
          // would replace the freshly-uploaded URL before the next save cycle.
          logoUrl:      logoJustUploaded.current ? prev.logoUrl : (tenant.logo_url ?? ''),
          primaryColor: (() => {
            const color = tenant.primary_color
            if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
              const r = parseInt(color.slice(1, 3), 16)
              const g = parseInt(color.slice(3, 5), 16)
              const b = parseInt(color.slice(5, 7), 16)
              document.documentElement.style.setProperty('--brand-color', color)
              document.documentElement.style.setProperty('--brand-rgb', `${r},${g},${b}`)
              return color
            }
            // No valid color in DB — keep CSS defaults, return fallback for the input
            return getComputedStyle(document.documentElement).getPropertyValue('--brand-color').trim() || '#FC6514'
          })(),
          timezone:     tenant.timezone          ?? 'Australia/Sydney',
          contactEmail: tenant.contact_email     ?? '',
          contactPhone: tenant.contact_phone     ?? '',
        }))
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setGeneralLoading(false))
  }, [])

  const saveGeneral = async () => {
    setGeneralSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        name:          general.name,
        address:       general.address    || null,
        logo_url:      general.logoUrl    || null,
        primary_color: general.primaryColor || null,
        timezone:      general.timezone   || null,
        contact_email: general.contactEmail || null,
        contact_phone: general.contactPhone || null,
      })
      toast('General settings saved', 'success')
      setGeneralDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save general settings', 'error')
    } finally {
      setGeneralSaving(false)
    }
  }

  const uploadLogo = async (file: File) => {
    setLogoUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tenantId', DEFAULT_TENANT_ID)
      formData.append('type', 'logo')
      const res = await rawFetcher('/api/uploads/logo', { method: 'POST', body: formData })
      if (!res) throw new Error('Upload failed')
      const json = await res.json()
      const logoUrl = json?.data?.url ?? json?.url
      if (!logoUrl) throw new Error('No URL returned')
      logoJustUploaded.current = true
      setGeneral(g => ({ ...g, logoUrl }))
      await updateTenant(DEFAULT_TENANT_ID, { logo_url: logoUrl })
      toast('Logo uploaded', 'success')
      window.location.reload()
    } catch (err: any) {
      toast(err?.message ?? 'Logo upload failed', 'error')
    } finally {
      setLogoUploading(false)
    }
  }

  // Load tenant data on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return

        // Populate working hours
        const wh = tenant.working_hours as unknown as WorkingHoursState | null
        if (wh && typeof wh === 'object') {
          setWorkingHours({
            mon: { ...DEFAULT_HOURS.mon, ...wh.mon },
            tue: { ...DEFAULT_HOURS.tue, ...wh.tue },
            wed: { ...DEFAULT_HOURS.wed, ...wh.wed },
            thu: { ...DEFAULT_HOURS.thu, ...wh.thu },
            fri: { ...DEFAULT_HOURS.fri, ...wh.fri },
            sat: { ...DEFAULT_HOURS.sat, ...wh.sat },
            sun: { ...DEFAULT_HOURS.sun, ...wh.sun },
          })

          // Slot periods stored inside working_hours JSON under "periods" key
          const periods = (wh as any).periods as SlotPeriodsState | undefined
          if (periods && typeof periods === 'object') {
            setSlotPeriods({
              morning:   { ...DEFAULT_PERIODS.morning,   ...periods.morning   },
              afternoon: { ...DEFAULT_PERIODS.afternoon, ...periods.afternoon },
              evening:   { ...DEFAULT_PERIODS.evening,   ...periods.evening   },
            })
          }
        }
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setWhLoading(false))
  }, [])

  // Load payment settings on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        setEft({
          bankName:      tenant.eft_bank_name      ?? '',
          accountName:   tenant.eft_account_name   ?? '',
          bsb:           tenant.eft_bsb            ?? '',
          accountNumber: tenant.eft_account_number ?? '',
        })
        setStripe({
          publishableKey: tenant.stripe_public_key ?? '',
          secretKey:      tenant.stripe_secret_key ?? '',
        })
        setRequirePayment(tenant.require_payment_to_confirm ?? false)
        setCompay({ clientNumber: (tenant as any).compay_client_number ?? '' })
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setPaymentLoading(false))
  }, [])

  const saveEft = async () => {
    setEftSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        eft_bank_name:      eft.bankName      || null,
        eft_account_name:   eft.accountName   || null,
        eft_bsb:            eft.bsb           || null,
        eft_account_number: eft.accountNumber || null,
      })
      toast('EFT details saved', 'success')
      setEftDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save EFT details', 'error')
    } finally {
      setEftSaving(false)
    }
  }

  const saveStripe = async () => {
    setStripeSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        stripe_public_key: stripe.publishableKey || null,
        stripe_secret_key: stripe.secretKey      || null,
      })
      toast('Stripe settings saved', 'success')
      setStripeDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save Stripe settings', 'error')
    } finally {
      setStripeSaving(false)
    }
  }

  const saveCompay = async () => {
    setCompaySaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, { compay_client_number: compay.clientNumber || null } as any)
      toast('ComPay settings saved', 'success')
      setCompayDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save ComPay settings', 'error')
    } finally {
      setCompaySaving(false)
    }
  }

  const toggleRequirePayment = async (val: boolean) => {
    setRequirePayment(val)
    try {
      await updateTenant(DEFAULT_TENANT_ID, { require_payment_to_confirm: val })
      toast('Payment preference updated', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Failed to update payment preference', 'error')
      setRequirePayment(!val) // revert on failure
    }
  }

  // Load pricing on mount (separate effect so Working Hours and Pricing load independently)
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        const pr = (tenant.working_hours as any)?.pricing ?? {}
        const pickupFb  = String(tenant.slot_fee_pickup  ?? DEFAULT_PRICING.slotFeePickup)
        const dropoffFb = String(tenant.slot_fee_dropoff ?? DEFAULT_PRICING.slotFeeDropoff)
        const p: PricingState = {
          storageRate:       String(tenant.storage_rate_per_cbm         ?? DEFAULT_PRICING.storageRate),
          shrinkWrapRate:    String(tenant.shrink_wrap_rate_per_pallet  ?? DEFAULT_PRICING.shrinkWrapRate),
          slotFeePickup:     pickupFb,
          slotFeeDropoff:    dropoffFb,
          slotFeePickupLcl:  String(pr.slot_fee_pickup_lcl  ?? pickupFb),
          slotFeePickupFcl:  String(pr.slot_fee_pickup_fcl  ?? pickupFb),
          slotFeeDropoffLcl: String(pr.slot_fee_dropoff_lcl ?? dropoffFb),
          slotFeeDropoffFcl: String(pr.slot_fee_dropoff_fcl ?? dropoffFb),
          fclFreeDays:       String(pr.fcl_free_days ?? DEFAULT_PRICING.fclFreeDays),
          lclFreeDays:       String(pr.lcl_free_days ?? DEFAULT_PRICING.lclFreeDays),
        }
        setPricing(p)
        // Load client pricing exceptions
        const exc = (tenant.working_hours as any)?.client_pricing_exceptions ?? []
        setExceptions(Array.isArray(exc) ? exc : [])
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setPricingLoading(false))
  }, [])

  // Load carriers for the exception dropdown when Bookings tab is open
  useEffect(() => {
    if (tab !== 'Bookings') return
    setCarriersForExcLoading(true)
    fetcher('/api/carriers')
      .then(res => {
        const list = (res?.data ?? res ?? []) as { id: string; name: string }[]
        setCarriersForExc(Array.isArray(list) ? list : [])
      })
      .catch(() => setCarriersForExc([]))
      .finally(() => setCarriersForExcLoading(false))
  }, [tab])

  // Pricing save handler
  const savePricing = async () => {
    setPricingSaving(true)
    try {
      // Fetch current working_hours so we don't overwrite it
      const tenant = await getTenant(DEFAULT_TENANT_ID)
      const existingWh = (tenant?.working_hours as any) ?? {}
      const updatedWh  = {
        ...existingWh,
        pricing: {
          fcl_free_days:       Number(pricing.fclFreeDays),
          lcl_free_days:       Number(pricing.lclFreeDays),
          slot_fee_pickup_lcl:  Number(pricing.slotFeePickupLcl),
          slot_fee_pickup_fcl:  Number(pricing.slotFeePickupFcl),
          slot_fee_dropoff_lcl: Number(pricing.slotFeeDropoffLcl),
          slot_fee_dropoff_fcl: Number(pricing.slotFeeDropoffFcl),
        },
        client_pricing_exceptions: exceptions,
      }
      await updateTenant(DEFAULT_TENANT_ID, {
        storage_rate_per_cbm:        Number(pricing.storageRate),
        shrink_wrap_rate_per_pallet: Number(pricing.shrinkWrapRate),
        slot_fee_pickup:             Number(pricing.slotFeePickupLcl),  // legacy = pickup-lcl value
        slot_fee_dropoff:            Number(pricing.slotFeeDropoffLcl), // legacy = dropoff-lcl value
        working_hours:               updatedWh,
      })
      toast('Pricing saved', 'success')
      setPricingDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save pricing', 'error')
    } finally {
      setPricingSaving(false)
    }
  }

  // Load kiosk terms on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        const terms = (tenant.working_hours as any)?.kiosk_terms ?? ''
        setKioskTerms(terms)
      })
      .catch(() => { /* use defaults */ })
  }, [])

  // Kiosk terms save handler
  const saveKioskTerms = async () => {
    setKioskTermsSaving(true)
    try {
      const tenant = await getTenant(DEFAULT_TENANT_ID)
      const existingWh = (tenant?.working_hours as any) ?? {}
      await updateTenant(DEFAULT_TENANT_ID, {
        working_hours: { ...existingWh, kiosk_terms: kioskTerms },
      })
      toast('Kiosk agreement saved', 'success')
      setKioskTermsDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save kiosk agreement', 'error')
    } finally {
      setKioskTermsSaving(false)
    }
  }

  // Kiosk devices handlers
  const loadKioskDevices = useCallback(async () => {
    setKioskDevicesLoading(true)
    try {
      const res = await fetcher('/api/kiosk/devices')
      const list = res?.data ?? res ?? []
      setKioskDevices(Array.isArray(list) ? list : [])
    } catch { /* silent */ } finally {
      setKioskDevicesLoading(false)
    }
  }, [])

  useEffect(() => { loadKioskDevices() }, [loadKioskDevices])

  const addKioskDevice = async () => {
    if (kioskDeviceAdding) return
    setKioskDeviceAdding(true)
    try {
      const res = await postFetcher('/api/kiosk/devices', { label: newDeviceLabel.trim() || null })
      const newDevice = res?.data ?? res
      setKioskDevices(prev => [newDevice, ...prev])
      setNewDeviceLabel('')
      setShowAddDevice(false)
      toast('Device token created', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Failed to create device', 'error')
    } finally {
      setKioskDeviceAdding(false)
    }
  }

  const toggleKioskDevice = async (id: string, is_active: boolean) => {
    try {
      await patchFetcher(`/api/kiosk/devices/${id}`, { is_active })
      setKioskDevices(prev => prev.map(d => d.id === id ? { ...d, is_active } : d))
    } catch (err: any) {
      toast(err?.message ?? 'Failed to update device', 'error')
    }
  }

  const deleteKioskDevice = async (id: string) => {
    setDeletingDeviceId(id)
    try {
      await deleteFetcher(`/api/kiosk/devices/${id}`)
      setKioskDevices(prev => prev.filter(d => d.id !== id))
      toast('Device removed', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Failed to delete device', 'error')
    } finally {
      setDeletingDeviceId(null)
    }
  }

  const copyDeviceToken = async (device: KioskDevice) => {
    try {
      await navigator.clipboard.writeText(device.token)
      setCopiedDeviceId(device.id)
      setTimeout(() => setCopiedDeviceId(null), 2000)
    } catch {
      toast('Copy failed — check browser permissions', 'error')
    }
  }

  // Load slot config on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        const defaultCap = tenant.max_bookings_per_slot ?? 5
        const savedCap   = (tenant as any).slot_capacity_by_hour as Record<string, number> | null
        // If no per-hour map exists yet, pre-fill every bucket with the global default
        const wh        = tenant.working_hours as any
        const openTime  = wh?.mon?.open  ?? '07:00'
        const closeTime = wh?.mon?.close ?? '18:00'
        const duration  = tenant.slot_duration_min ?? 60
        const buckets   = makeTimeBuckets(openTime, closeTime, duration)
        const capacityByHour = savedCap ?? Object.fromEntries(buckets.map(b => [b, defaultCap]))
        setSlotConfig({
          slotDuration:       String(tenant.slot_duration_min      ?? DEFAULT_SLOT_CONFIG.slotDuration),
          maxBookingsPerSlot: String(tenant.max_bookings_per_slot  ?? DEFAULT_SLOT_CONFIG.maxBookingsPerSlot),
          advanceBookingDays: String(tenant.advance_booking_days   ?? DEFAULT_SLOT_CONFIG.advanceBookingDays),
          sameDayCutoff:      tenant.same_day_cutoff_time          ?? '',
          holdDuration:       String(tenant.slot_hold_duration_min ?? DEFAULT_SLOT_CONFIG.holdDuration),
          capacityByHour,
          capacityByCombo:    ((tenant as any).slot_capacity_by_combo as Record<string, number> | null) ?? DEFAULT_SLOT_CONFIG.capacityByCombo,
        })
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setSlotConfigLoading(false))
  }, [])

  // Slot Config save handler
  const saveSlotConfig = async () => {
    setSlotConfigSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        slot_duration_min:        Number(slotConfig.slotDuration),
        max_bookings_per_slot:    Number(slotConfig.maxBookingsPerSlot),
        advance_booking_days:     Math.min(30, Math.max(1, Number(slotConfig.advanceBookingDays))),
        // same_day_cutoff_time: slotConfig.sameDayCutoff || null,
        slot_hold_duration_min:   Number(slotConfig.holdDuration),
        slot_capacity_by_hour:    Object.keys(slotConfig.capacityByHour).length > 0
          ? slotConfig.capacityByHour
          : null,
        slot_capacity_by_combo:   slotConfig.capacityByCombo,
      } as any)
      toast('Slot configuration saved', 'success')
      setSlotConfigDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save slot configuration', 'error')
    } finally {
      setSlotConfigSaving(false)
    }
  }

  // Load integrations on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        const t = tenant as any
        setCargowise({
          apiUrl:          t.cargowise_api_url          ?? DEFAULT_CARGOWISE.apiUrl,
          apiKey:          t.cargowise_api_key          ?? DEFAULT_CARGOWISE.apiKey,
          tenantCode:      t.cargowise_tenant_code      ?? DEFAULT_CARGOWISE.tenantCode,
          refreshInterval: String(t.cargowise_refresh_interval ?? DEFAULT_CARGOWISE.refreshInterval),
        })
        setSmtp({
          host:        t.smtp_host         ?? DEFAULT_SMTP.host,
          port:        String(t.smtp_port  ?? DEFAULT_SMTP.port),
          username:    t.smtp_username     ?? DEFAULT_SMTP.username,
          password:    t.smtp_password     ?? DEFAULT_SMTP.password,
          fromAddress: t.smtp_from_address ?? DEFAULT_SMTP.fromAddress,
          fromName:    t.smtp_from_name    ?? DEFAULT_SMTP.fromName,
        })
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setIntegrationsLoading(false))
  }, [])

  // CargoWise save handler
  const saveCargowise = async () => {
    setCargowiseSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        cargowise_api_url:          cargowise.apiUrl          || null,
        cargowise_api_key:          cargowise.apiKey          || null,
        cargowise_tenant_code:      cargowise.tenantCode      || null,
        cargowise_refresh_interval: cargowise.refreshInterval ? Number(cargowise.refreshInterval) : null,
      } as any)
      toast('CargoWise settings saved', 'success')
      setCargowiseDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save CargoWise settings', 'error')
    } finally {
      setCargowiseSaving(false)
    }
  }

  // SMTP save handler
  const saveSmtp = async () => {
    setSmtpSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        smtp_host:         smtp.host         || null,
        smtp_port:         smtp.port         ? Number(smtp.port) : null,
        smtp_username:     smtp.username     || null,
        smtp_password:     smtp.password     || null,
        smtp_from_address: smtp.fromAddress  || null,
        smtp_from_name:    smtp.fromName     || null,
      } as any)
      toast('Email settings saved', 'success')
      setSmtpDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save email settings', 'error')
    } finally {
      setSmtpSaving(false)
    }
  }

  // Load document requirements on mount; pre-populate with combo defaults if empty
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        const raw = tenant.required_documents
        if (Array.isArray(raw) && raw.length > 0) {
          // Migrate legacy string fileTypes to array
          const migrated = (raw as unknown as any[]).map(d => ({
            ...d,
            fileTypes: Array.isArray(d.fileTypes) ? d.fileTypes : (d.fileTypes ? d.fileTypes.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
            appliesTo: Array.isArray(d.appliesTo) ? d.appliesTo : [],
          })) as DocRequirement[]
          setDocRequirements(migrated)
        }
        // else: keep COMBO_DEFAULTS pre-populated
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setDocLoading(false))
  }, [])

  // Document requirements save handler
  const saveDocRequirements = async () => {
    setDocSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, { required_documents: docRequirements as any })
      toast('Document requirements saved', 'success')
      setDocDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save document requirements', 'error')
    } finally {
      setDocSaving(false)
    }
  }

  const addDocRow = () => {
    const newId = String(Date.now())
    setDocRequirements(prev => [
      ...prev,
      { id: newId, name: '', required: false, fileTypes: [], appliesTo: [] },
    ])
    setCustomInputIds(prev => new Set([...prev, newId]))
    setDocDirty(true)
  }

  const updateDoc = (id: string, field: keyof DocRequirement, value: string | boolean | string[]) => {
    setDocRequirements(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
    setDocDirty(true)
  }

  const toggleDocArray = (id: string, field: 'fileTypes' | 'appliesTo', val: string) =>
    setDocRequirements(prev => prev.map(d => {
      if (d.id !== id) return d
      const arr = d[field] as string[]
      return { ...d, [field]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] }
    }))

  const removeDoc = (id: string) => {
    setDocRequirements(prev => prev.filter(d => d.id !== id))
    setCustomInputIds(prev => { const s = new Set(prev); s.delete(id); return s })
    setDocDirty(true)
  }

  const addDocToCombo = (comboKey: string) => {
    const newId = String(Date.now())
    setDocRequirements(prev => [
      ...prev,
      { id: newId, name: '', required: false, fileTypes: [], appliesTo: [comboKey] },
    ])
    setCustomInputIds(prev => new Set([...prev, newId]))
    setDocDirty(true)
  }

  const removeDocFromCombo = (docId: string, comboKey: string) => {
    setDocRequirements(prev => {
      const updated = prev.map(d => {
        if (d.id !== docId) return d
        const newAppliesTo = d.appliesTo.filter(k => k !== comboKey)
        return { ...d, appliesTo: newAppliesTo }
      })
      return updated.filter(d => d.appliesTo.length > 0)
    })
    setCustomInputIds(prev => { const s = new Set(prev); s.delete(docId); return s })
    setDocDirty(true)
  }

  // ── User Management ───────────────────────────────────────────────────────────
  const loadStaffUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const res = await fetcher('/api/users?roles=reception_staff,reception_admin,super_admin')
      const staff = (res?.data ?? []) as StaffUser[]
      setStaffUsers(staff)
    } catch { /* noop */ } finally {
      setUsersLoading(false)
    }
  }, [])

  // Load staff users once when the User Management tab is opened.
  // Guarded by a ref so re-renders (e.g. role updates, toasts) never re-fetch;
  // resets when leaving the tab so re-opening pulls fresh data.
  const usersLoadedRef     = useRef(false)
  const logoJustUploaded   = useRef(false)
  useEffect(() => {
    if (tab === 'Team' && isAdmin) {
      if (!usersLoadedRef.current) {
        usersLoadedRef.current = true
        loadStaffUsers()
      }
    } else {
      usersLoadedRef.current = false
    }
  }, [tab, isAdmin, loadStaffUsers])

  // Load staff permissions when Team tab opens
  useEffect(() => {
    if (tab !== 'Team' || !isAdmin) return
    getTenant(DEFAULT_TENANT_ID).then(t => {
      const sp = (t?.working_hours as any)?.staff_permissions
      if (sp && typeof sp === 'object') {
        const merged = { ...SP_DEFAULTS, ...sp }
        setStaffPerms(merged)
        setStaffPermsSaved(merged)
      }
    }).catch(() => {})
  }, [tab, isAdmin])

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await patchFetcher(`/api/users/${userId}`, { role: newRole })
      toast('Role updated', 'success')
      setStaffUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err: any) {
      toast(err?.message ?? 'Failed to update role', 'error')
    }
  }

  const toggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await patchFetcher(`/api/users/${userId}`, { is_active: !currentStatus })
      toast(!currentStatus ? 'User activated' : 'User deactivated', 'success')
      await loadStaffUsers()
    } catch (err: any) {
      toast(err?.message ?? 'Failed to update user status', 'error')
    }
  }

  const sendInvite = async () => {
    if (!invite.email.trim()) { toast('Email is required', 'error'); return }
    setInviteSending(true)
    try {
      const res = await postFetcher('/api/users/invite', {
        email:     invite.email.trim(),
        role:      invite.role,
        firstName: invite.firstName.trim() || undefined,
        lastName:  invite.lastName.trim()  || undefined,
      })
      setShowInviteForm(false)
      setSetupLinkEmail(invite.email.trim())
      setSetupLink(res?.data?.setupUrl ?? null)
      setInvite({ firstName: '', lastName: '', email: '', role: 'reception_staff' })
      await loadStaffUsers()
    } catch (err: any) {
      toast(err?.message ?? 'Failed to send invite', 'error')
    } finally {
      setInviteSending(false)
    }
  }

  const resendInvite = async (user: StaffUser) => {
    setResendingId(user.id)
    try {
      const res = await postFetcher(`/api/users/${user.id}/resend-invite`, {})
      setSetupLinkEmail(user.email)
      setSetupLink(res?.data?.setupUrl ?? null)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to regenerate setup link', 'error')
    } finally {
      setResendingId(null)
    }
  }

  const deleteUser = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteFetcher(`/api/users/${deleteTarget.id}`)
      toast('User removed', 'success')
      setStaffUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to delete user', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Staff permissions — saved via saveCurrentTab below

  // Working Hours save handler
  const saveWorkingHours = async (e: React.FormEvent) => {
    e.preventDefault()
    setWhSaving(true)
    try {
      const payload = { ...workingHours, periods: slotPeriods }
      await updateTenant(DEFAULT_TENANT_ID, { working_hours: payload as any })
      toast('Working hours saved', 'success')
      setWhDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save working hours', 'error')
    } finally {
      setWhSaving(false)
    }
  }

  // Day field updater
  const setDay = (day: keyof WorkingHoursState, field: keyof DayHours, value: string | boolean) => {
    setWorkingHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
    setWhDirty(true)
  }

  // Period field updater
  const setPeriod = (period: keyof SlotPeriodsState, field: keyof SlotPeriod, value: string | boolean) => {
    setSlotPeriods(prev => ({ ...prev, [period]: { ...prev[period], [field]: value } }))
    setWhDirty(true)
  }

  // Fake save for non-wired tabs
  const fakeSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const saveCurrentTab = async () => {
    if (tab === 'General') {
      if (generalDirty) await saveGeneral()
      if (whDirty) await saveWorkingHours({ preventDefault: () => {} } as any)
      if (kioskTermsDirty) await saveKioskTerms()
    } else if (tab === 'Bookings') {
      if (slotConfigDirty) await saveSlotConfig()
      if (pricingDirty) await savePricing()
      if (eftDirty) await saveEft()
      if (stripeDirty) await saveStripe()
      if (compayDirty) await saveCompay()
      if (docDirty) await saveDocRequirements()
    } else if (tab === 'Integrations') {
      if (cargowiseDirty) await saveCargowise()
      if (smtpDirty) await saveSmtp()
    } else if (tab === 'Team' && staffPermsDirty) {
      setStaffPermsSaving(true)
      try {
        const tenant = await getTenant(DEFAULT_TENANT_ID)
        const existingWh = (tenant?.working_hours as any) ?? {}
        await updateTenant(DEFAULT_TENANT_ID, {
          working_hours: { ...existingWh, staff_permissions: staffPerms },
        })
        setStaffPermsSaved(staffPerms)
        toast('Permissions saved. Changes will apply on next staff session load.', 'success')
      } catch (err: any) {
        toast(err?.message ?? 'Failed to save permissions. Please try again.', 'error')
      } finally {
        setStaffPermsSaving(false)
      }
    }
  }
  const anyDirty = (
    (generalDirty || whDirty || kioskTermsDirty) ||
    (slotConfigDirty || pricingDirty || eftDirty || stripeDirty || compayDirty || docDirty) ||
    (cargowiseDirty || smtpDirty) ||
    staffPermsDirty
  )

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    anyDirty && currentLocation.pathname !== nextLocation.pathname
  )

  const tabDirty = (
    (tab === 'General'      && (generalDirty || whDirty || kioskTermsDirty)) ||
    (tab === 'Bookings'     && (slotConfigDirty || pricingDirty || eftDirty || stripeDirty || compayDirty || docDirty)) ||
    (tab === 'Integrations' && (cargowiseDirty || smtpDirty)) ||
    (tab === 'Team'         && staffPermsDirty)
  )
  const tabSaving = (
    (tab === 'General'      && (generalSaving || whSaving || kioskTermsSaving)) ||
    (tab === 'Bookings'     && (slotConfigSaving || pricingSaving || eftSaving || stripeSaving || compaySaving || docSaving)) ||
    (tab === 'Integrations' && (cargowiseSaving || smtpSaving)) ||
    (tab === 'Team'         && staffPermsSaving)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 'var(--r-md)', padding: 4, marginBottom: 24, width: '100%' }}>
        {visibleGroups.map(g => (
          <button key={g.id} onClick={() => { setTab(g.id); window.location.hash = GROUP_TO_HASH[g.id] }} style={{
            flex: 1, padding: '8px 16px', borderRadius: 'var(--r-full)', fontSize: 15, fontWeight: tab === g.id ? 600 : 500,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap', textAlign: 'center',
            background: tab === g.id ? '#FFFFFF' : 'transparent',
            color: tab === g.id ? '#1C1917' : 'var(--text-secondary)',
            boxShadow: tab === g.id ? '0 1px 3px rgba(0,0,0,0.08),0 2px 6px rgba(0,0,0,0.05)' : 'none',
          }}>{g.label}</button>
        ))}
      </div>

      {/* ── Working Hours (General group, rendered after Business Profile) ── */}
      {tab === 'General' && (
        <form onSubmit={saveWorkingHours} style={{ order: 2 }}>
          <GroupLabel>Working Hours</GroupLabel>
          {/* Operating Hours card */}
          <div style={CARD}>
            <SectionHead title="Operating Hours" desc="Set when your facility accepts visitor bookings." />
            {whLoading ? <Skeleton /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {DAYS.map(({ key, label }) => {
                  // Derive period boundaries — constrain selectors to enabled slot period range
                  const activePeriods = Object.values(slotPeriods).filter(p => p.enabled)
                  const minOpen  = activePeriods.length ? activePeriods.map(p => p.start).sort()[0]         : null
                  const maxClose = activePeriods.length ? activePeriods.map(p => p.end).sort().reverse()[0] : null
                  const day = workingHours[key]
                  // Periods that overlap this day's open/close window
                  const dayPeriods = day.enabled
                    ? activePeriods.filter(p => p.start < day.close && p.end > day.open)
                    : activePeriods
                  const openExceedsMin  = minOpen  && day.enabled && day.open  > minOpen
                  const closeExceedsMax = maxClose && day.enabled && day.close > maxClose
                  return (
                    <div key={key}>
                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 90px', gap: 16, alignItems: 'start' }}>
                        {/* Day label — vertically centred to the selector height */}
                        <span style={{ fontSize: 15, fontWeight: 600, color: day.enabled ? '#1C1917' : '#433F3D', paddingTop: 22 }}>{label}</span>

                        {/* Open selector */}
                        <div>
                          <p style={LABEL}>Open</p>
                          <CustomSelect
                            neutral
                            placeholder="Open time"
                            value={day.open}
                            onChange={v => { setDay(key, 'open', v); setWhDirty(true) }}
                            options={TIME_OPTIONS
                              .filter(t => !maxClose || t <= maxClose)
                              .map(t => ({ value: t, label: t }))}
                          />
                          {openExceedsMin && (
                            <p style={{ fontSize: 13, color: '#D97706', marginTop: 4, lineHeight: 1.4 }}>
                              Open time is earlier than the first slot period ({minOpen}). Bookings won't be accepted until {minOpen}.
                            </p>
                          )}
                        </div>

                        {/* Close selector */}
                        <div>
                          <p style={LABEL}>Close</p>
                          <CustomSelect
                            neutral
                            placeholder="Close time"
                            value={day.close}
                            onChange={v => { setDay(key, 'close', v); setWhDirty(true) }}
                            options={TIME_OPTIONS
                              .filter(t => !maxClose || t <= maxClose)
                              .map(t => ({ value: t, label: t }))}
                          />
                          {closeExceedsMax && (
                            <p style={{ fontSize: 13, color: '#D97706', marginTop: 4, lineHeight: 1.4 }}>
                              Close time exceeds available slot periods. Bookings will only run until {maxClose}.
                            </p>
                          )}
                        </div>

                        {/* Open/closed toggle — aligned to selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                          <input
                            type="checkbox"
                            checked={day.enabled}
                            onChange={e => setDay(key, 'enabled', e.target.checked)}
                            style={{ accentColor: 'var(--brand-color)', width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Open</span>
                        </div>
                      </div>

                      {/* Slot period chips — shown under each day row */}
                      {day.enabled && dayPeriods.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 136, marginTop: 6, marginBottom: 4 }}>
                          {dayPeriods.map(p => (
                            <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-sm)', padding: '2px 8px', fontFamily: 'ui-monospace,monospace' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-color)', flexShrink: 0, display: 'inline-block' }} />
                              {p.label} · {p.start}–{p.end}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                  })}
              </div>
            )}
          </div>

          {/* Slot Periods card */}
          <div style={CARD}>
            <SectionHead title="Slot Periods" desc="Define which parts of the day are available for bookings." />
            {whLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
                    <div style={{ height: 16, width: 16, borderRadius: 'var(--r-xs)', background: 'rgba(0,0,0,0.07)' }} />
                    <div style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
                    <div style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
                    <div style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
                  <div />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Label</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Start</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>End</span>
                </div>

                {PERIODS.map(({ key, defaultLabel }) => {
                  const p = slotPeriods[key]
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 16, alignItems: 'center', opacity: p.enabled ? 1 : 0.5, transition: 'opacity 0.15s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={e => setPeriod(key, 'enabled', e.target.checked)}
                          style={{ accentColor: 'var(--brand-color)', width: 16, height: 16, cursor: 'pointer' }}
                        />
                      </div>

                      <FocusInput
                        type="text"
                        value={p.label}
                        disabled={!p.enabled}
                        placeholder={defaultLabel}
                        onChange={e => setPeriod(key, 'label', e.target.value)}
                        style={{ ...INPUT, opacity: p.enabled ? 1 : 0.6, cursor: p.enabled ? 'text' : 'not-allowed' }}
                      />

                      <FocusSelect
                        value={p.start}
                        disabled={!p.enabled}
                        onChange={e => setPeriod(key, 'start', e.target.value)}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </FocusSelect>

                      <FocusSelect
                        value={p.end}
                        disabled={!p.enabled}
                        onChange={e => setPeriod(key, 'end', e.target.value)}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </FocusSelect>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </form>
      )}

      {/* ── fakeSave sections for every group ── */}
      {true && (
        <form onSubmit={fakeSave} style={{ order: 1 }}>
          {saved && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 'var(--r-md)', padding: '12px 18px', marginBottom: 20, fontSize: 15, color: '#16A34A', fontWeight: 500 }}>
              ✓ Settings saved successfully.
            </div>
          )}

          {/* General — Business Profile */}
          {tab === 'General' && (
            <div>
              <GroupLabel first>Business Profile</GroupLabel>
              {/* Facility Details */}
              <div style={CARD}>
                <SectionHead title="Facility Details" desc="Basic information about your Container Freight Station." />
                {generalLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1,2,3,4,5].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="CFS Name *">
                      <FocusInput type="text" value={general.name} onChange={e => { setGeneral(g => ({ ...g, name: e.target.value })); setGeneralDirty(true) }} placeholder="Sydney CFS Terminal" />
                    </Field>
                    <Field label="Timezone">
                      <CustomSelect
                        value={general.timezone}
                        onChange={v => { setGeneral(g => ({ ...g, timezone: v })); setGeneralDirty(true) }}
                        neutral
                        options={[
                          { value: 'Australia/Sydney',    label: 'Australia/Sydney' },
                          { value: 'Australia/Melbourne', label: 'Australia/Melbourne' },
                          { value: 'Australia/Brisbane',  label: 'Australia/Brisbane' },
                          { value: 'Australia/Perth',     label: 'Australia/Perth' },
                          { value: 'Asia/Kolkata',        label: 'Asia/Kolkata' },
                        ]}
                      />
                    </Field>
                    <Field label="Contact Email">
                      <FocusInput type="email" value={general.contactEmail} onChange={e => { setGeneral(g => ({ ...g, contactEmail: e.target.value })); setGeneralDirty(true) }} placeholder="ops@cfs.com.au" />
                    </Field>
                    <Field label="Contact Phone">
                      <FocusInput type="tel" value={general.contactPhone} onChange={e => { setGeneral(g => ({ ...g, contactPhone: e.target.value })); setGeneralDirty(true) }} placeholder="+61 2 1234 5678" />
                    </Field>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Field label="CFS Address">
                        <textarea value={general.address} onChange={e => { setGeneral(g => ({ ...g, address: e.target.value })); setGeneralDirty(true) }} placeholder="1 Cargo Way, Port Botany NSW 2036" rows={2}
                          style={{ ...INPUT, resize: 'none' }}
                          onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
                          onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {/* Branding */}
              <div style={CARD}>
                <SectionHead title="Branding" desc="Logo and colour scheme shown on the visitor portal." />
                {generalLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="Logo">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {general.logoUrl && (
                          <img src={`${general.logoUrl}?t=${Date.now()}`} alt="Logo" style={{ height: 48, objectFit: 'contain', maxWidth: 160, borderRadius: 'var(--r-sm)', border: '1px solid rgba(0,0,0,0.08)', background: '#f9fafb' }} />
                        )}
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-full)', cursor: logoUploading ? 'not-allowed' : 'pointer', opacity: logoUploading ? 0.6 : 1, alignSelf: 'flex-start' }}>
                          {logoUploading ? 'Uploading…' : general.logoUrl ? 'Change Logo' : 'Upload Logo'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={logoUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
                        </label>
                      </div>
                    </Field>
                    <Field label="Brand Colour">
                      <BrandColorPicker
                        value={general.primaryColor}
                        onChange={color => {
                          const r = parseInt(color.slice(1, 3), 16)
                          const g2 = parseInt(color.slice(3, 5), 16)
                          const b = parseInt(color.slice(5, 7), 16)
                          document.documentElement.style.setProperty('--brand-color', color)
                          document.documentElement.style.setProperty('--brand-rgb', `${r},${g2},${b}`)
                          setGeneral(g => ({ ...g, primaryColor: color }))
                          setGeneralDirty(true)
                        }}
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Kiosk Agreement */}
              <GroupLabel>Kiosk Agreement</GroupLabel>
              <div style={CARD}>
                <SectionHead
                  title="Terms & Conditions"
                  desc="Text shown to visitors on the kiosk before check-in. Leave blank to skip the agreement screen entirely."
                />
                <textarea
                  value={kioskTerms}
                  onChange={e => { setKioskTerms(e.target.value); setKioskTermsDirty(true) }}
                  placeholder={"Enter your site entry terms and conditions here.\n\nExample:\n1. All visitors must wear appropriate PPE...\n2. Speed limit is 10 km/h within the facility..."}
                  rows={12}
                  style={{
                    ...INPUT,
                    resize: 'vertical',
                    minHeight: 200,
                    lineHeight: 1.7,
                    fontFamily: 'inherit',
                    fontSize: 15,
                    padding: '14px 16px',
                    whiteSpace: 'pre-wrap',
                  }}
                  onFocus={e  => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
                  onBlur={e   => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
                />
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
                  Supports plain text with line breaks. Content will be displayed exactly as entered on the kiosk screen.
                </p>
              </div>

              {/* Kiosk Devices */}
              <GroupLabel>Kiosk Devices</GroupLabel>
              <div style={CARD}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
                  <SectionHead
                    title="Device Tokens"
                    desc="Each kiosk device needs a token to authenticate. Generate one per physical device and enter it on the Device Setup screen."
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddDevice(v => !v)}
                    style={{ flexShrink: 0, padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: '1px solid rgba(var(--brand-rgb),0.30)', background: 'rgba(var(--brand-rgb),0.07)', color: 'var(--brand-color)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  >
                    + New Device
                  </button>
                </div>

                {/* Add device form */}
                {showAddDevice && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 20, padding: '14px 16px', background: 'rgba(0,0,0,0.025)', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.07)' }}>
                    <input
                      type="text"
                      value={newDeviceLabel}
                      onChange={e => setNewDeviceLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addKioskDevice()}
                      placeholder="Device label (e.g. Gate 1 Kiosk)"
                      style={{ ...INPUT, flex: 1, padding: '8px 12px', fontSize: 14 }}
                      onFocus={e  => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
                      onBlur={e   => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={addKioskDevice}
                      disabled={kioskDeviceAdding}
                      style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: 'none', background: 'var(--brand-color)', color: '#fff', cursor: kioskDeviceAdding ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: kioskDeviceAdding ? 0.7 : 1 }}
                    >
                      {kioskDeviceAdding ? 'Creating…' : 'Generate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddDevice(false); setNewDeviceLabel('') }}
                      style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Device list */}
                {kioskDevicesLoading ? (
                  <div style={{ padding: '20px 0', color: 'var(--text-tertiary)', fontSize: 14, textAlign: 'center' }}>Loading devices…</div>
                ) : kioskDevices.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                    No devices yet. Click <strong>+ New Device</strong> to generate your first token.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {kioskDevices.map(device => (
                      <div
                        key={device.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.08)', background: device.is_active ? '#FAFAF9' : 'rgba(0,0,0,0.025)', opacity: device.is_active ? 1 : 0.6 }}
                      >
                        {/* Status dot */}
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: device.is_active ? '#22C55E' : '#94A3B8' }} />

                        {/* Label + token */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>
                            {device.label ?? 'Unnamed Device'}
                          </div>
                          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                            {device.token}
                          </div>
                          {device.last_seen_at && (
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              Last seen {fmtDateTime(device.last_seen_at)}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <button
                          type="button"
                          onClick={() => copyDeviceToken(device)}
                          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.12)', background: copiedDeviceId === device.id ? 'rgba(34,197,94,0.1)' : '#fff', color: copiedDeviceId === device.id ? '#16A34A' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                        >
                          {copiedDeviceId === device.id ? '✓ Copied' : 'Copy Token'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleKioskDevice(device.id, !device.is_active)}
                          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--r-full)', border: `1px solid ${device.is_active ? 'rgba(239,68,68,0.22)' : 'rgba(34,197,94,0.22)'}`, background: device.is_active ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)', color: device.is_active ? '#DC2626' : '#16A34A', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          {device.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteKioskDevice(device.id)}
                          disabled={deletingDeviceId === device.id}
                          style={{ padding: '5px 10px', fontSize: 12, borderRadius: 'var(--r-full)', border: '1px solid rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.06)', color: '#DC2626', cursor: deletingDeviceId === device.id ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: deletingDeviceId === device.id ? 0.5 : 1 }}
                        >
                          <Icon name={ICONS.trash} size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Slot Config */}
          {tab === 'Bookings' && <GroupLabel first>Slot Config</GroupLabel>}
          {tab === 'Bookings' && (
            <div style={CARD}>
              <SectionHead title="Slot Configuration" desc="Control how booking slots are structured and managed." />
              {slotConfigLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {[0,1,2,3,4].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="Slot Duration (minutes)">
                      <CustomSelect
                        placeholder="Select duration"
                        value={slotConfig.slotDuration}
                        onChange={v => {
                          // Rebuild capacity grid when duration changes, preserving existing values
                          const dur = Number(v)
                          const enabledPeriods = Object.values(slotPeriods).filter(p => p.enabled)
                          const wh             = Object.values(workingHours).filter((d: any) => d.enabled) as { open: string; close: string }[]
                          const whOpen  = enabledPeriods.length ? enabledPeriods.map(p => p.start).sort()[0]
                            : wh.length ? wh.map(d => d.open).sort()[0] : '07:00'
                          const whClose = enabledPeriods.length ? enabledPeriods.map(p => p.end).sort().reverse()[0]
                            : wh.length ? wh.map(d => d.close).sort().reverse()[0] : '18:00'
                          const buckets = makeTimeBuckets(whOpen, whClose, dur)
                          const newCap: Record<string, number> = {}
                          for (const b of buckets) {
                            newCap[b] = slotConfig.capacityByHour[b] ?? Number(slotConfig.maxBookingsPerSlot)
                          }
                          setSlotConfig(s => ({ ...s, slotDuration: v, capacityByHour: newCap }))
                          setSlotConfigDirty(true)
                        }}
                        options={[
                          { value: '15',  label: '15 minutes' },
                          { value: '30',  label: '30 minutes' },
                          { value: '60',  label: '60 minutes' },
                          { value: '120', label: '120 minutes' },
                        ]}
                      />
                    </Field>
                    <Field label="Default Max Bookings Per Slot" hint="Fallback for hours not individually configured below.">
                      <FocusInput type="number" min="1" max="999" value={slotConfig.maxBookingsPerSlot}
                        onChange={e => { setSlotConfig(s => ({ ...s, maxBookingsPerSlot: e.target.value })); setSlotConfigDirty(true) }} />
                    </Field>
                    <Field label="Max days bookable in advance" hint="1 – 30 days">
                      <FocusInput type="number" min="1" max="30" value={slotConfig.advanceBookingDays}
                        onChange={e => {
                          const v = Math.min(30, Math.max(1, Number(e.target.value)))
                          setSlotConfig(s => ({ ...s, advanceBookingDays: String(v) }))
                          setSlotConfigDirty(true)
                        }} />
                    </Field>
                    <Field label="Slot Hold Duration (minutes)">
                      <FocusInput type="number" min="5" max="30" value={slotConfig.holdDuration}
                        onChange={e => { setSlotConfig(s => ({ ...s, holdDuration: e.target.value })); setSlotConfigDirty(true) }} />
                    </Field>
                  </div>

                  {/* Capacity by combination — full width */}
                  <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Capacity by Booking Type</p>
                    <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 16 }}>Max bookings per time slot for each service + load type combination.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 12, alignItems: 'center', maxWidth: 480 }}>
                      {/* Header row */}
                      <div />
                      {(['LCL', 'FCL'] as const).map(load => (
                        <div key={load} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{load}</div>
                      ))}
                      {/* Data rows */}
                      {(['pickup', 'dropoff'] as const).map(svc => (
                        <>
                          <div key={`${svc}-lbl`} style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{svc === 'pickup' ? 'Pick Up' : 'Drop Off'}</div>
                          {(['lcl', 'fcl'] as const).map(load => {
                            const key = `${svc}-${load}`
                            return (
                              <FocusInput
                                key={key}
                                type="number" min="1" max="999"
                                value={String(slotConfig.capacityByCombo[key] ?? 5)}
                                onChange={e => {
                                  setSlotConfig(s => ({ ...s, capacityByCombo: { ...s.capacityByCombo, [key]: Number(e.target.value) } }))
                                  setSlotConfigDirty(true)
                                }}
                                style={{ textAlign: 'center' }}
                              />
                            )
                          })}
                        </>
                      ))}
                    </div>
                  </div>

                  {/* Validation banner — working hours extend beyond slot periods */}
                  {(() => {
                    const enabledPeriods = Object.values(slotPeriods).filter(p => p.enabled)
                    const wh             = Object.values(workingHours).filter((d: any) => d.enabled) as { open: string; close: string }[]
                    if (!enabledPeriods.length || !wh.length) return null
                    const periodEnd = enabledPeriods.map(p => p.end).sort().reverse()[0]
                    const whClose   = wh.map(d => d.close).sort().reverse()[0]
                    if (whClose <= periodEnd) return null
                    return (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.28)', borderRadius: 'var(--r-sm)', padding: '11px 14px', marginBottom: 20, marginTop: 16 }}>
                        <p style={{ fontSize: 14, color: '#92400E', lineHeight: 1.5, margin: 0 }}>
                          Your working hours extend beyond your enabled slot periods (closes at <strong>{whClose}</strong>, last period ends at <strong>{periodEnd}</strong>). Bookings will only be accepted during enabled slot periods.
                        </p>
                      </div>
                    )
                  })()}

                  {/* Per-hour capacity grid — open/close derived from enabled slot periods */}
                  {(() => {
                    const dur            = Number(slotConfig.slotDuration) || 60
                    const enabledPeriods = Object.values(slotPeriods).filter(p => p.enabled)
                    const wh             = Object.values(workingHours).filter((d: any) => d.enabled) as { open: string; close: string }[]
                    const whOpen  = enabledPeriods.length ? enabledPeriods.map(p => p.start).sort()[0]
                      : wh.length ? wh.map(d => d.open).sort()[0] : '07:00'
                    const whClose = enabledPeriods.length ? enabledPeriods.map(p => p.end).sort().reverse()[0]
                      : wh.length ? wh.map(d => d.close).sort().reverse()[0] : '18:00'
                    const buckets = makeTimeBuckets(whOpen, whClose, dur)
                    return (
                      <div style={{ marginTop: 24 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
                          Per-hour Capacity
                        </p>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
                          Set the maximum number of bookings allowed per time slot. Leave a slot at 0 to block it.
                        </p>
                        <div style={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                          {buckets.map((bucket, i) => (
                            <div
                              key={bucket}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr auto',
                                alignItems: 'center',
                                gap: 16,
                                padding: '10px 16px',
                                background: i % 2 === 0 ? '#fff' : '#FAFAF9',
                                borderBottom: i < buckets.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                              }}
                            >
                              <span style={{ fontSize: 15, fontWeight: 500, color: '#374151', fontFamily: 'ui-monospace,monospace' }}>
                                {bucketLabel(bucket, dur)}
                              </span>
                              <FocusInput
                                type="number"
                                min="0"
                                max="999"
                                value={String(slotConfig.capacityByHour[bucket] ?? Number(slotConfig.maxBookingsPerSlot))}
                                onChange={e => {
                                  const val = Math.max(0, parseInt(e.target.value, 10) || 0)
                                  setSlotConfig(s => ({
                                    ...s,
                                    capacityByHour: { ...s.capacityByHour, [bucket]: val },
                                  }))
                                  setSlotConfigDirty(true)
                                }}
                                style={{ width: 72, textAlign: 'center' }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          )}

          {/* Pricing */}
          {tab === 'Bookings' && <GroupLabel>Pricing</GroupLabel>}
          {tab === 'Bookings' && (
            <div>
              {/* Storage Charges */}
              <div style={CARD}>
                <SectionHead title="Storage Charges" desc="Rates applied to LCL pickups with stored cargo." />
                {pricingLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1,2,3].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="Storage Rate ($/CBM/day)">
                      <FocusInput type="number" step="0.01" min="0" value={pricing.storageRate}
                        onChange={e => { setPricing(p => ({ ...p, storageRate: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                    <Field label="Shrink Wrap ($/pallet)">
                      <FocusInput type="number" step="0.01" min="0" value={pricing.shrinkWrapRate}
                        onChange={e => { setPricing(p => ({ ...p, shrinkWrapRate: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                    <Field label="Slot Fee — Pick Up LCL ($)">
                      <FocusInput type="number" step="0.01" min="0" value={pricing.slotFeePickupLcl}
                        onChange={e => { setPricing(p => ({ ...p, slotFeePickupLcl: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                    <Field label="Slot Fee — Pick Up FCL ($)">
                      <FocusInput type="number" step="0.01" min="0" value={pricing.slotFeePickupFcl}
                        onChange={e => { setPricing(p => ({ ...p, slotFeePickupFcl: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                    <Field label="Slot Fee — Drop Off LCL ($)">
                      <FocusInput type="number" step="0.01" min="0" value={pricing.slotFeeDropoffLcl}
                        onChange={e => { setPricing(p => ({ ...p, slotFeeDropoffLcl: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                    <Field label="Slot Fee — Drop Off FCL ($)">
                      <FocusInput type="number" step="0.01" min="0" value={pricing.slotFeeDropoffFcl}
                        onChange={e => { setPricing(p => ({ ...p, slotFeeDropoffFcl: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                  </div>
                )}
              </div>

              {/* Free Storage Period */}
              <div style={CARD}>
                <SectionHead title="Free Storage Period" desc="Days of free storage before charges begin." />
                {pricingLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="FCL Free Days">
                      <FocusInput type="number" min="0" value={pricing.fclFreeDays}
                        onChange={e => { setPricing(p => ({ ...p, fclFreeDays: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                    <Field label="LCL Free Days">
                      <FocusInput type="number" min="0" value={pricing.lclFreeDays}
                        onChange={e => { setPricing(p => ({ ...p, lclFreeDays: e.target.value })); setPricingDirty(true) }} />
                    </Field>
                  </div>
                )}
              </div>

              {/* Client Exception Pricing */}
              <div style={CARD}>
                <SectionHead
                  title="Client Exception Pricing"
                  desc="Override slot fees for specific carriers. Leave empty to use the global rate."
                />

                {/* Exception rows */}
                {exceptions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', overflow: 'hidden', marginBottom: 16 }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 40px', gap: 12, alignItems: 'center', padding: '8px 14px', background: '#F7F6F5', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Carrier</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Slot Fee Override ($)</span>
                      <span />
                    </div>
                    {exceptions.map((exc, idx) => (
                      <div
                        key={exc.carrier_id}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 160px 40px', gap: 12, alignItems: 'center',
                          padding: '10px 14px',
                          background: idx % 2 === 0 ? '#fff' : '#FAFAF9',
                          borderBottom: idx < exceptions.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1C1917' }}>{exc.carrier_name}</span>
                        <FocusInput
                          type="number"
                          step="0.01"
                          min="0"
                          value={String(exc.slot_fee_override)}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0
                            setExceptions(prev => prev.map((ex, i) => i === idx ? { ...ex, slot_fee_override: val } : ex))
                            setPricingDirty(true)
                          }}
                          style={{ textAlign: 'right' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setExceptions(prev => prev.filter((_, i) => i !== idx))
                            setPricingDirty(true)
                          }}
                          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-sm)', border: '1px solid rgba(239,68,68,0.20)', background: 'rgba(239,68,68,0.05)', color: '#EF4444', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}
                          onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                          onMouseOut={e  => (e.currentTarget.style.background = 'rgba(239,68,68,0.05)')}
                          title="Remove exception"
                        >
                          <Icon name={ICONS.trash} size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {exceptions.length === 0 && !showAddException && (
                  <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 14 }}>No exceptions configured. All carriers use the global slot fee rates above.</p>
                )}

                {/* Inline add form */}
                {showAddException ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: '14px 16px', background: 'rgba(var(--brand-rgb),0.03)', border: '1px solid rgba(var(--brand-rgb),0.15)', borderRadius: 'var(--r-md)' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                      <label style={LABEL}>Carrier</label>
                      {carriersForExcLoading ? (
                        <div style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
                      ) : (
                        <FocusSelect
                          value={newExcCarrierId}
                          onChange={e => setNewExcCarrierId(e.target.value)}
                        >
                          <option value="">Select carrier…</option>
                          {carriersForExc
                            .filter(c => !exceptions.some(ex => ex.carrier_id === c.id))
                            .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                          }
                        </FocusSelect>
                      )}
                    </div>
                    <div style={{ flex: '0 0 160px' }}>
                      <label style={LABEL}>Slot Fee Override ($)</label>
                      <FocusInput
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 8.50"
                        value={newExcFee}
                        onChange={e => setNewExcFee(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newExcCarrierId) { toast('Please select a carrier', 'error'); return }
                          const carrier = carriersForExc.find(c => c.id === newExcCarrierId)
                          if (!carrier) return
                          setExceptions(prev => [
                            ...prev,
                            { carrier_id: carrier.id, carrier_name: carrier.name, slot_fee_override: parseFloat(newExcFee) || 0 },
                          ])
                          setPricingDirty(true)
                          setNewExcCarrierId('')
                          setNewExcFee('')
                          setShowAddException(false)
                        }}
                        style={{ height: 44, padding: '0 18px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddException(false); setNewExcCarrierId(''); setNewExcFee('') }}
                        style={{ height: 44, padding: '0 16px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddException(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.06)', border: '1px solid rgba(var(--brand-rgb),0.22)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.10)')}
                    onMouseOut={e  => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.06)')}
                  >
                    <Icon name={ICONS.add} size={13} />
                    Add Exception
                  </button>
                )}
              </div>

            </div>
          )}

          {/* Payment */}
          {tab === 'Bookings' && <GroupLabel>Payment</GroupLabel>}
          {tab === 'Bookings' && (
            <div>
              {/* EFT */}
              <div style={CARD}>
                <SectionHead title="Bank Transfer (EFT)" desc="Account details displayed to visitors choosing EFT payment." />
                {paymentLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1,2,3].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="Bank Name">
                      <FocusInput type="text" value={eft.bankName} onChange={e => { setEft(v => ({ ...v, bankName: e.target.value })); setEftDirty(true) }} placeholder="e.g. Commonwealth Bank" />
                    </Field>
                    <Field label="Account Name">
                      <FocusInput type="text" value={eft.accountName} onChange={e => { setEft(v => ({ ...v, accountName: e.target.value })); setEftDirty(true) }} placeholder="e.g. Glido CFS Pty Ltd" />
                    </Field>
                    <Field label="BSB">
                      <FocusInput type="text" value={eft.bsb} onChange={e => { setEft(v => ({ ...v, bsb: e.target.value })); setEftDirty(true) }} placeholder="e.g. 062-000" />
                    </Field>
                    <Field label="Account Number">
                      <FocusInput type="text" value={eft.accountNumber} onChange={e => { setEft(v => ({ ...v, accountNumber: e.target.value })); setEftDirty(true) }} placeholder="e.g. 1234 5678" />
                    </Field>
                  </div>
                )}
              </div>

              {/* Stripe */}
              <div style={CARD}>
                <SectionHead title="Stripe (Card Payments)" desc="Configure your Stripe account for card payment processing." />
                {paymentLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {[0,1].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <Field label="Stripe Publishable Key">
                      <FocusInput type="text" value={stripe.publishableKey} onChange={e => { setStripe(v => ({ ...v, publishableKey: e.target.value })); setStripeDirty(true) }} placeholder="pk_live_…" />
                    </Field>
                    <Field label="Stripe Secret Key">
                      <div style={{ position: 'relative' }}>
                        <FocusInput
                          type={showSecretKey ? 'text' : 'password'}
                          value={stripe.secretKey}
                          onChange={e => { setStripe(v => ({ ...v, secretKey: e.target.value })); setStripeDirty(true) }}
                          placeholder="sk_live_…"
                          style={{ paddingRight: 44 }}
                        />
                        <button type="button" onClick={() => setShowSecretKey(v => !v)}
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'inherit' }}>
                          {showSecretKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </Field>
                  </div>
                )}
              </div>

              {/* ComPay */}
              <div style={CARD}>
                <SectionHead title="ComPay (Port Community Payments)" desc="ComPay is used by the port community for freight and storage payments." />
                <Field label="ComPay Client Number">
                  <FocusInput type="text" value={compay.clientNumber}
                    onChange={e => { setCompay(v => ({ ...v, clientNumber: e.target.value })); setCompayDirty(true) }}
                    placeholder="e.g. 123456" />
                </Field>
              </div>

              {/* Require payment toggle */}
              <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>Require payment to confirm booking</p>
                  <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>When enabled, visitors must complete payment before their slot is confirmed.</p>
                </div>
                {paymentLoading ? (
                  <div style={{ width: 44, height: 24, borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleRequirePayment(!requirePayment)}
                    style={{
                      width: 44, height: 24, borderRadius: 'var(--r-full)', flexShrink: 0, border: 'none', cursor: 'pointer',
                      background: requirePayment ? 'linear-gradient(135deg,#FF7A2A,#E85A0A)' : 'rgba(0,0,0,0.15)',
                      position: 'relative', transition: 'background 0.2s ease',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: requirePayment ? 23 : 3, width: 18, height: 18,
                      borderRadius: 'var(--r-full)', background: '#fff', transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
                    }} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Integrations — Connected Systems */}
          {tab === 'Integrations' && <GroupLabel first>Connected Systems</GroupLabel>}
          {tab === 'Integrations' && (
            <div>
              {/* CargoWise */}
              <div style={CARD}>
                <SectionHead title="ICS API" desc="Enables automatic customs clearance status checks." />
                {integrationsLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1,2,3].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="API Endpoint">
                      <FocusInput type="url" value={cargowise.apiUrl} placeholder="https://cw1.cargowise.com/api/…"
                        onChange={e => { setCargowise(v => ({ ...v, apiUrl: e.target.value })); setCargowiseDirty(true) }} />
                    </Field>
                    <Field label="API Key">
                      <div style={{ position: 'relative' }}>
                        <FocusInput
                          type={showCwApiKey ? 'text' : 'password'}
                          value={cargowise.apiKey}
                          placeholder="Your CargoWise API key"
                          onChange={e => { setCargowise(v => ({ ...v, apiKey: e.target.value })); setCargowiseDirty(true) }}
                          style={{ paddingRight: 44 }}
                        />
                        <button type="button" onClick={() => setShowCwApiKey(v => !v)}
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'inherit' }}>
                          {showCwApiKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </Field>
                    <Field label="Tenant Code">
                      <FocusInput type="text" value={cargowise.tenantCode} placeholder="SYDCFS"
                        onChange={e => { setCargowise(v => ({ ...v, tenantCode: e.target.value })); setCargowiseDirty(true) }} />
                    </Field>
                    <Field label="Refresh Interval (min)">
                      <FocusInput type="number" value={cargowise.refreshInterval} min="5" max="1440"
                        onChange={e => { setCargowise(v => ({ ...v, refreshInterval: e.target.value })); setCargowiseDirty(true) }} />
                    </Field>
                  </div>
                )}
              </div>

              {/* SMTP */}
              <div style={CARD}>
                <SectionHead title="Email (SMTP)" desc="Used for booking confirmations and notifications." />
                {integrationsLoading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {[0,1,2,3,4,5].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <Field label="SMTP Host">
                      <FocusInput type="text" value={smtp.host} placeholder="smtp.mailgun.org"
                        onChange={e => { setSmtp(v => ({ ...v, host: e.target.value })); setSmtpDirty(true) }} />
                    </Field>
                    <Field label="SMTP Port">
                      <FocusInput type="number" value={smtp.port} min="1" max="65535"
                        onChange={e => { setSmtp(v => ({ ...v, port: e.target.value })); setSmtpDirty(true) }} />
                    </Field>
                    <Field label="Username">
                      <FocusInput type="text" value={smtp.username} placeholder="postmaster@mg.cfs.com.au"
                        onChange={e => { setSmtp(v => ({ ...v, username: e.target.value })); setSmtpDirty(true) }} />
                    </Field>
                    <Field label="Password">
                      <div style={{ position: 'relative' }}>
                        <FocusInput
                          type={showSmtpPassword ? 'text' : 'password'}
                          value={smtp.password}
                          placeholder="•••••••••"
                          onChange={e => { setSmtp(v => ({ ...v, password: e.target.value })); setSmtpDirty(true) }}
                          style={{ paddingRight: 44 }}
                        />
                        <button type="button" onClick={() => setShowSmtpPassword(v => !v)}
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'inherit' }}>
                          {showSmtpPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </Field>
                    <Field label="From Address">
                      <FocusInput type="email" value={smtp.fromAddress} placeholder="bookings@cfs.com.au"
                        onChange={e => { setSmtp(v => ({ ...v, fromAddress: e.target.value })); setSmtpDirty(true) }} />
                    </Field>
                    <Field label="From Name">
                      <FocusInput type="text" value={smtp.fromName} placeholder="Sydney CFS"
                        onChange={e => { setSmtp(v => ({ ...v, fromName: e.target.value })); setSmtpDirty(true) }} />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Document Requirements */}
          {tab === 'Bookings' && <GroupLabel>Document Requirements</GroupLabel>}
          {tab === 'Bookings' && (
            <div style={CARD}>
              <SectionHead title="Document Requirements" desc="Configure which documents are required per service + cargo type combination." />
              {docLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[0,1,2,3].map(i => <div key={i} style={{ height: 80, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.06)' }} />)}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {APPLIES_TO_OPTIONS.map(combo => {
                    const comboDocs = docRequirements.filter(d => d.appliesTo.includes(combo.key))
                    return (
                      <div key={combo.key} style={{ background: '#F9F9F8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                        {/* Combo header */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1917' }}>{combo.label}</span>
                          <span style={{ fontSize: 12, color: '#78716C', background: 'rgba(0,0,0,0.06)', borderRadius: 'var(--r-full)', padding: '2px 8px', fontWeight: 600 }}>{comboDocs.length} doc{comboDocs.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Doc rows */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {comboDocs.length === 0 && (
                            <div style={{ padding: '20px 16px', textAlign: 'center', color: '#A8A29E', fontSize: 13 }}>No documents configured</div>
                          )}
                          {comboDocs.map((doc, idx) => {
                            const isCustom = customInputIds.has(doc.id) || (!PREDEFINED_DOCS.includes(doc.name) && doc.name !== '')
                            return (
                              <div key={doc.id} style={{ padding: '12px 16px', borderTop: idx === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Name row */}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <CustomSelect
                                      placeholder="Select document..."
                                      value={isCustom ? '__custom__' : doc.name}
                                      onChange={v => {
                                        if (v === '__custom__') {
                                          setCustomInputIds(prev => new Set([...prev, doc.id]))
                                          if (!isCustom) updateDoc(doc.id, 'name', '')
                                        } else {
                                          setCustomInputIds(prev => { const s = new Set(prev); s.delete(doc.id); return s })
                                          updateDoc(doc.id, 'name', v)
                                        }
                                      }}
                                      options={[
                                        { value: 'Delivery Order',             label: 'Delivery Order' },
                                        { value: 'Biosecurity Direction',      label: 'Biosecurity Direction' },
                                        { value: 'Interim Receipt',            label: 'Interim Receipt' },
                                        { value: 'Booking Confirmation',       label: 'Booking Confirmation' },
                                        { value: 'Packing List',               label: 'Packing List' },
                                        { value: 'Cartage Advice',             label: 'Cartage Advice' },
                                        { value: 'Dangerous Goods Declaration',label: 'Dangerous Goods Declaration' },
                                        { value: 'Driver Licence',             label: 'Driver Licence' },
                                        { value: 'Vehicle Registration',       label: 'Vehicle Registration' },
                                        { value: 'Container Details',          label: 'Container Details' },
                                        { value: '__custom__',                 label: '+ Add Custom Document' },
                                      ]}
                                    />
                                    {isCustom && (
                                      <FocusInput
                                        type="text"
                                        value={doc.name}
                                        placeholder="Custom document name"
                                        onChange={e => updateDoc(doc.id, 'name', e.target.value)}
                                      />
                                    )}
                                  </div>
                                  <div style={{ flex: 1 }} />
                                  <button type="button" onClick={() => updateDoc(doc.id, 'required', !doc.required)}
                                    style={{ height: 32, padding: '0 10px', borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.10)', background: doc.required ? 'rgba(var(--brand-rgb),0.08)' : '#F7F6F5', color: doc.required ? 'var(--brand-color)' : '#78716C', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    {doc.required ? 'Required' : 'Optional'}
                                  </button>
                                  <button type="button" onClick={() => removeDocFromCombo(doc.id, combo.key)}
                                    style={{ height: 32, width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-full)', border: '1px solid rgba(239,68,68,0.20)', background: 'rgba(239,68,68,0.05)', color: '#EF4444', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}
                                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                                    onMouseOut={e  => (e.currentTarget.style.background = 'rgba(239,68,68,0.05)')}>
                                    <Icon name={ICONS.trash} size={12} />
                                  </button>
                                </div>
                                {/* File type chips */}
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                  {FILE_TYPE_OPTIONS.map(ft => {
                                    const on = doc.fileTypes.includes(ft)
                                    return (
                                      <button key={ft} type="button" onClick={() => toggleDocArray(doc.id, 'fileTypes', ft)}
                                        style={{ padding: '3px 8px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--r-full)', border: `1px solid ${on ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.12)'}`, background: on ? 'rgba(var(--brand-rgb),0.08)' : '#FAFAF9', color: on ? 'var(--brand-color)' : '#A8A29E', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.13s' }}>
                                        {ft}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Add doc to this combo */}
                        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                          <button type="button" onClick={() => addDocToCombo(combo.key)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 13, fontWeight: 600, color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.06)', border: '1px solid rgba(var(--brand-rgb),0.22)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
                            onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.10)')}
                            onMouseOut={e  => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.06)')}>
                            <Icon name={ICONS.add} size={12} />
                            Add document
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {/* User Management */}
          {tab === 'Team' && (() => {
            return (
              <div>
                {/* Invite section — admins and super_admins only */}
                {isAdmin && (
                <div style={CARD}>
                  <SectionHead title="Invite Staff Member" desc="Send an invitation email to a new reception team member." />

                  {!showInviteForm ? (
                    <button type="button" onClick={() => setShowInviteForm(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', fontSize: 15, fontWeight: 600, color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.25)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Icon name={ICONS.add} size={14} />
                      Invite Staff Member
                    </button>
                  ) : (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <label style={LABEL}>First Name</label>
                          <FocusInput type="text" placeholder="Jane" value={invite.firstName}
                            onChange={e => setInvite(v => ({ ...v, firstName: e.target.value }))} />
                        </div>
                        <div>
                          <label style={LABEL}>Last Name</label>
                          <FocusInput type="text" placeholder="Smith" value={invite.lastName}
                            onChange={e => setInvite(v => ({ ...v, lastName: e.target.value }))} />
                        </div>
                        <div>
                          <label style={LABEL}>Email *</label>
                          <FocusInput type="email" placeholder="jane@example.com" value={invite.email}
                            onChange={e => setInvite(v => ({ ...v, email: e.target.value }))} />
                        </div>
                        <div>
                          <label style={LABEL}>Role</label>
                          <CustomSelect
                            placeholder="Select role"
                            value={invite.role}
                            onChange={v => setInvite(inv => ({ ...inv, role: v }))}
                            options={[
                              { value: 'reception_staff', label: 'Reception Staff' },
                              { value: 'reception_admin', label: 'Reception Admin' },
                            ]}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" onClick={sendInvite} disabled={inviteSending}
                          style={{ ...SAVE, marginTop: 0, opacity: inviteSending ? 0.7 : 1, cursor: inviteSending ? 'not-allowed' : 'pointer' }}>
                          {inviteSending ? 'Sending…' : 'Send Invite'}
                        </button>
                        <button type="button" onClick={() => { setShowInviteForm(false); setInvite({ firstName: '', lastName: '', email: '', role: 'reception_staff' }) }}
                          style={{ marginTop: 0, padding: '11px 20px', fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )} {/* end isAdmin invite section */}

                {/* User list */}
                <div style={CARD}>
                  <SectionHead title="System Users" desc="View and manage all users with system access." />
                  {usersLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[0,1,2].map(i => <div key={i} style={{ height: 52, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
                    </div>
                  ) : staffUsers.length === 0 ? (
                    <p style={{ fontSize: 15, color: 'var(--text-tertiary)', margin: 0 }}>No staff members found.</p>
                  ) : (
                    <div style={{ overflowX: 'visible', overflow: 'visible' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                        <thead>
                          <tr style={{ background: '#F7F6F5', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                            {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {staffUsers.map(u => {
                            const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
                            const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
                              super_admin:      { label: 'Super Admin', bg: '#F5F3FF', color: '#7C3AED' },
                              reception_admin:  { label: 'Admin',       bg: '#EFF6FF', color: '#2563EB' },
                              reception_staff:  { label: 'Staff',       bg: '#F3F4F6', color: 'var(--text-mid)' },
                            }
                            const badge = ROLE_BADGE[u.role] ?? { label: u.role, bg: '#F3F4F6', color: 'var(--text-mid)' }
                            const BadgeEl = (
                              <span style={{ display: 'inline-block', fontSize: 13, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-sm)', background: badge.bg, color: badge.color }}>
                                {badge.label}
                              </span>
                            )
                            return (
                              <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1C1917', whiteSpace: 'nowrap' }}>{name}</td>
                                <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{u.email}</td>
                                <td style={{ padding: '12px 14px', position: 'relative', zIndex: 10 }}>
                                  {u.role === 'super_admin' ? (
                                    // super_admin rows show badge only — role is immutable
                                    <span title="Super admin role cannot be changed.">{BadgeEl}</span>
                                  ) : isSuperAdmin && u.id === currentUserId ? (
                                    // own row for super_admin (fallback — already caught above)
                                    BadgeEl
                                  ) : (
                                    <CustomSelect
                                      value={u.role}
                                      onChange={v => { if (v) updateRole(u.id, v) }}
                                      width={170}
                                      options={[
                                        { value: 'reception_staff', label: 'Reception Staff' },
                                        { value: 'reception_admin', label: 'Reception Admin' },
                                      ]}
                                    />
                                  )}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  {u.password_reset_required && !u.last_login_at ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 'var(--r-full)', fontSize: 14, fontWeight: 600, background: 'rgba(234,179,8,0.10)', color: '#B45309', border: '1px solid rgba(234,179,8,0.25)' }}>
                                      Pending Setup
                                    </span>
                                  ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 'var(--r-full)', fontSize: 14, fontWeight: 600, background: u.is_active ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)', color: u.is_active ? '#16A34A' : '#DC2626', border: `1px solid ${u.is_active ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)'}` }}>
                                      {u.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {u.last_login_at ? fmtDateTime(u.last_login_at) : '—'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  {u.role !== 'super_admin' && (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      {u.password_reset_required && !u.last_login_at ? (
                                        <button type="button" onClick={() => resendInvite(u)} disabled={resendingId === u.id}
                                          style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: '1px solid rgba(var(--brand-rgb),0.25)', background: 'rgba(var(--brand-rgb),0.07)', color: 'var(--brand-color)', cursor: resendingId === u.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: resendingId === u.id ? 0.6 : 1 }}>
                                          {resendingId === u.id ? '…' : 'Copy Link'}
                                        </button>
                                      ) : (
                                        <button type="button" onClick={() => toggleActive(u.id, u.is_active)}
                                          style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: `1px solid ${u.is_active ? 'rgba(239,68,68,0.22)' : 'rgba(34,197,94,0.22)'}`, background: u.is_active ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)', color: u.is_active ? '#DC2626' : '#16A34A', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                          {u.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                      )}
                                      <button type="button" onClick={() => setDeleteTarget(u)}
                                        style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.09)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9CA3AF', flexShrink: 0 }}
                                        onMouseOver={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
                                        onMouseOut={e  => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.09)' }}
                                        title="Delete user"
                                      >
                                        <Icon name={ICONS.trash} size={14} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

            {/* Staff Permissions */}
            {isAdmin && (() => {
              const PERM_GROUPS = [
                {
                  label: 'Bookings',
                  items: [
                    { key: 'can_view_id_scan'          as SpKey, label: 'View ID Scan Data',       desc: 'Allow staff to view driver licence numbers, addresses, and other captured ID data.' },
                    { key: 'can_mark_complete'          as SpKey, label: 'Mark Job Complete',       desc: 'Allow staff to mark bookings as completed. Disable if completion is admin-only.' },
                    { key: 'can_override_status'        as SpKey, label: 'Override Booking Status', desc: 'Allow staff to manually override booking status with a note.' },
                    { key: 'can_create_manual_booking'  as SpKey, label: 'Create Manual Booking',   desc: 'Allow staff to create bookings on behalf of visitors (phone-in).' },
                  ],
                },
                {
                  label: 'Reports',
                  items: [
                    { key: 'can_export_csv'             as SpKey, label: 'Export CSV / PDF',        desc: 'Allow staff to download booking lists and reports as CSV files.' },
                  ],
                },
                {
                  label: 'ICS',
                  items: [
                    { key: 'can_manual_ics_refresh'     as SpKey, label: 'Manual ICS Refresh',      desc: 'Allow staff to manually trigger an ICS clearance status refresh on a booking.' },
                  ],
                },
                {
                  label: 'Payments',
                  items: [
                    { key: 'can_view_charge_details'    as SpKey, label: 'View Charge Details',     desc: 'Show the full charge breakdown in the booking detail panel.' },
                    { key: 'can_confirm_eft'            as SpKey, label: 'Confirm EFT Payment',     desc: 'Allow staff to manually confirm EFT payments on bookings.' },
                  ],
                },
              ]
              return (
                <div style={{ ...CARD, marginTop: 0 }}>
                  <SectionHead title="Reception Staff Permissions" desc="Control what your front-desk staff can see and do. Admins are always unaffected." />
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {PERM_GROUPS.map((group, gi) => (
                        <React.Fragment key={gi}>
                          <tr>
                            <td colSpan={2} style={{ paddingTop: gi === 0 ? 16 : 24, paddingBottom: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{group.label}</span>
                            </td>
                          </tr>
                          {group.items.map((item, ii) => {
                            const val = staffPerms[item.key]
                            return (
                              <tr key={item.key} style={{ borderTop: ii === 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                                <td style={{ padding: '14px 0', paddingRight: 24, verticalAlign: 'middle' }}>
                                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{item.label}</p>
                                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>{item.desc}</p>
                                </td>
                                <td style={{ padding: '14px 0', verticalAlign: 'middle', width: 1, paddingLeft: 24 }}>
                                  <div
                                    onClick={() => setStaffPerms(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                    style={{ width: 42, height: 24, borderRadius: 'var(--r-full)', background: val ? 'var(--brand-color)' : '#D1D5DB', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                                  >
                                    <div style={{ position: 'absolute', top: 3, left: val ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.2s' }} />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {/* Setup link modal */}
            {setupLink && (
              <>
                <div onClick={() => setSetupLink(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 480, background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px' }}>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 6 }}>Share setup link</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                    Copy this link and share it with <strong>{setupLinkEmail}</strong>. It expires in 24 hours. Once SMTP is configured, this will be sent automatically.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    <input readOnly value={setupLink} style={{ flex: 1, padding: '9px 12px', fontSize: 13, borderRadius: 'var(--r-sm)', border: '1px solid rgba(0,0,0,0.12)', background: '#F7F6F5', color: '#374151', outline: 'none', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
                    <button
                      onClick={() => { navigator.clipboard.writeText(setupLink); toast('Link copied!', 'success') }}
                      style={{ padding: '9px 16px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Copy
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setSetupLink(null)} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Delete user confirm */}
            {deleteTarget && (
              <>
                <div onClick={() => setDeleteTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 400, background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={ICONS.trash} size={20} style={{ color: '#EF4444' }} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>Remove user?</h3>
                  </div>
                  <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                    <strong style={{ color: '#1C1917' }}>{deleteTarget.email}</strong> will lose all access immediately. This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                    <button onClick={() => setDeleteTarget(null)} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
                      Cancel
                    </button>
                    <button onClick={deleteUser} disabled={deleting} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: 'none', background: deleting ? 'rgba(239,68,68,0.5)' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {deleting ? 'Removing…' : 'Remove User'}
                    </button>
                  </div>
                </div>
              </>
            )}
            </div>
          )
          })()}
        </form>
      )}

      {/* Sticky save footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        padding: '14px 32px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16,
      }}>
        {tabDirty && (
          <p style={{ fontSize: 14, color: 'var(--brand-color)', fontWeight: 600 }}>You have unsaved changes</p>
        )}
        <button
          type="button"
          onClick={saveCurrentTab}
          disabled={!tabDirty || tabSaving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 24px', borderRadius: 'var(--r-full)', border: 'none',
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: (!tabDirty || tabSaving) ? 'not-allowed' : 'pointer',
            background: tabDirty ? 'var(--brand-color, #FC6514)' : 'rgba(0,0,0,0.08)',
            color: tabDirty ? '#fff' : 'var(--text-tertiary)',
            opacity: tabSaving ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {tabSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Navigation blocker modal */}
      {blocker.state === 'blocked' && (
        <>
          <div
            onClick={() => blocker.reset()}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 1001, width: 420, background: '#fff', borderRadius: 'var(--r-xl)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px',
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: '0 0 10px' }}>
              Leave without saving?
            </h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 24px' }}>
              You have unsaved changes. If you leave now, your changes will be lost.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => blocker.reset()}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Keep editing
              </button>
              <button
                onClick={() => blocker.proceed()}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 700, color: '#fff', background: '#EF4444', border: 'none', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Leave anyway
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
