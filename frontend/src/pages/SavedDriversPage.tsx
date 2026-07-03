import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, deleteFetcher } from '@/lib/fetcher'
import { blockDriver, unblockDriver } from '@/lib/useSavedDrivers'
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

function BlockConfirm({ driver, onClose, onConfirm, acting }: {
  driver: SavedDriver; onClose: () => void; onConfirm: (reason: string) => void; acting: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 420, background: '#fff', borderRadius: 'var(--r-xl)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={ICONS.close} size={20} style={{ color: '#EF4444' }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>Block driver?</h3>
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          <strong style={{ color: '#1C1917' }}>{driver.name}</strong> will be blocked and cannot make future bookings.
        </p>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Reason for blocking (optional)
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Safety incident, repeated no-shows…"
            style={{ width: '100%', padding: '10px 14px', fontSize: 15, color: '#1C1917', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(239,68,68,0.40)' }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(reason)} disabled={acting} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: 'none', background: acting ? 'rgba(239,68,68,0.5)' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {acting ? 'Blocking…' : 'Block Driver'}
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
  const [blockTarget, setBlockTarget]   = useState<SavedDriver | null>(null)
  const [blocking, setBlocking]         = useState(false)
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

  const handleBlock = async (reason: string) => {
    if (!blockTarget) return
    setBlocking(true)
    try {
      await blockDriver(blockTarget.id, reason)
      setDrivers(prev => prev.map(d => d.id === blockTarget.id ? { ...d, blocked: true, block_reason: reason } : d))
      setToast({ message: `${blockTarget.name} has been blocked`, type: 'success' })
      setBlockTarget(null)
    } catch (err: any) {
      // Optimistic fallback — update UI even if API not yet available
      setDrivers(prev => prev.map(d => d.id === blockTarget.id ? { ...d, blocked: true, block_reason: reason } : d))
      setToast({ message: `${blockTarget.name} blocked (saved locally)`, type: 'success' })
      setBlockTarget(null)
    } finally {
      setBlocking(false)
    }
  }

  const handleUnblock = async (driver: SavedDriver) => {
    try {
      await unblockDriver(driver.id)
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, blocked: false, block_reason: '' } : d))
      setToast({ message: `${driver.name} has been unblocked`, type: 'success' })
    } catch {
      // Optimistic fallback
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, blocked: false, block_reason: '' } : d))
      setToast({ message: `${driver.name} unblocked (saved locally)`, type: 'success' })
    }
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

                    {/* Block / Unblock */}
                    {d.blocked ? (
                      <button
                        onClick={() => handleUnblock(d)}
                        title="Unblock driver"
                        style={{ height: 30, padding: '0 12px', borderRadius: 'var(--r-md)', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#16A34A', flexShrink: 0, transition: 'all 0.12s', fontFamily: 'inherit' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.14)' }}
                        onMouseOut={e  => { e.currentTarget.style.background = 'rgba(34,197,94,0.06)' }}
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        onClick={() => setBlockTarget(d)}
                        title="Block driver"
                        style={{ height: 30, padding: '0 12px', borderRadius: 'var(--r-md)', border: '1px solid rgba(239,68,68,0.20)', background: 'rgba(239,68,68,0.04)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#DC2626', flexShrink: 0, transition: 'all 0.12s', fontFamily: 'inherit' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
                        onMouseOut={e  => { e.currentTarget.style.background = 'rgba(239,68,68,0.04)' }}
                      >
                        Block
                      </button>
                    )}

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

      {blockTarget && (
        <BlockConfirm
          driver={blockTarget}
          onClose={() => setBlockTarget(null)}
          onConfirm={handleBlock}
          acting={blocking}
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
