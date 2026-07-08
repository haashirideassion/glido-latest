import { useState, useEffect, useRef } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { usePageTitle } from '@/lib/usePageTitle'
import { toast } from '@/lib/toast'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { getCarriers, updateCarrier, getCarrierDrivers, type Carrier, type CarrierInput, type CarrierDriver } from '@/lib/db/carriers'
import { blockKnownDriver, unblockDriver } from '@/lib/useSavedDrivers'
import { AnimatedNumber, motion } from '@/lib/motion'
import { EmptyState } from '@/components/reception/EmptyState'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.07)',
  borderRadius: 'var(--r-lg)',
  padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 15,
  color: '#1C1917', background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)',
  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}

function focusStyle(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  el.style.borderColor = 'rgba(var(--brand-rgb),0.50)'
  el.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)'
}
function blurStyle(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  el.style.borderColor = 'rgba(0,0,0,0.12)'
  el.style.boxShadow = 'none'
}

function StarRating({ value: rawValue, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  const value = rawValue != null ? Number(rawValue) : null
  const [hovered, setHovered] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = (hovered ?? value ?? 0) >= n
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            onMouseEnter={() => onChange && setHovered(n)}
            onMouseLeave={() => onChange && setHovered(null)}
            style={{ background: 'none', border: 'none', padding: '2px', cursor: onChange ? 'pointer' : 'default', color: filled ? '#F59E0B' : 'rgba(0,0,0,0.15)', lineHeight: 1 }}
          >
            <iconify-icon icon="solar:star-bold" width={18} />
          </button>
        )
      })}
      {value !== null && value !== undefined && (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 4, lineHeight: '22px' }}>{value.toFixed(1)}</span>
      )}
    </div>
  )
}


