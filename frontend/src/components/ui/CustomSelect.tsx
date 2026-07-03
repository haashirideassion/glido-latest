import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption { value: string; label: string }

interface Props {
  placeholder?: string
  options: SelectOption[]
  value: string
  onChange: (v: string) => void
  width?: string | number
  onBlur?: () => void
  /** When true, selected value renders in dark text with neutral border — no orange active state */
  neutral?: boolean
}

export function CustomSelect({ placeholder, options, value, onChange, width = '100%', onBlur, neutral }: Props) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)

  const allOpts = placeholder ? [{ value: '', label: placeholder }, ...options] : options
  const label   = allOpts.find(o => o.value === value)?.label ?? placeholder ?? ''
  const active  = value !== ''

  const openDropdown = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setDropPos({ top: r.bottom + 5, left: r.left, width: r.width })
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      // Also ignore clicks inside the portal dropdown
      const panel = document.getElementById('custom-select-portal')
      if (panel?.contains(target)) return
      setOpen(false)
      onBlur?.()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onBlur])

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (!btnRef.current) return
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 5, left: r.left, width: r.width })
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  const dropdown = open && dropPos ? createPortal(
    <div
      id="custom-select-portal"
      style={{
        position: 'fixed',
        top: dropPos.top,
        left: dropPos.left,
        width: dropPos.width,
        minWidth: 160,
        zIndex: 99999,
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.09)',
        borderRadius: 'var(--r-md)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.11),0 2px 6px rgba(0,0,0,0.06)',
        padding: 5,
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      {allOpts.map(opt => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value || '__placeholder__'}
            type="button"
            onClick={() => { onChange(opt.value); setOpen(false); onBlur?.() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '9px 10px', borderRadius: 'var(--r-full)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: 15, fontFamily: 'inherit',
              background: selected ? 'rgba(var(--brand-rgb),0.08)' : 'transparent',
              color: selected ? 'var(--brand-color)' : '#1C1917',
              transition: 'background 0.12s ease',
            }}
            onMouseOver={e => { if (!selected) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
            onMouseOut={e  => { if (!selected) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {selected && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L4.5 8.5 10 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span>{opt.label || placeholder}</span>
          </button>
        )
      })}
    </div>,
    document.body
  ) : null

  return (
    <div ref={wrapRef} style={{ position: 'relative', width }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          fontSize: 15, padding: '11px 14px', height: 44, borderRadius: 'var(--r-full)',
          cursor: 'pointer', outline: 'none', transition: 'all 0.12s ease', boxSizing: 'border-box',
          background: (active && !neutral) ? 'rgba(var(--brand-rgb),0.05)' : '#F7F6F5',
          border: `1px solid ${(active && !neutral) ? 'rgba(var(--brand-rgb),0.40)' : 'rgba(0,0,0,0.10)'}`,
          color: (active && !neutral) ? 'var(--brand-color)' : active ? '#1C1917' : '#78716C',
          fontFamily: 'inherit', fontWeight: active ? 600 : 400,
          boxShadow: open ? '0 0 0 3px rgba(var(--brand-rgb),0.12)' : 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, opacity: 0.55, transition: 'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {dropdown}
    </div>
  )
}
