import { fmtDate, fmtNum, fmtTime, serviceLabel, type JobSheet } from './cfs'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : esc(v))

/** What the sheet needs to brand itself. Everything is optional: the sheet still prints without it. */
export interface SheetBrand {
  tenantName?: string | null
  /** data: URL of the tenant logo, already loaded (the print window can't authenticate) */
  tenantLogo?: { dataUrl: string; w: number; h: number } | null
  /** tenant brand colour, #RRGGBB */
  color?: string | null
}

const GLIDO_ORANGE = '#FF6610'

const GLIDO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 31" width="104" height="20">
  <path fill="#1C232C" d="m25.5 13c-1.2 0-2.5 0.6-3.4 1.6l-3 3.2 0.1 0.2h24.8l-0.8 3.1c-0.6 2.3-1.9 3.5-4.3 3.5h-23.6c-5.3 0-8.7-3.1-8.3-8.3s3.1-9.8 8.3-9.8h15.5c0.8 0 1.4-0.5 1.8-1.1l2-3.5-0.1-0.6h-19.3c-8.2 0-12.8 6.1-13.3 14-0.5 7.1 2.8 14.2 12.7 14.3h24.4c5.4 0 8.6-2.2 9.9-7.3l2.4-9.2-25.8-0.1z"/>
  <path fill="#1C232C" d="m60.9 1.3-6.3 21.2c-0.9 4.1 1.1 6.8 5.5 6.9h5.8l1.3-5h-4.6c-1.6 0-2.5-0.9-2-2.6l5.7-20.5h-5.4z"/>
  <path fill="#1C232C" d="m75.6 9.3-5.4 20.1h5.8l5.6-20.5h-5.5l-0.5 0.4z"/>
  <path fill="#1C232C" d="m116.5 1.4-5.3 19.1c-0.8 2.6-2.3 3.8-4.9 3.8h-12.4c-2.5 0-4.2-1.4-3.8-4.4 0.5-3.6 3-6 6.2-6h12c1 0 1.4-0.4 1.9-1.1l1.8-3.5v-0.4h-16c-5.9 0-11.2 3.9-12 10.7-0.6 5.8 2.4 9.7 9.3 9.7h13c5.6 0 9.1-1.9 10.6-7.7l5.7-20.3h-6l-0.1 0.1z"/>
  <path fill="#1C232C" d="m150.5 16c-0.4 0-0.4 0.2-0.6 0.5l-0.8 3.5c-0.6 2.7-2.6 4.4-4.7 4.4h-11.9c-2.7 0-4.6-1.5-4-4.8 0.5-3.3 2.8-5.7 6.3-5.7h12.2c0.7 0 1.2-0.3 1.6-1l1.8-3.6-0.2-0.4h-15.2c-6.3 0-11 3.4-12.2 9.8-1.1 6.1 1.4 10.6 8.7 10.7h13c5.9 0 9.1-3.1 10.2-7.8l1.3-5.5-5.5-0.1z"/>
  <path fill="#FF6610" d="m43.1 1.4c-1.5 0-2.6 0.3-3.5 1.4-0.7 0.7-2.9 3.4-2.8 3.6l0.2 0.1h13.6c1 0 1.5-0.4 2-1.1 0.6-0.8 2.4-3.7 2.3-4h-11.8z"/>
  <path fill="#FF6610" d="m77.8 1.4-1.4 5.1h5.1c0.5 0 0.7-0.4 0.8-0.6l1.3-4.6h-5.8v0.1z"/>
  <path fill="#FF6610" d="m152.8 8.9c-0.2 0-0.2 0.1-0.3 0.2l-1.9 4.3 4 0.1c0.7 0 1-0.3 1.5-0.8 0.7-0.8 2.4-3.4 2.4-3.6l-0.1-0.2h-5.6z"/>
