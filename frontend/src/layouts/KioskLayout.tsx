import type { ReactNode } from 'react'

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', background: '#FAFAF9', color: '#1C1917', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", WebkitFontSmoothing: 'antialiased', userSelect: 'none', touchAction: 'manipulation' }}>
      <style>{`
        *, *::before, *::after { touch-action: manipulation; box-sizing: border-box; }
        html, body, #root { height: 100%; width: 100%; overflow: hidden; margin: 0; padding: 0; }
        .kiosk-btn {
          min-height: 72px; min-width: 200px; font-size: 1.125rem; border-radius: 1rem;
          font-weight: 600; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
          transition: all 0.15s ease; cursor: pointer;
        }
        .kiosk-btn-primary {
          background: var(--brand-color, #FC6514); color:#000000;
          border:1px solid rgba(0,0,0,0.18);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px rgba(var(--brand-rgb,252,101,20),0.35), 0 1px 3px rgba(0,0,0,0.18);
        }
        .kiosk-btn-primary:hover { background: var(--brand-color, #FC6514); opacity:0.88; transform:translateY(-1px); }
        .kiosk-btn-primary:active { opacity:1; transform:translateY(0) scale(0.985); }
        .kiosk-btn-secondary { background:#fff; color:#78716C; border:1px solid rgba(0,0,0,0.12); }
        .kiosk-btn-secondary:hover { background:#F7F6F5; border-color:rgba(0,0,0,0.18); color:#1C1917; }
        .kiosk-option-card { background:#fff; color:#1C1917; border:1.5px solid rgba(0,0,0,0.10); text-align:left; }
        .kiosk-option-card:hover { border-color:var(--brand-color); background:rgba(var(--brand-rgb),0.04); }
        .kiosk-input {
          min-height:64px; font-size:1.5rem; letter-spacing:0.1em; text-align:center;
          width:100%; padding:14px 24px; border-radius:16px; outline:none; font-family:inherit;
          background:#F7F6F5; border:2px solid #C2C2C2; color:#1C1917;
        }
        .kiosk-input:focus { border-color:var(--brand-color); box-shadow:0 0 0 3px rgba(var(--brand-rgb),0.12); }
        .wizard-field {
          width:100%; padding:12px 16px; font-size:14px; color:#1C1917;
          background:#F7F6F5; border:1px solid rgba(0,0,0,0.10); border-radius:10px;
          outline:none; font-family:inherit; transition:border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .wizard-field:focus { border-color:rgba(var(--brand-rgb),0.50); box-shadow:0 0 0 3px rgba(var(--brand-rgb),0.12); }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        @keyframes pulse-slow { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        .pulse-slow { animation: pulse-slow 2.5s ease-in-out infinite; }
        .btn-primary {
          display:inline-flex; align-items:center; gap:8px; padding:13px 24px;
          font-size:14px; font-weight:600; color:#000000;
          background:var(--brand-color); border:none; border-radius:9999px;
          cursor:pointer; box-shadow:0 2px 8px rgba(var(--brand-rgb),0.35); font-family:inherit;
        }
      `}</style>
      <div style={{ height: '100%', width: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
