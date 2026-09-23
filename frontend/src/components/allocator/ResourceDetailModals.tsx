import React, { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import {
  getTruck, getTrailer, getDriver, getTrucks, getTrailers, getDrivers,
  updateTruck, updateTrailer, updateDriver, assignTruckResources,
} from '@/lib/db/resources'
import { getTruckCustomField, customFieldInputType, type CustomFieldConfig } from '@/lib/db/truck-custom-field'
import { toast } from '@/lib/toast'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { Rego } from '@/components/ui/Rego'
import type { Truck, Trailer, Driver, ResourceStatus, DriverStatus } from '@/data/types'

export const RESOURCE_STATUS_STYLE: Record<ResourceStatus, { bg: string; color: string; label: string; icon: string }> = {
  available:   { bg: 'rgba(34,197,94,0.10)',  color: '#16A34A', label: 'Available',   icon: ICONS.check },
  on_trip:     { bg: 'rgba(234,179,8,0.10)',  color: '#A16207', label: 'On Trip',      icon: ICONS.clock },
  maintenance: { bg: 'rgba(234,88,12,0.10)',  color: '#EA580C', label: 'Maintenance', icon: ICONS.wrench },
}
export const DRIVER_STATUS_STYLE: Record<DriverStatus, { bg: string; color: string; label: string; icon: string }> = {
  on_duty:  { bg: 'rgba(34,197,94,0.10)',  color: '#16A34A', label: 'On Duty',  icon: ICONS.check },
  off_duty: { bg: 'rgba(37,99,235,0.08)',  color: '#2563EB', label: 'Off Duty', icon: ICONS.clock },
  on_leave: { bg: 'rgba(147,51,234,0.10)', color: '#9333EA', label: 'On Leave', icon: ICONS.calendar },
}

// Last Service Date renders as YY-MM-DD per FRD (e.g. "26-08-15").
export function fmtResourceDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const yy = String(d.getFullYear()).slice(2)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${yy}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StatusBadge({ status, driver }: { status: string; driver?: boolean }) {
  const s = driver ? DRIVER_STATUS_STYLE[status as DriverStatus] : RESOURCE_STATUS_STYLE[status as ResourceStatus]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      <Icon name={s.icon} size={12} />{s.label}
    </span>
  )
}

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** One label/value pair inside an assigned-resource block. */
function MiniField({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1px' }}>{label}</p>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: empty ? 'var(--text-tertiary)' : '#1C1917', margin: 0, fontFamily: mono && !empty ? 'ui-monospace,monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {empty ? '—' : value}
      </p>
    </div>
  )
}

/**
 * Every stored field on the trailer and driver attached to a truck, rather than a one-line
 * summary. These blocks were `CODE · type, capacity` and `Name · class, Ny exp`, which dropped
 * status, service dates and the record's own timestamps — the things you actually check before
 * committing a vehicle to a job.
 */
export function AssignedResourcesSection({ trailer, driver }: { trailer?: Trailer; driver?: Driver }) {
  if (!trailer && !driver) {
    return <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>No resources assigned</p>
  }
  const grid: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '8px 14px', marginTop: 8,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {trailer && (
        <div style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.14)', padding: '9px 11px', borderRadius: 'var(--r-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={ICONS.trailer} size={13} style={{ color: '#7C3AED', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', fontFamily: 'ui-monospace,monospace' }}>{trailer.resourceCode}</span>
            <StatusBadge status={trailer.status} />
          </div>
          <div style={grid}>
            <MiniField label="Type"         value={trailer.trailerType} />
            <MiniField label="Capacity"     value={trailer.capacity} />
            <MiniField label="Last Service" value={fmtDay(trailer.lastServiceDate)} />
            <MiniField label="Attached"     value={trailer.attachedTruckId ? 'Yes' : 'No'} />
            <MiniField label="Added"        value={fmtDay(trailer.createdAt)} />
            <MiniField label="Updated"      value={fmtDay(trailer.updatedAt)} />
          </div>
        </div>
      )}
      {driver && (
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.14)', padding: '9px 11px', borderRadius: 'var(--r-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={ICONS.driver} size={13} style={{ color: '#16A34A', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>{driver.driverName}</span>
            <StatusBadge status={driver.status} driver />
          </div>
          <div style={grid}>
            <MiniField label="ID"         value={driver.resourceCode} mono />
            <MiniField label="Licence"    value={driver.licenseClass} />
            <MiniField label="Experience" value={driver.experienceYears != null ? `${driver.experienceYears}y` : undefined} />
            <MiniField label="Assigned"   value={driver.assignedTruckId ? 'Yes' : 'No'} />
            <MiniField label="Added"      value={fmtDay(driver.createdAt)} />
            <MiniField label="Updated"    value={fmtDay(driver.updatedAt)} />
          </div>
        </div>
      )}
    </div>
  )
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1C1917' }}>{value}</span>
    </div>
  )
}

// ─── Shared slide-over shell — docked split-view (wide screens) or full overlay (narrow) ───
// Matches the pattern used by Customer Portal's RequestDetailsPanel / Reception's BookingSlideOver.
function DetailSlideOver({ docked = false, onClose, children }: { docked?: boolean; onClose: () => void; children: React.ReactNode }) {
  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(460px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }

  return (
    <>
      {!docked && (
        <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />
      )}
      <motion.div style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }} animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}>
        {children}
      </motion.div>
    </>
  )
}