</svg>`

const hexOr = (v: string | null | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : fallback)
const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
/** Black or white, whichever reads better on the colour. */
const inkOn = (hex: string) => {
  const [r, g, b] = rgbOf(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1C1917' : '#FFFFFF'
}

const humanise = (v: unknown) => {
  const s = String(v ?? '').replace(/_/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}
const statusTone = (v: unknown) => {
  const s = String(v ?? '')
  if (s === 'passed' || s === 'completed') return 'good'
  if (s === 'failed') return 'bad'
  return 'warn'
}

/** The full print-ready HTML for a job sheet. Pure, so it can be tested without a browser. */
export function buildJobSheetHtml(sheet: JobSheet, brand: SheetBrand = {}, now: Date = new Date()): string {
  const c = sheet.container
  const unpacking = sheet.job_type === 'unpacking'
  const kind = unpacking ? 'Unpacking' : 'Packing'
  const title = `${kind} job — ${esc(c.container_number)}`
  const color = hexOr(brand.color, GLIDO_ORANGE)
  const [r, g, b] = rgbOf(color)
  const ink = inkOn(color)

  const flagged = [
    { label: 'Inspection', v: c.inspection_status },
    { label: 'Fumigation', v: c.fumigation_status },
  ].filter(f => f.v && f.v !== 'not_required')

  const rows = sheet.shipments.map((s, i) => `
    <tr>
      <td class="idx">${i + 1}</td><td class="hbl">${dash(s.house_bill_number)}</td><td>${dash(s.consignee)}</td><td>${dash(s.goods_description)}</td>
      <td class="n">${esc(fmtNum(s.package_count as number, 0))}</td><td class="n">${esc(fmtNum(s.weight_kg as number, 1))}</td><td class="n">${esc(fmtNum(s.volume_cbm as number))}</td>
      <td>${dash(s.handling_instructions)}</td>
    </tr>`).join('')

  const kv = (k: string, v: string) => `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`

  const tenantBlock = brand.tenantLogo
    ? `<img class="tenant-logo" src="${esc(brand.tenantLogo.dataUrl)}" alt="${esc(brand.tenantName ?? 'Company logo')}">`
    : (brand.tenantName ? `<div class="tenant-name">${esc(brand.tenantName)}</div>` : '')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  :root { --brand: ${color}; --brand-ink: ${ink}; --brand-soft: rgba(${r},${g},${b},0.10); --brand-line: rgba(${r},${g},${b},0.35); }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Red Hat Display', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: #1C1917; margin: 0; font-size: 12.5px; line-height: 1.4; background: #fff; }
  .page { padding: 0 0 20mm; }
  .accent { height: 6px; background: var(--brand); border-radius: 3px; }

  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 2px 14px; }
  .tenant-logo { display: block; max-height: 46px; max-width: 200px; object-fit: contain; }
  .tenant-name { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
  .doc { text-align: right; }
  .doc .kind { font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #78716C; }
  .doc .ref { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }

  .hero { background: var(--brand); color: var(--brand-ink); border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .hero .label { font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .8; }
  .hero .num { font-size: 30px; font-weight: 800; letter-spacing: .03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .hero .who { margin-top: 4px; font-size: 13px; opacity: .92; }
  .pill { display: inline-block; padding: 5px 14px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: var(--brand-ink); color: var(--brand); }

  .flags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .flag { display: inline-flex; gap: 6px; align-items: center; padding: 5px 12px; border-radius: 999px; font-weight: 700; font-size: 12px; border: 1.5px solid; }
  .flag.warn { background: #FFFBEB; border-color: #F59E0B; color: #92400E; }
  .flag.good { background: #F0FDF4; border-color: #22C55E; color: #166534; }
  .flag.bad  { background: #FEF2F2; border-color: #EF4444; color: #991B1B; }
  .flag::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

  h2 { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .14em; color: #44403C; margin: 20px 0 8px; }
  h2::before { content: ''; width: 4px; height: 14px; border-radius: 2px; background: var(--brand); }

  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .tile { background: var(--brand-soft); border: 1px solid var(--brand-line); border-radius: 10px; padding: 10px 12px; }
  .tile .k, .kv .k { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #78716C; }
  .tile .v { font-size: 16px; font-weight: 800; margin-top: 2px; }

  .card { border: 1px solid #E7E5E4; border-radius: 10px; padding: 12px 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 16px; }
  .kv .v { font-weight: 700; margin-top: 1px; font-size: 13px; }

  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { padding: 4px 12px; border-radius: 999px; background: var(--brand-soft); border: 1px solid var(--brand-line); font-weight: 600; font-size: 12px; }

  table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #E7E5E4; border-radius: 10px; overflow: hidden; }
  th { background: var(--brand); color: var(--brand-ink); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; text-align: left; padding: 8px 8px; }
  td { padding: 7px 8px; vertical-align: top; border-top: 1px solid #F0EEEC; font-size: 12px; }
  tbody tr:nth-child(even) td { background: #FAFAF9; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.idx { color: #A8A29E; width: 22px; } td.hbl { font-weight: 700; white-space: nowrap; }
  tr { break-inside: avoid; }

  .notes { border-left: 4px solid var(--brand); background: #FAFAF9; border-radius: 0 10px 10px 0; padding: 10px 14px; }
  .notes div + div { margin-top: 5px; } .notes .by { color: #78716C; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 30px; break-inside: avoid; }
  .line { border-top: 1.5px solid #1C1917; padding-top: 5px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #57534E; }

  /* fixed = repeated at the bottom of every printed page */
  .foot { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; }
  .foot-inner { border-top: 1px solid #E7E5E4; padding: 10px 0 0; display: flex; align-items: center; justify-content: space-between; }
  .foot .brand { display: flex; align-items: center; gap: 10px; color: #78716C; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; }
  .foot .stamp { font-size: 10.5px; color: #A8A29E; }
</style></head><body><div class="page">
<div class="accent"></div>
<div class="top">
  <div>${tenantBlock}</div>
  <div class="doc"><div class="kind">${kind} job sheet</div><div class="ref">${esc(sheet.request_ref)}</div></div>
</div>

<div class="hero">
  <div>
    <div class="label">Container</div>
    <div class="num">${dash(c.container_number)}</div>
    <div class="who">${esc(sheet.customer.name)}</div>
  </div>
  <div class="pill">${kind}</div>
</div>
${flagged.length ? `<div class="flags">${flagged.map(f => `<span class="flag ${statusTone(f.v)}">${f.label}: ${esc(humanise(f.v))}</span>`).join('')}</div>` : ''}

<h2>Schedule</h2>
<div class="tiles">
  <div class="tile"><div class="k">Date</div><div class="v">${esc(fmtDate(sheet.plan.date))}</div></div>
  <div class="tile"><div class="k">Time</div><div class="v">${esc(fmtTime(sheet.plan.start))} – ${esc(fmtTime(sheet.plan.end))}</div></div>
  <div class="tile"><div class="k">Location</div><div class="v">${dash(sheet.plan.location)}</div></div>
  <div class="tile"><div class="k">Team</div><div class="v">${dash(sheet.plan.team)}</div></div>
</div>

<h2>Container details</h2>
<div class="card">
  ${kv('Seal', dash(c.seal_number))}
  ${kv('Type', dash(c.container_type))}
  ${kv('Vessel / voyage', `${dash(c.vessel)}${c.voyage ? ' / ' + esc(c.voyage) : ''}`)}
  ${kv(unpacking ? 'ETA' : 'ETD', esc(fmtDate((unpacking ? c.eta : c.etd) as string)))}
  ${kv('Packages', esc(fmtNum(c.package_count as number, 0)))}
  ${kv('Weight (kg)', esc(fmtNum(c.net_weight_kg as number, 1)))}
  ${kv('Volume (cbm)', esc(fmtNum(c.volume_cbm as number)))}
</div>
${sheet.related_services.length ? `<h2>Related services</h2><div class="chips">${sheet.related_services.map(s => `<span class="chip">${esc(serviceLabel(s))}</span>`).join('')}</div>` : ''}

<h2>Shipments (${sheet.shipments.length})</h2>
<table><thead><tr><th></th><th>House bill</th><th>Consignee</th><th>Goods</th><th class="n">Pkgs</th><th class="n">kg</th><th class="n">cbm</th><th>Handling</th></tr></thead><tbody>${rows}</tbody></table>
${sheet.notes.length ? `<h2>Notes</h2><div class="notes">${sheet.notes.map(n => `<div>${esc(n.body)} <span class="by">— ${esc(n.author_name ?? '')}</span></div>`).join('')}</div>` : ''}

<div class="sign"><div class="line">Supervisor</div><div class="line">Date / time completed</div></div>

<div class="foot"><div class="foot-inner">
  <div class="brand"><span>Prepared with</span>${GLIDO_LOGO_SVG}</div>
  <div class="stamp">Printed ${esc(now.toLocaleString())}</div>
</div></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`
}

