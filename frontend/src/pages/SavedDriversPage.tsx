import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, deleteFetcher } from '@/lib/fetcher'
import { updateSavedDriver } from '@/lib/useSavedDrivers'
import { validators, sanitize } from '@/lib/validation'
import { Icon, ICONS } from '@/lib/Icon'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

interface SavedDriver {
  id: string
  name: string
  phone: string | null
  vehicle_registration: string
  blocked?: boolean
  block_reason?: string
}

function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderRadius: 'var(--r-md)',
      background: type === 'success' ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      fontSize: 15, fontWeight: 500,
      color: type === 'success' ? '#15803D' : '#DC2626',
      whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  )
}

function EditDriverModal({ driver, onClose, onSaved }: {
  driver: SavedDriver; onClose: () => void; onSaved: (d: SavedDriver) => void
}) {
  const [name, setName] = useState(driver.name)
  const [phone, setPhone] = useState(driver.phone ?? '')
  const [rego, setRego] = useState(driver.vehicle_registration)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Same field design as the booking wizard (/book, class .wizard-field) — recreated inline
  // rather than via the className, since that CSS file isn't actually wired into this app's
  // build (only the legacy pre-migration Hono layout referenced it).
  const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 6 }
  const FIELD: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)', border: '1px solid #E2E0DD', background: '#fff', fontSize: 15, color: '#1C1917', fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }
  const blur  = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = errors[e.target.name] ? '#EF4444' : 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }

  const validate = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Name must be at least 2 characters'
    if (!rego.trim()) e.rego = 'Vehicle registration is required'
    if (phone.trim() && validators.phoneAU(phone.trim())) e.phone = validators.phoneAU(phone.trim())
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const saved = await updateSavedDriver(driver.id, { name: name.trim(), phone: phone.trim(), vehicle_registration: rego.trim().toUpperCase() })
      onSaved(saved)
    } catch (err: any) {
      setErrors({ form: err?.message ?? 'Failed to save driver' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 420, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 'var(--r-xl)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={ICONS.edit} size={18} style={{ color: 'var(--brand-color)' }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>Edit driver</h3>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ ...LABEL, color: errors.name ? '#EF4444' : LABEL.color }}>Name</label>
          <input name="name" value={name}
            onChange={e => { setName(e.target.value); setErrors(er => ({ ...er, name: '' })) }}
            style={{ ...FIELD, borderColor: errors.name ? '#EF4444' : FIELD.borderColor }} onFocus={focus} onBlur={blur} />
          {errors.name && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{errors.name}</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ ...LABEL, color: errors.rego ? '#EF4444' : LABEL.color }}>Vehicle Registration</label>
          <input name="rego" value={rego}
            onChange={e => { setRego(e.target.value.toUpperCase()); setErrors(er => ({ ...er, rego: '' })) }}
            style={{ ...FIELD, textTransform: 'uppercase', letterSpacing: '0.05em', borderColor: errors.rego ? '#EF4444' : FIELD.borderColor }} onFocus={focus} onBlur={blur} />
          {errors.rego && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{errors.rego}</p>}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ ...LABEL, color: errors.phone ? '#EF4444' : LABEL.color }}>Phone Number <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#9CA3AF' }}>(optional)</span></label>
          <input name="phone" type="tel" inputMode="numeric" maxLength={10} value={phone}
            onChange={e => { setPhone(sanitize.digitsOnly(e.target.value)); setErrors(er => ({ ...er, phone: '' })) }}
            placeholder="04XX XXX XXX" style={{ ...FIELD, borderColor: errors.phone ? '#EF4444' : FIELD.borderColor }} onFocus={focus} onBlur={blur} />
          {errors.phone && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{errors.phone}</p>}
        </div>

        {errors.form && <p style={{ fontSize: 14, color: '#EF4444', marginBottom: 14 }}>{errors.form}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: 'none', background: saving ? 'rgba(0,0,0,0.2)' : 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

function DeleteConfirm({ driver, onClose, onConfirm, deleting }: {
  driver: SavedDriver; onClose: () => void; onConfirm: () => void; deleting: boolean
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 400, background: '#fff', borderRadius: 'var(--r-xl)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={ICONS.trash} size={20} style={{ color: '#EF4444' }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>Remove saved driver?</h3>
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
          <strong style={{ color: '#1C1917' }}>{driver.name}</strong> ({driver.vehicle_registration}) will be removed from your saved drivers. This won't affect existing bookings.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: 'none', background: deleting ? 'rgba(239,68,68,0.5)' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function SavedDriversPage() {
  usePageTitle('Glido | Saved Drivers')
  const { user, isLoading } = useAuth()

  const [drivers, setDrivers]       = useState<SavedDriver[]>([])
  const [loading, setLoading]       = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<SavedDriver | null>(null)
  const [deleting, setDeleting]     = useState(false)
  const [editTarget, setEditTarget] = useState<SavedDriver | null>(null)
  const [toast, setToast]           = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  if (!isLoading && !user) return <Navigate to="/visitor-login?redirect=/drivers" replace />

  useEffect(() => {
    fetcher(`/api/saved-drivers?tenantId=${DEFAULT_TENANT_ID}`)
      .then(res => setDrivers(res?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteFetcher(`/api/saved-drivers/${deleteTarget.id}`)
      setDrivers(prev => prev.filter(d => d.id !== deleteTarget.id))
      setToast({ message: 'Driver removed', type: 'success' })
      setDeleteTarget(null)
    } catch (err: any) {
      setToast({ message: err?.message ?? 'Failed to remove driver', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleEdited = (saved: SavedDriver) => {
    setDrivers(prev => prev.map(d => d.id === saved.id ? saved : d))
    setToast({ message: 'Driver updated', type: 'success' })
    setEditTarget(null)
  }

  if (isLoading) return null

  return (
    <div style={{ padding: '48px 24px 80px', minHeight: '100vh', background: 'color-mix(in srgb, var(--brand-color) 4%, #ffffff)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.09)', border: '1px solid rgba(var(--brand-rgb),0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={ICONS.car} size={20} style={{ color: 'var(--brand-color)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', margin: 0 }}>Saved Drivers</h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '2px 0 0' }}>Drivers autofilled from your past bookings</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ background: '#fff', border: '1px solid rgba(var(--brand-rgb),0.10)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 56, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div style={{ padding: '60px 28px', textAlign: 'center' }}>
              <Icon name={ICONS.car} size={40} style={{ color: 'rgba(0,0,0,0.12)', display: 'block', margin: '0 auto 14px' }} />
              <p style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No saved drivers yet</p>
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                Drivers are saved automatically when you complete a booking. They'll appear here for quick autofill next time.
              </p>
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
                  {drivers.length} saved driver{drivers.length !== 1 ? 's' : ''} — used to autofill the booking form
                </p>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
                {drivers.map((d, i) => (
                  <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', borderBottom: i < drivers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', background: d.blocked ? 'rgba(239,68,68,0.02)' : undefined }}>

                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: 'var(--r-full)', background: d.blocked ? 'rgba(239,68,68,0.08)' : 'rgba(var(--brand-rgb),0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, fontWeight: 700, color: d.blocked ? '#EF4444' : 'var(--brand-color)' }}>
                      {d.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: d.blocked ? '#9CA3AF' : '#1C1917', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                        {d.blocked && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'rgba(239,68,68,0.10)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.22)', whiteSpace: 'nowrap' }}>
                            Blocked
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 2, flexWrap: 'wrap' }}>
                        {d.vehicle_registration && (
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name={ICONS.car} size={12} style={{ opacity: 0.6 }} />
                            {d.vehicle_registration}
                          </span>
                        )}
                        {d.phone && (
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name={ICONS.phone} size={12} style={{ opacity: 0.6 }} />
                            {d.phone}
                          </span>
                        )}
                        {d.blocked && d.block_reason && (
                          <span style={{ fontSize: 13, color: '#DC2626', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                            "{d.block_reason}"
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Manage — edit this driver's info */}
                    <button
                      onClick={() => setEditTarget(d)}
                      title="Edit driver"
                      style={{ height: 30, padding: '0 12px', borderRadius: 'var(--r-md)', border: '1px solid rgba(var(--brand-rgb),0.22)', background: 'rgba(var(--brand-rgb),0.05)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--brand-color)', flexShrink: 0, transition: 'all 0.12s', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.12)' }}
                      onMouseOut={e  => { e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.05)' }}
                    >
                      <Icon name={ICONS.settings} size={13} /> Edit Details
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(d)}
                      title="Remove driver"
                      style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.09)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9CA3AF', flexShrink: 0, transition: 'color 0.12s, border-color 0.12s' }}
                      onMouseOver={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
                      onMouseOut={e  => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.09)' }}
                    >
                      <Icon name={ICONS.trash} size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Info note */}
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.5 }}>
          Drivers are saved automatically after a completed booking to speed up future bookings. Removing a driver here won't affect any existing bookings.
        </p>

      </div>

      {editTarget && (
        <EditDriverModal
          driver={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEdited}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          driver={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
    </div>
  )
}
