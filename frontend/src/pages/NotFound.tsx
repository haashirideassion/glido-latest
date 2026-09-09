import { Link } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { GlidoLogo } from '@/lib/GlidoLogo'

export default function NotFound() {
  usePageTitle('Glido | Page Not Found')
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
      background: 'linear-gradient(160deg,#FAFAF9 0%,#F7F6F5 100%)',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      position: 'relative',
    }}>
      {/* Dot grid background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1.5px, transparent 1.5px)', backgroundSize: '28px 28px', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 48 }}>
          <GlidoLogo height={22} onDark={false} />
        </div>

        {/* 404 */}
        <p style={{
          fontSize: 'clamp(5rem,20vw,9rem)', fontWeight: 800, color: 'var(--brand-color)',
          letterSpacing: '-0.06em', lineHeight: 1, margin: '0 0 8px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          404
        </p>

        {/* Heading */}
        <h1 style={{
          fontSize: 'clamp(1.4rem,3vw,1.875rem)', fontWeight: 700, color: '#1C1917',
          letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 12px',
        }}>
          Page not found
        </h1>

        {/* Subtext */}
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 36px' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Secondary — Go Back */}
          <button
            onClick={() => window.history.back()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 28px', fontSize: 15, fontWeight: 600, color: '#374151',
              background: '#fff', border: '1.5px solid #e5e7eb',
              borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'border-color 0.15s ease, color 0.15s ease, transform 0.18s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#1C1917'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseOut={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.transform = '' }}
          >
            ← Go Back
          </button>

          {/* Primary — Go Home */}
          <Link
            to="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 28px', fontSize: 15, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,#FF7A2A 0%,#E85A0A 100%)',
              borderRadius: 'var(--r-full)', textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(var(--brand-rgb),0.42)' }}
            onMouseOut={e  => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(var(--brand-rgb),0.35)' }}
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  )
}