// ─── Carrier detail pane (split view) ──────────────────────────────────────────
// Every carrier here is a visitor account — bookings/last visit come live from the server
// (computed from real bookings), and there's no delete: the record exists for as long as
// the account does. Email is read-only since it's the account's login, not editable here.
function CarrierPane({ carrier, docked, onClose, onSaved }: {
  carrier: Carrier; docked?: boolean
  onClose: () => void; onSaved: (c: Carrier) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CarrierInput>({
    name: carrier.name, abn: carrier.abn, status: carrier.status,
    contact_name: carrier.contact_name,
    contact_phone: carrier.contact_phone, address: carrier.address,
    notes: carrier.notes, total_bookings: carrier.total_bookings,
    last_visit: carrier.last_visit, rating: carrier.rating,
  })
  const [saving, setSaving] = useState(false)

  // Drivers this carrier has actually used (derived from their booking history)
  const [drivers, setDrivers] = useState<CarrierDriver[]>([])
  const [driversLoading, setDriversLoading] = useState(true)
  const [blockTarget, setBlockTarget] = useState<CarrierDriver | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [unblockingName, setUnblockingName] = useState<string | null>(null)

  const loadDrivers = () => {
    setDriversLoading(true)
    getCarrierDrivers(carrier.id).then(setDrivers).catch(() => setDrivers([])).finally(() => setDriversLoading(false))
  }

  // Reset form when carrier changes (e.g. row switch)
  useEffect(() => {
    setEditing(false)
    setForm({
      name: carrier.name, abn: carrier.abn, status: carrier.status,
      contact_name: carrier.contact_name,
      contact_phone: carrier.contact_phone, address: carrier.address,
      notes: carrier.notes, total_bookings: carrier.total_bookings,
      last_visit: carrier.last_visit, rating: carrier.rating,
    })
    loadDrivers()
  }, [carrier.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmBlock = async () => {
    if (!blockTarget || !blockReason.trim()) return
    setBlocking(true)
    try {
      await blockKnownDriver({
        name: blockTarget.driver_name, phone: blockTarget.driver_phone,
        vehicle_registration: blockTarget.vehicle_registration, saved_driver_id: blockTarget.saved_driver_id,
      }, blockReason.trim())
      toast(`${blockTarget.driver_name} has been blocked`, 'success')
      setBlockTarget(null)
      setBlockReason('')
      loadDrivers()
    } catch (err: any) {
      toast(err?.message ?? 'Failed to block driver', 'error')
    } finally {
      setBlocking(false)
    }
  }

  const handleUnblock = async (d: CarrierDriver) => {
    if (!d.saved_driver_id) return
    setUnblockingName(d.driver_name)
    try {
      await unblockDriver(d.saved_driver_id)
      toast(`${d.driver_name} has been unblocked`, 'success')
      loadDrivers()
    } catch (err: any) {
      toast(err?.message ?? 'Failed to unblock driver', 'error')
    } finally {
      setUnblockingName(null)
    }
  }

  const set = (k: keyof CarrierInput, v: any) => setForm(f => ({ ...f, [k]: v || null }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast('Carrier name is required', 'error'); return }
    setSaving(true)
    try {
      const saved = await updateCarrier(carrier.id, form)
      toast('Carrier updated', 'success')
      onSaved(saved)
      setEditing(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save carrier', 'error')
    } finally {
      setSaving(false)
    }
  }

  const isActive = (editing ? form.status : carrier.status) === 'active'
  const PANEL: React.CSSProperties = { background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-sm)', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
  const SL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }
  const rows = [
    { label: 'Contact', value: carrier.contact_name,  icon: ICONS.user },
    { label: 'Email',   value: carrier.contact_email,  icon: ICONS.email },
    { label: 'Phone',   value: carrier.contact_phone,  icon: ICONS.phone },
    { label: 'Address', value: carrier.address,        icon: 'solar:map-point-bold-duotone' },
    { label: 'ABN',     value: carrier.abn,            icon: ICONS.document },
  ].filter(r => r.value)
  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', right: 0, top: 0, height: '100%', width: 'min(460px, 100vw)', zIndex: 50, background: '#FFFFFF', borderLeft: '1px solid rgba(0,0,0,0.08)', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }

  return (
    <>
      {!docked && <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,25,23,0.35)', backdropFilter: 'blur(4px)' }} />}
      <motion.div
        style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }}
        animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 12px 18px', borderBottom: '1px solid rgba(0,0,0,0.07)', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: isActive ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <iconify-icon icon="solar:buildings-bold-duotone" width={20} style={{ color: isActive ? 'var(--brand-color)' : '#9CA3AF' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editing ? form.name || carrier.name : carrier.name}</h3>
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#16A34A' : '#6B7280' }}>{editing ? 'Editing' : (isActive ? 'Active' : 'Inactive')}</span>
            </div>
          </div>
          <button onClick={editing ? () => setEditing(false) : onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#1C1917' }}
            onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, background: '#F5F4F3', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editing ? (
            /* ── Edit form ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                <div>
                  <label style={{ ...SL, display: 'block' }}>Company Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input style={{ ...INPUT, borderRadius: 'var(--r-sm)' }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
                </div>
                <div>
                  <label style={{ ...SL, display: 'block' }}>Status</label>
                  <CustomSelect value={form.status} onChange={v => setForm(f => ({ ...f, status: v as 'active' | 'inactive' }))} neutral
                    options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
                </div>
              </div>
              <div>
                <label style={{ ...SL, display: 'block' }}>ABN</label>
                <input style={{ ...INPUT, borderRadius: 'var(--r-sm)' }} value={form.abn ?? ''} onChange={e => set('abn', e.target.value)}
                  onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ ...SL, display: 'block' }}>Contact Person</label>
                  <input style={{ ...INPUT, borderRadius: 'var(--r-sm)' }} value={form.contact_name ?? ''} onChange={e => set('contact_name', e.target.value)}
                    onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
                </div>
                <div>
                  <label style={{ ...SL, display: 'block' }}>Phone</label>
                  <input style={{ ...INPUT, borderRadius: 'var(--r-sm)' }} type="tel" value={form.contact_phone ?? ''} onChange={e => set('contact_phone', e.target.value)}
                    onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
                </div>
              </div>
              <div>
                <label style={{ ...SL, display: 'block' }}>Email <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-tertiary)' }}>(the account's login — not editable here)</span></label>
                <input style={{ ...INPUT, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.03)', color: 'var(--text-secondary)' }} type="email" value={carrier.contact_email ?? ''} readOnly />
              </div>
              <div>
                <label style={{ ...SL, display: 'block' }}>Address</label>
                <input style={{ ...INPUT, borderRadius: 'var(--r-sm)' }} value={form.address ?? ''} onChange={e => set('address', e.target.value)}
                  onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
              </div>
              <div>
                <label style={{ ...SL, display: 'block' }}>Rating</label>
                <StarRating value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
              </div>
              <div>
                <label style={{ ...SL, display: 'block' }}>Notes</label>
                <textarea style={{ ...INPUT, borderRadius: 'var(--r-sm)', resize: 'vertical', minHeight: 80, lineHeight: 1.6 }}
                  value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
                  onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
              </div>
            </div>
          ) : (
            /* ── Read-only view ── */
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={PANEL}><p style={SL}>Bookings</p><p style={{ fontSize: 22, fontWeight: 800, color: '#1C1917', margin: 0, lineHeight: 1 }}>{carrier.total_bookings}</p></div>
                <div style={PANEL}><p style={SL}>Last Visit</p><p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{carrier.last_visit ?? '—'}</p></div>
              </div>
              {rows.length > 0 && (
                <section>
                  <p style={SL}>Details</p>
                  <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rows.map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', flexShrink: 0 }}><iconify-icon icon={r.icon} width={14} style={{ color: 'var(--text-secondary)' }} />{r.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <p style={SL}>Drivers</p>
                {driversLoading ? (
                  <div style={{ ...PANEL, fontSize: 14, color: 'var(--text-tertiary)' }}>Loading…</div>
                ) : drivers.length === 0 ? (
                  <div style={{ ...PANEL, fontSize: 14, color: 'var(--text-tertiary)' }}>No drivers on record yet</div>
                ) : (
                  <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px' }}>
                    {drivers.map((d, i) => (
                      <div key={d.driver_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: i < drivers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: d.blocked ? '#9CA3AF' : '#1C1917', textDecoration: d.blocked ? 'line-through' : undefined }}>{d.driver_name}</span>
                            {d.blocked && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-full)', padding: '1px 7px' }}>Blocked</span>
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                            {[d.vehicle_registration, d.driver_phone, `${d.trips} trip${d.trips === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                          </p>
                          {d.blocked && d.block_reason && (
                            <p style={{ fontSize: 12, color: '#DC2626', fontStyle: 'italic', margin: '2px 0 0' }}>"{d.block_reason}"</p>
                          )}
                        </div>
                        {d.blocked ? (
                          <button
                            onClick={() => handleUnblock(d)}
                            disabled={unblockingName === d.driver_name}
                            style={{ height: 28, padding: '0 10px', borderRadius: 'var(--r-md)', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#16A34A', flexShrink: 0, fontFamily: 'inherit' }}
                          >
                            {unblockingName === d.driver_name ? 'Unblocking…' : 'Unblock'}
                          </button>
                        ) : (
                          <button
                            onClick={() => { setBlockTarget(d); setBlockReason('') }}
                            style={{ height: 28, padding: '0 10px', borderRadius: 'var(--r-md)', border: '1px solid rgba(239,68,68,0.20)', background: 'rgba(239,68,68,0.04)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#DC2626', flexShrink: 0, fontFamily: 'inherit' }}
                          >
                            Block
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {carrier.rating != null && (
                <section><p style={SL}>Rating</p><div style={PANEL}><StarRating value={carrier.rating} /></div></section>
              )}
              {carrier.notes && (
                <section><p style={SL}>Notes</p><div style={{ ...PANEL, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{carrier.notes}</div></section>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ flexShrink: 0, padding: '14px 16px', display: 'flex', gap: 8, borderTop: '1px solid rgba(0,0,0,0.07)', background: '#FFFFFF' }}>
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-full)', border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 'var(--r-full)', border: 'none', background: saving ? 'rgba(0,0,0,0.08)' : 'var(--brand-color)', color: saving ? 'rgba(0,0,0,0.35)' : 'var(--brand-text)', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-full)', border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name={ICONS.edit} size={15} /> Edit Carrier Details</button>
          )}
        </div>
      </motion.div>

      {/* ── Block driver — reason required ── */}
      {blockTarget && (
        <>
          <div onClick={() => !blocking && setBlockTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, width: 400, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', padding: '24px 24px 20px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#DC2626', textTransform: 'uppercase', margin: '0 0 6px' }}>Block Driver</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: '0 0 16px' }}>Block {blockTarget.driver_name}?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px' }}>
              This driver will be blocked and cannot make future bookings. Tell us why:
            </p>
            <label style={{ ...SL, display: 'block' }}>Reason <span style={{ color: '#EF4444' }}>*</span></label>
            <textarea
              rows={3} autoFocus
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
              placeholder="e.g. Safety incident, repeated no-shows…"
              style={{ ...INPUT, borderRadius: 'var(--r-sm)', resize: 'none', marginBottom: 18 }}
              onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setBlockTarget(null)} disabled={blocking} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-full)', border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmBlock} disabled={blocking || !blockReason.trim()} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-full)', border: 'none', background: blocking || !blockReason.trim() ? 'rgba(239,68,68,0.35)' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: blocking || !blockReason.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {blocking ? 'Blocking…' : 'Confirm Block'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CarriersPage() {
  usePageTitle('Glido | Carriers')

  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  // Split view
  const [selected, setSelected] = useState<Carrier | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Bookings/last-visit already come back computed live from the server (joined against real
  // bookings by account, not string-matched) — no separate client-side aggregation needed.
  const load = async (q?: string, s?: string) => {
    setLoading(true)
    try {
      const data = await getCarriers({ search: q ?? search, status: s ?? statusFilter })
      setCarriers(data)
    } catch (err: any) {
      // Surface load failures instead of silently showing an empty list — a server error here
      // otherwise looks identical to "no carriers yet", which is exactly what masked the
      // missing-migration bug during development.
      toast(err?.message ?? 'Failed to load carriers', 'error')
    }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const handleSearch = (v: string) => {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(v, statusFilter), 300)
  }

  const handleStatusFilter = (v: 'all' | 'active' | 'inactive') => {
    setStatusFilter(v)
    load(search, v)
  }

  const handleSaved = (saved: Carrier) => {
    setCarriers(prev => prev.map(c => c.id === saved.id ? saved : c))
    setSelected(sel => (sel && sel.id === saved.id ? saved : sel))
  }

  // Stats
  const totalCarriers  = carriers.length
  const activeCarriers = carriers.filter(c => c.status === 'active').length
  const totalBookings  = carriers.reduce((s, c) => s + c.total_bookings, 0)
  const thisMonth      = carriers.filter(c => {
    if (!c.created_at) return false
    const d = new Date(c.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Stats ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {[
          { label: 'Total Carriers',  value: totalCarriers,  sub: 'Registered companies', icon: ICONS.users,     iconBg: 'rgba(28,25,23,0.06)',   iconFg: '#1C1917'  },
          { label: 'Active Carriers', value: activeCarriers, sub: 'Currently active',      icon: ICONS.check,     iconBg: 'rgba(34,197,94,0.10)',  iconFg: '#22C55E'  },
          { label: 'Total Bookings',  value: totalBookings,  sub: 'Across all carriers',   icon: ICONS.bookings,  iconBg: 'rgba(37,99,235,0.10)',  iconFg: '#2563EB'  },
          { label: 'New This Month',  value: thisMonth,      sub: 'New registrations',     icon: ICONS.calendar,  iconBg: 'rgba(251,191,36,0.10)', iconFg: '#FBBF24'  },
        ].map((stat, i) => (
          <div key={stat.label} style={{ flex: 1, minWidth: 0, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: stat.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${stat.iconFg}22` }}>
                <Icon name={stat.icon} size={17} style={{ color: stat.iconFg }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.label}</p>
            </div>
            <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={stat.value} /></p>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* Search */}
        <div style={{ flex: 1, position: 'relative' }}>
          <Icon name={ICONS.search} size={17} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search carriers by name, contact or ABN…"
            style={{ ...INPUT, paddingLeft: 38, height: 42 }}
            onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}
          />
        </div>

        {/* Status filter */}
        {(['all', 'active', 'inactive'] as const).map(s => {
          const active = statusFilter === s
          return (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              style={{
                height: 40, padding: '0 14px', fontSize: 14, fontWeight: active ? 700 : 500,
                borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)',
              }}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          )
        })}

      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ ...CARD, height: 140, background: 'rgba(0,0,0,0.04)', border: 'none', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : carriers.length === 0 ? (
        <div style={{ ...CARD, padding: 0 }}>
          <EmptyState
            variant={search ? 'search' : 'box'}
            title={search ? 'No carriers match your search' : 'No carriers yet'}
            subtitle={search ? 'Try a different name or ABN.' : 'Every customer who registers a visitor account will appear here automatically.'}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* List */}
          <div style={{ flex: 1, minWidth: 0, ...CARD, padding: 0, overflow: 'hidden' }}>
            {(() => {
              const paneOpen = !!selected && isWide
              const TH: React.CSSProperties = { textAlign: 'left', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(0,0,0,0.07)', background: '#FAFAF9', position: 'sticky', top: 0, zIndex: 1 }
              const TD: React.CSSProperties = { padding: '10px 14px', fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(0,0,0,0.05)' }
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={TH}>Carrier</th>
                        {!paneOpen && <th style={TH}>ABN</th>}
                        <th style={TH}>Bookings</th>
                        {!paneOpen && <th style={TH}>Last Visit</th>}
                        <th style={TH}>Rating</th>
                        <th style={{ ...TH, textAlign: 'right' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {carriers.map(c => {
                        const isSel = selected?.id === c.id
                        const active = c.status === 'active'
                        return (
                          <tr key={c.id} onClick={() => setSelected(c)}
                            style={{ cursor: 'pointer', background: isSel ? 'rgba(var(--brand-rgb),0.06)' : 'transparent', transition: 'background 0.12s' }}
                            onMouseOver={e => { if (!isSel) e.currentTarget.style.background = '#FAFAF9' }}
                            onMouseOut={e  => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={TD}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', background: active ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <iconify-icon icon="solar:buildings-bold-duotone" width={17} style={{ color: active ? 'var(--brand-color)' : '#9CA3AF' }} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1917' }}>{c.name}</div>
                                  <div style={{ fontSize: 12, color: active ? '#16A34A' : '#9CA3AF', fontWeight: 500 }}>{active ? 'Active' : 'Inactive'}</div>
                                </div>
                              </div>
                            </td>
                            {!paneOpen && <td style={{ ...TD, color: c.abn ? '#1C1917' : 'var(--text-tertiary)' }}>{c.abn ?? '—'}</td>}
                            <td style={{ ...TD, color: '#1C1917', fontWeight: 600 }}>{c.total_bookings}</td>
                            {!paneOpen && <td style={TD}>{c.last_visit ?? '—'}</td>}
                            <td style={TD}>{c.rating != null ? <StarRating value={c.rating} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                            <td style={{ ...TD, textAlign: 'right', color: 'var(--text-tertiary)', opacity: 0.5 }}>›</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>

          {/* Docked detail pane */}
          {selected && isWide && (
            <div style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <CarrierPane carrier={selected} docked onClose={() => setSelected(null)} onSaved={handleSaved} />
            </div>
          )}
        </div>
      )}

      {/* Detail overlay — narrow screens */}
      {selected && !isWide && (
        <CarrierPane carrier={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
    </div>
  )
}
