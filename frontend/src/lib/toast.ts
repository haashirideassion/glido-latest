/**
 * Lightweight imperative toast — matches the original gToast() exactly.
 * Usage: toast('Message', 'success' | 'error' | 'info')
 *
 * Call initToast() once (done inside ToastContainer mount).
 */

const SPRING = 'cubic-bezier(0.16,1,0.3,1)'

let container: HTMLDivElement | null = null

export function initToast() {
  if (document.getElementById('g-toast-container')) return
  const ct = document.createElement('div')
  ct.id = 'g-toast-container'
  ct.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:99998;' +
    'display:flex;flex-direction:column;gap:8px;pointer-events:none;'
  document.body.appendChild(ct)
  container = ct
}

export function toast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
  if (!container) initToast()
  const ct = container ?? document.getElementById('g-toast-container') as HTMLDivElement
  if (!ct) return

  const bg =
    type === 'error'   ? '#DC2626' :
    type === 'success' ? '#16A34A' :
    '#1C1917'

  const t = document.createElement('div')
  t.style.cssText =
    `background:${bg};color:#fff;padding:11px 18px;border-radius:12px;` +
    `font-size:13px;font-weight:500;font-family:'Red Hat Display',ui-sans-serif,sans-serif;` +
    `box-shadow:0 8px 24px rgba(0,0,0,0.22);pointer-events:all;` +
    `opacity:0;transform:translateY(8px);` +
    `transition:opacity 0.25s ease,transform 0.28s ${SPRING};` +
    `white-space:normal;word-break:break-word;overflow-wrap:break-word;max-width:360px;`
  t.textContent = msg
  ct.appendChild(t)

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      t.style.opacity   = '1'
      t.style.transform = 'translateY(0)'
    })
  })

  // Animate out + remove
  setTimeout(() => {
    t.style.opacity   = '0'
    t.style.transform = 'translateY(8px)'
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t) }, 300)
  }, 3200)
}