function SlideOverHeader({ title, status, driver, onEdit, onClose }: { title: React.ReactNode; status?: string; driver?: boolean; onEdit?: () => void; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {status && <StatusBadge status={status} driver={driver} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {onEdit && (
          <button type="button" onClick={onEdit}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.edit} size={13} />Edit
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  )
}

const EDIT_INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</p>
      {children}
    </div>
  )
}

/** Jump to the truck a driver or trailer is attached to. Kept inside the edit form so the link
 *  survives now that these two panels open straight into editing and have no read-only view. */
function ViewTruckLink({ truckId, onViewTruck }: { truckId?: string | null; onViewTruck: (id: string) => void }) {
  if (!truckId) return null
  return (
    <button type="button" onClick={() => onViewTruck(truckId)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13.5, fontFamily: 'inherit', fontWeight: 600 }}>
      <Icon name={ICONS.truck} size={12} />View Truck
    </button>
  )
}

function EditFooter({ onCancel, onSave, saving }: { onCancel: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
      <button type="button" onClick={onCancel} disabled={saving}
        style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={saving}
        style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}

// Generic selector used by any page that needs to open a resource's details.
export type ResourceSelector = { kind: 'truck' | 'trailer' | 'driver'; id: string } | null

export function ResourceDetailModal({ selector, onClose, onSelect, onUpdated, docked = false }: { selector: ResourceSelector; onClose: () => void; onSelect: (next: ResourceSelector) => void; onUpdated?: () => void; docked?: boolean }) {
  if (!selector) return null
  if (selector.kind === 'truck') return <TruckDetailPanel truckId={selector.id} onClose={onClose} onUpdated={onUpdated} docked={docked} />
  if (selector.kind === 'trailer') return <TrailerDetailPanel trailerId={selector.id} onClose={onClose} onUpdated={onUpdated} docked={docked} onViewTruck={id => onSelect({ kind: 'truck', id })} />
  return <DriverDetailPanel driverId={selector.id} onClose={onClose} onUpdated={onUpdated} docked={docked} onViewTruck={id => onSelect({ kind: 'truck', id })} />
}

export function TruckDetailPanel({ truckId, onClose, onUpdated, docked = false }: { truckId: string; onClose: () => void; onUpdated?: () => void; docked?: boolean }) {
  const [truck, setTruck] = useState<Truck | null>(null)
  const [editing, setEditing] = useState(false)
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [saving, setSaving] = useState(false)
  const [fieldConfig, setFieldConfig] = useState<CustomFieldConfig>({ label: null, type: 'text' })

  const [rego, setRego] = useState('')
  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<ResourceStatus>('available')
  const [customFieldValue, setCustomFieldValue] = useState('')
  const [trailerId, setTrailerId] = useState('')
  const [driverId, setDriverId] = useState('')

  const load = () => { getTruck(truckId).then(setTruck).catch(() => {}) }
  useEffect(load, [truckId])
  useEffect(() => { getTruckCustomField().then(setFieldConfig).catch(() => {}) }, [])

  const startEdit = () => {
    if (!truck) return
    setRego(truck.vehicleRegistration ?? '')
    setType(truck.truckType ?? ''); setCapacity(truck.capacity ?? ''); setLocation(truck.location ?? ''); setStatus(truck.status)
    setCustomFieldValue(truck.customFieldValue ?? '')
    setTrailerId(truck.assignedTrailer?.id ?? ''); setDriverId(truck.assignedDriver?.id ?? '')
    Promise.all([getTrailers(), getDrivers()]).then(([tr, d]) => { setTrailers(tr); setDrivers(d) }).catch(() => {})
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const result = await updateTruck(truckId, { vehicle_registration: rego.trim(), truck_type: type.trim() || undefined, capacity: capacity.trim() || undefined, location: location.trim() || undefined, status, custom_field_value: customFieldValue.trim() || '' })
      if (!result) { toast('Could not save changes. Please try again.', 'error'); return }
      await assignTruckResources(truckId, { trailerId: trailerId || '', driverId: driverId || '' })
      toast('Truck updated', 'success')
      setEditing(false)
      load()
      onUpdated?.()
    } catch {
      toast('Could not save changes. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailSlideOver docked={docked} onClose={onClose}>
      <SlideOverHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{truck?.resourceCode ?? 'Truck'}<Rego value={truck?.vehicleRegistration} /></span>}
        status={truck?.status} onEdit={!editing ? startEdit : undefined} onClose={onClose} />
      {!truck ? (
        <div style={{ padding: '40px 24px' }}><p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading…</p></div>
      ) : editing ? (
        <>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <EditField label="Rego"><input value={rego} onChange={e => setRego(e.target.value)} placeholder="ABC-123" style={EDIT_INPUT} /></EditField>
            <EditField label="Type"><input value={type} onChange={e => setType(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="Capacity"><input value={capacity} onChange={e => setCapacity(e.target.value)} style={EDIT_INPUT} /></EditField>
            {fieldConfig.label && (
              <EditField label={fieldConfig.label}><input type={customFieldInputType(fieldConfig.type)} value={customFieldValue} onChange={e => setCustomFieldValue(e.target.value)} style={EDIT_INPUT} /></EditField>
            )}
            <EditField label="Location"><input value={location} onChange={e => setLocation(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="Status">
              <CustomSelect value={status} onChange={v => setStatus(v as ResourceStatus)} options={[{ value: 'available', label: 'Available' }, { value: 'on_trip', label: 'On Trip' }, { value: 'maintenance', label: 'Maintenance' }]} />
            </EditField>
            <EditField label="Assign Trailer">
              <CustomSelect value={trailerId} onChange={setTrailerId} placeholder="None" options={trailers.map(t => ({ value: t.id, label: t.resourceCode }))} />
            </EditField>
            <EditField label="Assign Driver">
              <CustomSelect value={driverId} onChange={setDriverId} placeholder="None" options={drivers.map(d => ({ value: d.id, label: d.driverName }))} />
            </EditField>
          </div>
          <EditFooter onCancel={() => setEditing(false)} onSave={save} saving={saving} />
        </>
      ) : (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div>
            <DetailRow label="Rego" value={truck.vehicleRegistration ?? '—'} />
            <DetailRow label="Type" value={truck.truckType ?? '—'} />
            <DetailRow label="Capacity" value={truck.capacity ?? '—'} />
            {fieldConfig.label && <DetailRow label={fieldConfig.label} value={truck.customFieldValue ?? '—'} />}
            <DetailRow label="Location" value={truck.location ?? '—'} />
            <DetailRow label="Last Service" value={fmtResourceDate(truck.lastServiceDate)} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Assigned Resources</p>
            <AssignedResourcesSection trailer={truck.assignedTrailer ?? undefined} driver={truck.assignedDriver ?? undefined} />
          </div>
        </div>
      )}
    </DetailSlideOver>
  )
}

export function TrailerDetailPanel({ trailerId, onClose, onViewTruck, onUpdated, docked = false }: { trailerId: string; onClose: () => void; onViewTruck: (id: string) => void; onUpdated?: () => void; docked?: boolean }) {
  const [trailer, setTrailer] = useState<Trailer | null>(null)
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [saving, setSaving] = useState(false)

  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [status, setStatus] = useState<ResourceStatus>('available')
  const [attachedTruckId, setAttachedTruckId] = useState('')

  const load = () => { getTrailer(trailerId).then(setTrailer).catch(() => {}) }
  useEffect(load, [trailerId])
  useEffect(() => { getTrucks().then(setTrucks).catch(() => {}) }, [])

  // This panel IS the form — there is no read-only view to toggle out of, so the fields are
  // seeded whenever the record arrives, including after a save refetches it.
  useEffect(() => {
    if (!trailer) return
    setType(trailer.trailerType ?? ''); setCapacity(trailer.capacity ?? '')
    setStatus(trailer.status); setAttachedTruckId(trailer.attachedTruckId ?? '')
  }, [trailer])

  const save = async () => {
    setSaving(true)
    try {
      const result = await updateTrailer(trailerId, { trailer_type: type.trim() || undefined, capacity: capacity.trim() || undefined, status, attached_truck_id: attachedTruckId || '' })
      if (!result) { toast('Could not save changes. Please try again.', 'error'); return }
      toast('Trailer updated', 'success')
      load()
      onUpdated?.()
    } catch {
      toast('Could not save changes. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailSlideOver docked={docked} onClose={onClose}>
      <SlideOverHeader title={trailer?.resourceCode ?? 'Trailer'} status={trailer?.status} onClose={onClose} />
      {!trailer ? (
        <div style={{ padding: '40px 24px' }}><p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading…</p></div>
      ) : (
        <>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <EditField label="Type"><input value={type} onChange={e => setType(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="Capacity"><input value={capacity} onChange={e => setCapacity(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="Status">
              <CustomSelect value={status} onChange={v => setStatus(v as ResourceStatus)} options={[{ value: 'available', label: 'Available' }, { value: 'on_trip', label: 'On Trip' }, { value: 'maintenance', label: 'Maintenance' }]} />
            </EditField>
            <EditField label="Attached Truck">
              <CustomSelect value={attachedTruckId} onChange={setAttachedTruckId} placeholder="None" options={trucks.map(t => ({ value: t.id, label: t.resourceCode }))} />
              <ViewTruckLink truckId={trailer.attachedTruckId} onViewTruck={onViewTruck} />
            </EditField>
            {/* Not editable here — shown so the record still reads whole. */}
            <DetailRow label="Last Service" value={fmtResourceDate(trailer.lastServiceDate)} />
          </div>
          <EditFooter onCancel={onClose} onSave={save} saving={saving} />
        </>
      )}
    </DetailSlideOver>
  )
}

export function DriverDetailPanel({ driverId, onClose, onViewTruck, onUpdated, docked = false }: { driverId: string; onClose: () => void; onViewTruck: (id: string) => void; onUpdated?: () => void; docked?: boolean }) {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [licenseClass, setLicenseClass] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [status, setStatus] = useState<DriverStatus>('off_duty')
  const [assignedTruckId, setAssignedTruckId] = useState('')

  const load = () => { getDriver(driverId).then(setDriver).catch(() => {}) }
  useEffect(load, [driverId])
  useEffect(() => { getTrucks().then(setTrucks).catch(() => {}) }, [])

  // This panel IS the form — there is no read-only view to toggle out of, so the fields are
  // seeded whenever the record arrives, including after a save refetches it.
  useEffect(() => {
    if (!driver) return
    setName(driver.driverName)
    setLicenseClass(driver.licenseClass ?? '')
    setExperienceYears(driver.experienceYears != null ? String(driver.experienceYears) : '')
    setStatus(driver.status); setAssignedTruckId(driver.assignedTruckId ?? '')
  }, [driver])

  const save = async () => {
    if (!name.trim()) { toast('Driver name is required', 'error'); return }
    setSaving(true)
    try {
      const result = await updateDriver(driverId, {
        driver_name: name.trim(), license_class: licenseClass.trim() || undefined,
        experience_years: experienceYears ? Number(experienceYears) : undefined, status, assigned_truck_id: assignedTruckId || '',
      })
      if (!result) { toast('Could not save changes. Please try again.', 'error'); return }
      toast('Driver updated', 'success')
      load()
      onUpdated?.()
    } catch {
      toast('Could not save changes. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailSlideOver docked={docked} onClose={onClose}>
      <SlideOverHeader title={driver?.driverName ?? 'Driver'} status={driver?.status} driver onClose={onClose} />
      {!driver ? (
        <div style={{ padding: '40px 24px' }}><p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading…</p></div>
      ) : (
        <>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <EditField label="Driver Name"><input value={name} onChange={e => setName(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="License Class"><input value={licenseClass} onChange={e => setLicenseClass(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="Experience (years)"><input type="number" min={0} value={experienceYears} onChange={e => setExperienceYears(e.target.value)} style={EDIT_INPUT} /></EditField>
            <EditField label="Status">
              <CustomSelect value={status} onChange={v => setStatus(v as DriverStatus)} options={[{ value: 'on_duty', label: 'On Duty' }, { value: 'off_duty', label: 'Off Duty' }, { value: 'on_leave', label: 'On Leave' }]} />
            </EditField>
            <EditField label="Assigned Vehicle">
              <CustomSelect value={assignedTruckId} onChange={setAssignedTruckId} placeholder="None" options={trucks.map(t => ({ value: t.id, label: t.resourceCode }))} />
              {/* Kept from the old read-only view — the jump to the attached truck. */}
              <ViewTruckLink truckId={driver.assignedTruckId} onViewTruck={onViewTruck} />
            </EditField>
            {/* Not editable — the resource code is system-assigned. */}
            <DetailRow label="ID" value={driver.resourceCode} />
          </div>
          <EditFooter onCancel={onClose} onSave={save} saving={saving} />
        </>
      )}
    </DetailSlideOver>
  )
}
