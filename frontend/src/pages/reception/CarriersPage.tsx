import { useState, useEffect, useRef } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { usePageTitle } from '@/lib/usePageTitle'
import { toast } from '@/lib/toast'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { getCarriers, createCarrier, updateCarrier, deleteCarrier, type Carrier, type CarrierInput } from '@/lib/db/carriers'
import { getBookings } from '@/lib/db/bookings'
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
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: 'var(--text-secondary)', letterSpacing: '0.07em',
  textTransform: 'uppercase', marginBottom: 6,
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

// ─── Carrier Modal ────────────────────────────────────────────────────────────
const EMPTY_FORM: CarrierInput = {
  name: '', abn: null, status: 'active',
  contact_name: null, contact_email: null, contact_phone: null,
  address: null, notes: null,
  total_bookings: 0, last_visit: null, rating: null,
}

function CarrierModal({
  carrier, onClose, onSaved,
}: {
  carrier: Carrier | null
  onClose: () => void
  onSaved: (c: Carrier) => void
}) {
  const isEdit = !!carrier
  const [form, setForm] = useState<CarrierInput>(
    carrier
      ? { name: carrier.name, abn: carrier.abn, status: carrier.status, contact_name: carrier.contact_name, contact_email: carrier.contact_email, contact_phone: carrier.contact_phone, address: carrier.address, notes: carrier.notes, total_bookings: carrier.total_bookings, last_visit: carrier.last_visit, rating: carrier.rating }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)

  const set = (k: keyof CarrierInput, v: any) => setForm(f => ({ ...f, [k]: v || null }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast('Carrier name is required', 'error'); return }
    setSaving(true)
    try {
      let saved: Carrier
      if (isEdit && carrier) {
        saved = await updateCarrier(carrier.id, form)
      } else {
        saved = await createCarrier(form)
      }
      toast(isEdit ? 'Carrier updated' : 'Carrier added', 'success')
      onSaved(saved)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save carrier', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001,
        width: '100%', maxWidth: 560,
        maxHeight: '90vh',
        background: '#FFFFFF',
        borderRadius: 'var(--r-xl)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <iconify-icon icon="solar:buildings-bold-duotone" width={22} style={{ color: 'var(--brand-color)' }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: 0 }}>
              {isEdit ? 'Edit Carrier' : 'Add New Carrier'}
            </h2>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1C1917', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Name + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 16 }}>
              <div>
                <label style={LABEL}>Company Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input style={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. ABC Logistics Pty Ltd"
                  onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
              </div>
              <div>
                <label style={LABEL}>Status</label>
                <CustomSelect
                  value={form.status}
                  onChange={v => setForm(f => ({ ...f, status: v as 'active' | 'inactive' }))}
                  neutral
                  options={[
                    { value: 'active',   label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </div>
            </div>

            {/* ABN */}
            <div>
              <label style={LABEL}>ABN</label>
              <input style={INPUT} value={form.abn ?? ''} onChange={e => set('abn', e.target.value)}
                placeholder="e.g. 12 345 678 901"
                onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
            </div>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={LABEL}>Contact Person</label>
                <input style={INPUT} value={form.contact_name ?? ''} onChange={e => set('contact_name', e.target.value)}
                  placeholder="Full name"
                  onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
              </div>
              <div>
                <label style={LABEL}>Phone</label>
                <input style={INPUT} type="tel" value={form.contact_phone ?? ''} onChange={e => set('contact_phone', e.target.value)}
                  placeholder="+61 2 1234 5678"
                  onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
              </div>
            </div>

            <div>
              <label style={LABEL}>Email</label>
              <input style={INPUT} type="email" value={form.contact_email ?? ''} onChange={e => set('contact_email', e.target.value)}
                placeholder="contact@company.com.au"
                onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
            </div>

            <div>
              <label style={LABEL}>Address</label>
              <input style={INPUT} value={form.address ?? ''} onChange={e => set('address', e.target.value)}
                placeholder="123 Freight Ave, Sydney NSW 2000"
                onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
            </div>

            {/* Rating */}
            <div>
              <label style={LABEL}>Rating</label>
              <StarRating value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
            </div>

            {/* Notes */}
            <div>
              <label style={LABEL}>Notes</label>
              <textarea style={{ ...INPUT, resize: 'vertical', minHeight: 80, lineHeight: 1.6 }} value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                placeholder="Internal notes about this carrier…"
                onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)} />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: '#FAFAF9' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', border: 'none', background: saving ? 'rgba(0,0,0,0.08)' : 'var(--brand-color)', color: saving ? 'rgba(0,0,0,0.35)' : 'var(--brand-text)', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Carrier'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ carrier, onClose, onDeleted }: { carrier: Carrier; onClose: () => void; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  const confirm = async () => {
    setDeleting(true)
    try {
      await deleteCarrier(carrier.id)
      toast('Carrier deleted', 'success')
      onDeleted(carrier.id)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to delete', 'error')
      setDeleting(false)
    }
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, width: 400, background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', padding: '28px 28px 24px' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>Delete carrier?</h3>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24 }}>
          <strong style={{ color: '#1C1917' }}>{carrier.name}</strong> will be permanently removed. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>Cancel</button>
          <button onClick={confirm} disabled={deleting} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: 'none', background: deleting ? 'rgba(239,68,68,0.5)' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Carrier Card ─────────────────────────────────────────────────────────────
function CarrierCard({ carrier, liveBookings, liveLastVisit, onEdit, onDelete }: { carrier: Carrier; liveBookings?: number; liveLastVisit?: string | null; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const isActive = carrier.status === 'active'
  const hasDetails = carrier.contact_name || carrier.contact_email || carrier.contact_phone || carrier.address || carrier.notes

  return (
    <div style={{ ...CARD, padding: 0, transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}
    >
      {/* ── Header row (always visible, click to expand) ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {/* Avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--r-md)', flexShrink: 0,
            background: isActive ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <iconify-icon icon="solar:buildings-bold-duotone" width={22} style={{ color: isActive ? 'var(--brand-color)' : '#9CA3AF' }} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>{carrier.name}</h3>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 9px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600,
                background: isActive ? 'rgba(22,163,74,0.08)' : 'rgba(0,0,0,0.06)',
                color: isActive ? '#16A34A' : '#6B7280',
                border: `1px solid ${isActive ? 'rgba(22,163,74,0.22)' : 'rgba(0,0,0,0.10)'}`,
              }}>
                {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />}
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 3 }}>
              {carrier.abn && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>ABN {carrier.abn}</p>}
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>{liveBookings ?? carrier.total_bookings} bookings</p>
              {(liveLastVisit ?? carrier.last_visit) && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Last visit {liveLastVisit ?? carrier.last_visit}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right side: actions + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {carrier.rating !== null && carrier.rating !== undefined && (
            <StarRating value={carrier.rating} />
          )}
          {/* Actions menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
              style={{ background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-md)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-tertiary)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 100, width: 140, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit() }} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                  <Icon name={ICONS.edit} size={15} /> Edit
                </button>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete() }} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                  <Icon name={ICONS.trash} size={15} /> Delete
                </button>
              </div>
            )}
          </div>

          {/* Chevron */}
          {hasDetails && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          )}
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && hasDetails && (
        <div style={{ padding: '0 20px 16px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, paddingTop: 16 }}>
            {carrier.contact_name && <InfoChip icon={ICONS.user} label={carrier.contact_name} sub="Contact" />}
            {carrier.contact_email && <InfoChip icon={ICONS.email} label={carrier.contact_email} sub="Email" />}
            {carrier.contact_phone && <InfoChip icon={ICONS.phone} label={carrier.contact_phone} sub="Phone" />}
            {carrier.address && <InfoChip icon="solar:map-point-bold-duotone" label={carrier.address} sub="Address" />}
          </div>
          {carrier.notes && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '12px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>{carrier.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

function InfoChip({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, background: 'rgba(0,0,0,0.025)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
      <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <iconify-icon icon={icon} width={16} style={{ color: 'var(--brand-color)' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 2px', fontWeight: 500 }}>{sub}</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
      </div>
    </div>
  )
}

function StatChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <iconify-icon icon={icon} width={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  )
}

// ─── Carrier detail pane (split view) ─────────────────────────────────────────
function CarrierPane({ carrier, liveBookings, liveLastVisit, docked, onClose, onEdit, onDelete }: {
  carrier: Carrier; liveBookings?: number; liveLastVisit?: string | null; docked?: boolean
  onClose: () => void; onEdit: () => void; onDelete: () => void
}) {
  const isActive = carrier.status === 'active'
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
    : { position: 'fixed', right: 0, top: 0, height: '100%', width: 'min(460px, 100vw)', zIndex: 50, background: '#FFFFFF', borderLeft: '1px solid rgba(0,0,0,0.08)', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }
  return (
    <>
      {!docked && <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,25,23,0.35)', backdropFilter: 'blur(4px)' }} />}
      <motion.div
        style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }}
        animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 12px 18px', borderBottom: '1px solid rgba(0,0,0,0.07)', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: isActive ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <iconify-icon icon="solar:buildings-bold-duotone" width={20} style={{ color: isActive ? 'var(--brand-color)' : '#9CA3AF' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{carrier.name}</h3>
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#16A34A' : '#6B7280' }}>{isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 'var(--r-full)', border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={ICONS.close} size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F5F4F3', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={PANEL}><p style={SL}>Bookings</p><p style={{ fontSize: 22, fontWeight: 800, color: '#1C1917', margin: 0, lineHeight: 1 }}>{liveBookings ?? carrier.total_bookings}</p></div>
            <div style={PANEL}><p style={SL}>Last Visit</p><p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{liveLastVisit ?? carrier.last_visit ?? '—'}</p></div>
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
          {carrier.rating != null && (
            <section><p style={SL}>Rating</p><div style={PANEL}><StarRating value={carrier.rating} /></div></section>
          )}
          {carrier.notes && (
            <section><p style={SL}>Notes</p><div style={{ ...PANEL, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{carrier.notes}</div></section>
          )}
        </div>
        <div style={{ flexShrink: 0, padding: '14px 16px', display: 'flex', gap: 8, borderTop: '1px solid rgba(0,0,0,0.07)', background: '#FFFFFF' }}>
          <button onClick={onEdit} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-full)', border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name={ICONS.edit} size={15} /> Edit</button>
          <button onClick={onDelete} style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-full)', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#DC2626', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name={ICONS.trash} size={15} /> Delete</button>
        </div>
      </motion.div>
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
  const [modal, setModal] = useState<'add' | Carrier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Carrier | null>(null)
  // Live booking stats keyed by carrier name (lowercase for matching)
  const [bookingStats, setBookingStats] = useState<Map<string, { count: number; lastVisit: string | null }>>(new Map())
  // Split view
  const [selected, setSelected] = useState<Carrier | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const load = async (q?: string, s?: string) => {
    setLoading(true)
    try {
      const [data, allBookings] = await Promise.all([
        getCarriers({ search: q ?? search, status: s ?? statusFilter }),
        getBookings(),
      ])
      setCarriers(data)
      // Build stats map: company name (lowercase) → { count, lastVisit }
      const stats = new Map<string, { count: number; lastVisit: string | null }>()
      for (const b of allBookings) {
        if (!b.companyName) continue
        const key = b.companyName.toLowerCase().trim()
        const existing = stats.get(key) ?? { count: 0, lastVisit: null }
        existing.count += 1
        // Keep the latest slot date as lastVisit
        if (!existing.lastVisit || b.slotDate > existing.lastVisit) {
          existing.lastVisit = b.slotDate
        }
        stats.set(key, existing)
      }
      setBookingStats(stats)
    } catch { /* ignore */ }
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
    setCarriers(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      return idx >= 0 ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev]
    })
    setSelected(sel => (sel && sel.id === saved.id ? saved : sel))
    setModal(null)
  }

  const handleDeleted = (id: string) => {
    setCarriers(prev => prev.filter(c => c.id !== id))
    setSelected(sel => (sel && sel.id === id ? null : sel))
    setDeleteTarget(null)
  }

  // Stats
  const totalCarriers  = carriers.length
  const activeCarriers = carriers.filter(c => c.status === 'active').length
  // Use live booking count from DB rather than manually-stored total_bookings
  const totalBookings  = Array.from(bookingStats.values()).reduce((s, v) => s + v.count, 0)
  const thisMonth      = carriers.filter(c => {
    if (!c.created_at) return false
    const d = new Date(c.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  // Helper to look up live stats for a carrier
  const liveStats = (name: string) => bookingStats.get(name.toLowerCase().trim())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Carriers',  value: totalCarriers,  sub: 'Registered companies', icon: ICONS.users,     iconBg: 'rgba(28,25,23,0.06)',   iconFg: '#1C1917'  },
          { label: 'Active Carriers', value: activeCarriers, sub: 'Currently active',      icon: ICONS.check,     iconBg: 'rgba(34,197,94,0.10)',  iconFg: '#22C55E'  },
          { label: 'Total Bookings',  value: totalBookings,  sub: 'Across all carriers',   icon: ICONS.bookings,  iconBg: 'rgba(37,99,235,0.10)',  iconFg: '#2563EB'  },
          { label: 'New This Month',  value: thisMonth,      sub: 'New registrations',     icon: ICONS.calendar,  iconBg: 'rgba(251,191,36,0.10)', iconFg: '#FBBF24'  },
        ].map(stat => (
          <div key={stat.label} style={{ ...CARD, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: stat.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${stat.iconFg}22` }}>
                <Icon name={stat.icon} size={17} style={{ color: stat.iconFg }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{stat.label}</p>
            </div>
            <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={stat.value} /></p>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>{stat.sub}</p>
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

        {/* Add button */}
        <button
          onClick={() => setModal('add')}
          style={{ padding: '0 20px', height: 42, borderRadius: 'var(--r-md)', border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
        >
          <Icon name={ICONS.add} size={18} style={{ color: 'var(--brand-text)' }} />
          Add Carrier
        </button>
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
            subtitle={search ? 'Try a different name or ABN.' : 'Add your first internal carrier to get started.'}
            action={!search && (
              <button onClick={() => setModal('add')} style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Add Carrier
              </button>
            )}
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
                        const ls = liveStats(c.name)
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
                            <td style={{ ...TD, color: '#1C1917', fontWeight: 600 }}>{ls?.count ?? c.total_bookings}</td>
                            {!paneOpen && <td style={TD}>{ls?.lastVisit ?? c.last_visit ?? '—'}</td>}
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
            <div style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)' }}>
              <CarrierPane carrier={selected} liveBookings={liveStats(selected.name)?.count} liveLastVisit={liveStats(selected.name)?.lastVisit} docked onClose={() => setSelected(null)} onEdit={() => setModal(selected)} onDelete={() => setDeleteTarget(selected)} />
            </div>
          )}
        </div>
      )}

      {/* Detail overlay — narrow screens */}
      {selected && !isWide && (
        <CarrierPane carrier={selected} liveBookings={liveStats(selected.name)?.count} liveLastVisit={liveStats(selected.name)?.lastVisit} onClose={() => setSelected(null)} onEdit={() => setModal(selected)} onDelete={() => setDeleteTarget(selected)} />
      )}

      {/* ── Modals ── */}
      {(modal === 'add' || (modal && modal !== 'add')) && (
        <CarrierModal
          carrier={modal === 'add' ? null : modal as Carrier}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          carrier={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
    </div>
  )
}
