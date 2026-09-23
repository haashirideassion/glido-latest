import { motion } from 'motion/react'
import { Icon } from '@/lib/Icon'

// Shared slide-over shell — docked split-view (wide screens) or full overlay (narrow),
// matching the pattern used across Allocator/Planner/Reception (e.g. ResourceDetailModals.tsx).
export function DetailSlideOver({ docked = false, onClose, children }: { docked?: boolean; onClose: () => void; children: React.ReactNode }) {
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

export function SlideOverHeader({ title, badge, onClose }: { title: React.ReactNode; badge?: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {badge}
      </div>
      <button type="button" onClick={onClose} aria-label="Close"
        style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

export const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }

export function EmptyState({ icon, text, action }: { icon: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)' }}>
      <Icon name={icon} size={32} style={{ color: 'rgba(0,0,0,0.14)' }} />
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>{text}</p>
      {action && <button onClick={action.onClick} style={{ marginTop: 12, background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>{action.label}</button>}
    </div>
  )
}

export function MenuItem({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13.5, border: 'none', background: 'none', cursor: disabled ? 'default' : 'pointer', color: disabled ? 'var(--text-tertiary)' : danger ? '#DC2626' : '#1C1917', opacity: disabled ? 0.5 : 1 }}
      onMouseOver={e => { if (!disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseOut={e => e.currentTarget.style.background = 'none'}>
      {label}
    </button>
  )
}

export function ModalShell({ title, onClose, children, maxWidth = 560 }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: 'var(--r-lg)', padding: 24, width: '100%', maxWidth, maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ModalActions({ onClose, onSubmit, saving, submitLabel }: { onClose: () => void; onSubmit: () => void; saving: boolean; submitLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
      <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
      <button onClick={onSubmit} disabled={saving} style={{ background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 20px', fontSize: 13.5, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : submitLabel}</button>
    </div>
  )
}

export function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: 13.5, color: '#1C1917', fontWeight: 500, margin: 0 }}>{value}</p>
    </div>
  )
}

export function FieldInput({ label, value, onChange, full, type = 'text', placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; full?: boolean; type?: string; placeholder?: string; disabled?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={INPUT} />
    </div>
  )
}

export function FieldTextarea({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={{ ...INPUT, resize: 'vertical' }} />
    </div>
  )
}

export function FieldSelect({ label, value, onChange, options, full }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={INPUT}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

export function Field({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
      {icon && <Icon name={icon} size={13} style={{ color: 'var(--text-tertiary)' }} />}
      <span style={{ color: 'var(--text-tertiary)' }}>{label}:</span>
      <span style={{ color: '#1C1917', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