/**
 * Opens a print-ready information sheet for the floor team in a new window, branded with the
 * tenant (top) and Glido (bottom). The window opens straight away so the browser doesn't treat
 * it as a blocked pop-up; the logos load while it says "Preparing…" and the sheet replaces it.
 */
export function printJobSheet(sheet: JobSheet): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  w.document.open()
  w.document.write('<!doctype html><title>Preparing…</title><body style="font-family:system-ui,sans-serif;color:#78716C;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Preparing the information sheet…</body>')
  w.document.close()

  void (async () => {
    let brand: SheetBrand = {}
    try {
      const [{ getTenant }, { DEFAULT_TENANT_ID }, { loadLogoDataUrl }] = await Promise.all([
        import('@/lib/db/tenants'), import('@/lib/useTenantInfo'), import('@/lib/pdfBranding'),
      ])
      const t: any = await getTenant(DEFAULT_TENANT_ID)
      if (t) {
        brand = { tenantName: t.name ?? null, color: t.primary_color ?? null }
        if (t.logo_url) brand.tenantLogo = await loadLogoDataUrl(t.logo_url)
      }
    } catch { /* print unbranded rather than not at all */ }
    if (w.closed) return
    w.document.open(); w.document.write(buildJobSheetHtml(sheet, brand)); w.document.close()
  })()
  return true
}
