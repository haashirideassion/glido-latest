// Mirrors the `OptionCard` tile used in the booking wizard's Step2SlotPicker.tsx —
// same `.wiz-tile` treatment (gradient fill, selected checkmark badge, icon well).
// Pass `image` for a thiings.co-style illustration (rendered plain, no tint) or
// `icon` for an <Icon> glyph (rendered inside the tinted well) — image wins if both given.
export function OptionTile({ selected, onClick, icon, image, title, desc, disabled }: {
  selected: boolean; onClick: () => void; icon?: React.ReactNode; image?: string
  title: string; desc: string; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`wiz-tile${selected ? ' selected' : ''}`}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: '20px 18px 18px',
        border: selected ? '2px solid var(--brand-color)' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
        width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {selected && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          width: 20, height: 20, borderRadius: 'var(--r-full)',
          background: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff), var(--brand-color))',
          boxShadow: '0 2px 5px rgba(var(--brand-rgb),0.4), inset 0 1px 0 rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <div style={{
        width: 112, height: 112, borderRadius: 'var(--r-xl)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14, flexShrink: 0,
        background: selected
          ? 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff) 0%, var(--brand-color) 60%, color-mix(in srgb, var(--brand-color) 78%, #000) 100%)'
          : 'linear-gradient(160deg, #F7F6F5 0%, #ECEBE9 100%)',
        color: selected ? 'var(--brand-text)' : '#6B7280', transition: 'all 0.15s ease',
        boxShadow: selected
          ? '0 2px 4px rgba(0,0,0,0.10), 0 6px 16px rgba(var(--brand-rgb),0.30), inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.12)'
          : 'inset 0 1.5px 3px rgba(0,0,0,0.06), 0 1px 1px rgba(255,255,255,0.8)',
      }}>
        {image ? <img src={image} alt="" style={{ width: 80, height: 80, objectFit: 'contain' }} /> : icon}
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.2 }}>{title}</p>
      <p style={{ fontSize: 14, color: 'var(--text-mid, #4F4F4F)', lineHeight: 1.4, marginBottom: 0 }}>{desc}</p>
    </button>
  )
}
