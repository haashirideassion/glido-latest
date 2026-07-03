import { useEffect, useState } from 'react'
import { loadLogoDataUrl, glidoLogoPng } from '@/lib/pdfBranding'
import { usePageTitle } from '@/lib/usePageTitle'
import QRCode from 'qrcode'
import { Link } from 'react-router-dom'
import { WizardProvider, useWizard, calcCharges } from '@/contexts/WizardContext'
import BookingWizard from '@/components/portal/ReceptionBookingWizard'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { Icon, ICONS } from '@/lib/Icon'
import { postFetcher } from '@/lib/fetcher'
import { toast } from '@/lib/toast'

// ── ICS generator ──────────────────────────────────────────────────────────────
function buildIcs(events: Array<{ ref: string; date: string; slotLabel: string; summary: string }>) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toIcsDate = (date: string, time: string) => {
    const [y, m, d] = date.split('-')
    const [h, min]  = time.replace(/\s/g, '').split(':')
    return `${y}${m}${d}T${pad(Number(h))}${pad(Number(min))}00`
  }
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Glido CFS//Booking//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    const parts = e.slotLabel.replace('–', '-').split('-').map(s => s.trim())
    const dtStart = toIcsDate(e.date, parts[0] || '00:00')
    const dtEnd   = toIcsDate(e.date, parts[1] || parts[0] || '00:00')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.ref}@glido.app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Australia/Sydney:${dtStart}`,
      `DTEND;TZID=Australia/Sydney:${dtEnd}`,
      `SUMMARY:${e.summary}`,
      `DESCRIPTION:Booking reference: ${e.ref}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

// EFT details fetched live — see useTenantInfo() inside ConfirmedScreen

function ConfirmedScreen() {
  const tenant = useTenantInfo()
  const { state, dispatch } = useWizard()
  // Normalise confirmationRefs to object shape (fall back to legacy string confirmationRef)
  const _rawConfRefs = state.confirmationRefs ?? []
  const rawRefs: Array<{ ref: string; slotLabel: string; date: string }> = _rawConfRefs.length
    ? _rawConfRefs
    : (state.confirmationRef
        ? [{ ref: state.confirmationRef, slotLabel: state.selectedSlotLabel, date: state.selectedDate }]
        : [])

  // Group by date + slotLabel — slots at the same time share one QR card
  type RefGroup = { key: string; slotLabel: string; date: string; refs: string[] }
  const groups: RefGroup[] = []
  const _groupMap = new Map<string, RefGroup>()
  for (const r of rawRefs) {
    const key = `${r.date}__${r.slotLabel}`
    if (!_groupMap.has(key)) {
      const g: RefGroup = { key, slotLabel: r.slotLabel, date: r.date, refs: [] }
      _groupMap.set(key, g); groups.push(g)
    }
    _groupMap.get(key)!.refs.push(r.ref)
  }

  const ref     = rawRefs[0]?.ref ?? ''
  // Flat array of reference-number strings — used by multi-slot QR card loop
  const refs    = rawRefs.map(r => r.ref)
  const slot    = state.slots.find(s => s.id === state.selectedSlotId)
  const charges = calcCharges(state)
  const isEft   = state.paymentMethod === 'eft'
  const multi   = rawRefs.length > 1
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
  const [resendLoading, setResendLoading] = useState(false)

  const handleResendEmail = async () => {
    setResendLoading(true)
    try {
      await postFetcher('/api/v2/bookings/resend-confirmation', { refs })
      toast('Confirmation email sent!', 'success')
    } catch {
      toast('Failed to resend email. Please try again.', 'error')
    } finally {
      setResendLoading(false)
    }
  }

  const handleAddToCalendar = () => {
    const events = rawRefs.map(r => ({
      ref:       r.ref,
      date:      r.date,
      slotLabel: r.slotLabel,
      summary:   `Glido CFS Visit · ${r.ref}`,
    }))
    const icsContent = buildIcs(events)
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `booking-${refs[0] ?? 'glido'}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  // One QR per unique time group, keyed by the group's first ref
  const _qrRefKeys = groups.map(g => g.refs[0]).join(',')
  useEffect(() => {
    groups.forEach(g => {
      const qrRef = g.refs[0]
      if (!qrRef) return
      QRCode.toDataURL(qrRef, { width: 220, margin: 1, color: { dark: '#1C1917', light: '#ffffff' } })
        .then(url => setQrUrls(prev => ({ ...prev, [qrRef]: url })))
        .catch(() => {})
    })
  }, [_qrRefKeys])  // eslint-disable-line react-hooks/exhaustive-deps

  const qrUrl = qrUrls[ref] ?? ''

  const copyRef = () => {
    navigator.clipboard.writeText(ref).catch(() => {})
  }

  // ── Export full booking summary as PDF ───────────────────────────────────────
  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw   = doc.internal.pageSize.getWidth()
    const ph   = doc.internal.pageSize.getHeight()
    let y = 18

    const tenantName = tenant?.name || 'Container Freight Station'

    // ── Header ────────────────────────────────────────────────────────────────
    const logoSrc = tenant?.logoUrl
    if (logoSrc) {
      const logo = await loadLogoDataUrl(logoSrc)
      if (logo) {
        const maxW = 40, maxH = 16
        const ratio = Math.min(maxW / logo.w, maxH / logo.h)
        const lw = logo.w * ratio, lh = logo.h * ratio
        const fmt = logo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
        doc.addImage(logo.dataUrl, fmt, (pw - lw) / 2, y, lw, lh)
        y += lh + 6
      } else {
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 113, 108)
        doc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
      }
    } else {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 113, 108)
      doc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
    }

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(28, 25, 23)
    doc.text('Booking Confirmation', pw / 2, y, { align: 'center' })
    y += 9

    doc.setFontSize(13)
    doc.setFont('courier', 'bold')
    doc.setTextColor(100, 92, 80)
    doc.text(ref, pw / 2, y, { align: 'center' })
    y += 10

    // ── QR code ───────────────────────────────────────────────────────────────
    if (qrUrl) {
      const sz = 56
      doc.addImage(qrUrl, 'PNG', (pw - sz) / 2, y, sz, sz)
      y += sz + 6
    }

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text('Present this QR code at the gate for check-in', pw / 2, y, { align: 'center' })
    y += 10

    // ── Divider ───────────────────────────────────────────────────────────────
    doc.setDrawColor(220, 215, 210)
    doc.line(20, y, pw - 20, y)
    y += 8

    // ── Booking details ───────────────────────────────────────────────────────
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(28, 25, 23)
    doc.text('Booking Details', 20, y)
    y += 6

    const details: [string, string][] = [
      ['Driver',    state.driverName || state.guestName || '—'],
      ['Service',   state.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'],
      ['Load Type', (state.loadType ?? '—').toUpperCase()],
      ['Date',      state.selectedDate || '—'],
      ['Time',      slot ? `${slot.startTime} – ${slot.endTime}` : state.selectedSlotLabel || '—'],
      ...(state.hbl             ? [['HBL',       state.hbl]             as [string, string]] : []),
      ...(state.containerNumber ? [['Container', state.containerNumber] as [string, string]] : []),
    ]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    for (const [label, val] of details) {
      doc.setTextColor(120, 113, 108); doc.text(label, 20, y)
      doc.setTextColor(28, 25, 23);   doc.text(val,   pw / 2, y)
      y += 5.5
    }

    // ── Charges ───────────────────────────────────────────────────────────────
    if (charges.total > 0) {
      y += 4
      doc.setDrawColor(220, 215, 210)
      doc.line(20, y, pw - 20, y)
      y += 7

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(28, 25, 23)
      doc.text('Charges', 20, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)

      const chargeRows: [string, string][] = [
        ...(charges.storageCharge > 0   ? [['Storage',     `$${charges.storageCharge.toFixed(2)}`]   as [string,string]] : []),
        ...(charges.shrinkWrapCharge > 0 ? [['Shrink wrap', `$${charges.shrinkWrapCharge.toFixed(2)}`] as [string,string]] : []),
        ...(charges.slotFee > 0         ? [['Slot fee',    `$${charges.slotFee.toFixed(2)}`]         as [string,string]] : []),
        ['GST (10%)', `$${charges.gst.toFixed(2)}`],
        ['Total',     `$${charges.total.toFixed(2)} AUD`],
        ['Payment',   state.paymentMethod?.toUpperCase() || '—'],
      ]

      for (const [label, val] of chargeRows) {
        doc.setTextColor(120, 113, 108); doc.text(label, 20, y)
        doc.setTextColor(28, 25, 23);   doc.text(val, pw - 20, y, { align: 'right' })
        y += 5.5
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const glidoPng = await glidoLogoPng()
    if (glidoPng) {
      const gw = 22, gh = gw * (62 / 320)
      doc.addImage(glidoPng, 'PNG', (pw - gw) / 2, ph - 26, gw, gh)
    }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(156, 163, 175)
    doc.text('Present this QR code at the gate for check-in', pw / 2, ph - 14, { align: 'center' })
    doc.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, pw / 2, ph - 9, { align: 'center' })

    doc.save(`booking-${ref}.pdf`)
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: 'var(--surface-tint)', padding: '40px 24px 64px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* Success banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--r-md)', padding: '16px 20px', marginBottom: 32, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r-full)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#4ADE80 0%,#16A34A 100%)', boxShadow: '0 4px 12px rgba(34,197,94,0.35)' }}>
            <Icon name={ICONS.check} size={20} style={{ color: 'var(--brand-text)' }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#22C55E' }}>
              {multi ? `${rawRefs.length} Bookings Created` : 'Booking Created'}
            </p>
            <p
              style={{ fontSize: 14, fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={copyRef}
              title="Click to copy"
            >{multi ? rawRefs.map(r => r.ref).join(' · ') : ref}</p>
          </div>
        </div>

        {/* Multi-slot: QR cards row above details */}
        {multi && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            {refs.map((r, i) => {
              const url = qrUrls[r] ?? ''
              const cfg = state.slotConfigs[i]

              const exportSlotPdf = async () => {
                const { jsPDF } = await import('jspdf')
                const pdoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
                const pw = pdoc.internal.pageSize.getWidth()
                const ph = pdoc.internal.pageSize.getHeight()
                let y = 18
                const tenantName = tenant?.name || 'Container Freight Station'

                const logoSrc = tenant?.logoUrl
                if (logoSrc) {
                  const logo = await loadLogoDataUrl(logoSrc)
                  if (logo) {
                    const maxW = 40, maxH = 16
                    const ratio = Math.min(maxW / logo.w, maxH / logo.h)
                    const lw = logo.w * ratio, lh = logo.h * ratio
                    const fmt = logo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
                    pdoc.addImage(logo.dataUrl, fmt, (pw - lw) / 2, y, lw, lh)
                    y += lh + 6
                  } else {
                    pdoc.setFontSize(9); pdoc.setFont('helvetica', 'normal'); pdoc.setTextColor(120, 113, 108)
                    pdoc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
                  }
                } else {
                  pdoc.setFontSize(9); pdoc.setFont('helvetica', 'normal'); pdoc.setTextColor(120, 113, 108)
                  pdoc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
                }

                pdoc.setFontSize(14); pdoc.setFont('helvetica', 'bold'); pdoc.setTextColor(28, 25, 23)
                pdoc.text(`Booking Confirmation — Slot ${i + 1} of ${refs.length}`, pw / 2, y, { align: 'center' }); y += 9

                pdoc.setFontSize(13); pdoc.setFont('courier', 'bold'); pdoc.setTextColor(100, 92, 80)
                pdoc.text(r, pw / 2, y, { align: 'center' }); y += 10

                if (url) { const sz = 56; pdoc.addImage(url, 'PNG', (pw - sz) / 2, y, sz, sz); y += sz + 6 }

                pdoc.setFontSize(9); pdoc.setFont('helvetica', 'normal'); pdoc.setTextColor(100, 116, 139)
                pdoc.text('Present this QR code at the gate for check-in', pw / 2, y, { align: 'center' }); y += 10

                pdoc.setDrawColor(220, 215, 210); pdoc.line(20, y, pw - 20, y); y += 8

                pdoc.setFontSize(10); pdoc.setFont('helvetica', 'bold'); pdoc.setTextColor(28, 25, 23)
                pdoc.text('Booking Details', 20, y); y += 6

                const details: [string, string][] = [
                  ['Driver',    state.driverName || state.guestName || '—'],
                  ['Service',   cfg?.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'],
                  ['Load Type', (cfg?.loadType ?? '—').toUpperCase()],
                  ['Date',      state.selectedDate || '—'],
                  ['Time',      slot ? `${slot.startTime} – ${slot.endTime}` : state.selectedSlotLabel || '—'],
                  ...(state.hbl             ? [['HBL',       state.hbl]             as [string,string]] : []),
                  ...(state.containerNumber ? [['Container', state.containerNumber] as [string,string]] : []),
                ]
                pdoc.setFont('helvetica', 'normal'); pdoc.setFontSize(9.5)
                for (const [label, val] of details) {
                  pdoc.setTextColor(120, 113, 108); pdoc.text(label, 20, y)
                  pdoc.setTextColor(28, 25, 23);   pdoc.text(val, pw / 2, y)
                  y += 5.5
                }

                if (charges.total > 0) {
                  y += 4; pdoc.setDrawColor(220, 215, 210); pdoc.line(20, y, pw - 20, y); y += 7
                  pdoc.setFontSize(10); pdoc.setFont('helvetica', 'bold'); pdoc.setTextColor(28, 25, 23)
                  pdoc.text('Charges', 20, y); y += 6
                  pdoc.setFont('helvetica', 'normal'); pdoc.setFontSize(9.5)
                  const n = refs.length
                  const chargeRows: [string, string][] = [
                    ...(charges.storageCharge   > 0 ? [['Storage',    `$${charges.storageCharge.toFixed(2)}`]   as [string,string]] : []),
                    ...(charges.shrinkWrapCharge > 0 ? [['Shrink wrap',`$${charges.shrinkWrapCharge.toFixed(2)}`] as [string,string]] : []),
                    ...(charges.slotFee          > 0 ? [['Slot fee',   `$${(charges.slotFee / n).toFixed(2)}`]  as [string,string]] : []),
                    ['GST (10%)', `$${(charges.gst   / n).toFixed(2)}`],
                    ['Total',     `$${(charges.total / n).toFixed(2)} AUD`],
                    ['Payment',   state.paymentMethod?.toUpperCase() || '—'],
                  ]
                  for (const [label, val] of chargeRows) {
                    pdoc.setTextColor(120, 113, 108); pdoc.text(label, 20, y)
                    pdoc.setTextColor(28, 25, 23);   pdoc.text(val, pw - 20, y, { align: 'right' })
                    y += 5.5
                  }
                }

                const glidoPng = await glidoLogoPng()
                if (glidoPng) {
                  const gw = 22, gh = gw * (62 / 320)
                  pdoc.addImage(glidoPng, 'PNG', (pw - gw) / 2, ph - 26, gw, gh)
                }
                pdoc.setFontSize(8); pdoc.setFont('helvetica', 'italic'); pdoc.setTextColor(156, 163, 175)
                pdoc.text('Present this QR code at the gate for check-in', pw / 2, ph - 14, { align: 'center' })
                pdoc.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, pw / 2, ph - 9, { align: 'center' })
                pdoc.save(`booking-${r}.pdf`)
              }

              return (
                <div key={r} style={{ flex: '1 1 200px', minWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', background: '#fff', borderRadius: 'var(--r-lg)', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Slot {i + 1}</p>
                  {url ? (
                    <img src={url} alt={`QR for ${r}`} width={160} height={160} style={{ borderRadius: 'var(--r-sm)' }} />
                  ) : r ? (
                    /* ref exists, QR still generating */
                    <div style={{ width: 160, height: 160, borderRadius: 'var(--r-sm)', background: '#F7F6F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={ICONS.qrCode} size={48} style={{ color: 'rgba(0,0,0,0.15)' }} />
                    </div>
                  ) : (
                    /* ref missing — reference_number not returned for this slot */
                    <div style={{ width: 160, height: 160, borderRadius: 'var(--r-sm)', background: '#FEF2F2', border: '1.5px dashed #FCA5A5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }}>
                      <Icon name={ICONS.qrCode} size={32} style={{ color: '#FCA5A5' }} />
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#EF4444', textAlign: 'center', lineHeight: 1.4 }}>
                        QR unavailable — reference number missing
                      </p>
                    </div>
                  )}
                  <p style={{ fontSize: 13, fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: '#1C1917', marginTop: 10 }}>{r}</p>
                  <p style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
                    {cfg?.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(cfg?.loadType ?? '').toUpperCase()}
                  </p>

                  {/* Per-slot download actions */}
                  <div style={{ display: 'flex', width: '100%', marginTop: 14 }}>
                    <button
                      onClick={exportSlotPdf}
                      style={{ flex: 1, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0 10px', fontSize: 13, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(var(--brand-rgb),0.30)', whiteSpace: 'nowrap', transition: 'all 0.13s' }}
                      onMouseOver={e => { e.currentTarget.style.opacity = '0.88' }}
                      onMouseOut={e  => { e.currentTarget.style.opacity = '1' }}
                    >
                      <Icon name={ICONS.document} size={12} />
                      Export PDF
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 2-column layout — QR (single slot) or placeholder + details */}
        <div style={{ display: 'grid', gridTemplateColumns: multi ? '1fr' : '1fr 1fr', gap: 24 }}>

          {/* QR Code — single slot only */}
          {!multi && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', background: '#fff', borderRadius: 'var(--r-lg)', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
            {qrUrl ? (
              <img src={qrUrl} alt={`QR code for ${ref}`} width={220} height={220} style={{ borderRadius: 'var(--r-sm)' }} />
            ) : ref ? (
              /* ref exists but QR hasn't rendered yet — loading state */
              <div style={{ width: 220, height: 220, borderRadius: 'var(--r-sm)', background: '#F7F6F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICONS.qrCode} size={64} style={{ color: 'rgba(0,0,0,0.15)' }} />
              </div>
            ) : (
              /* ref is empty — booking may not have returned a reference_number */
              <div style={{ width: 220, height: 220, borderRadius: 'var(--r-sm)', background: '#FEF2F2', border: '1.5px dashed #FCA5A5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
                <Icon name={ICONS.qrCode} size={40} style={{ color: '#FCA5A5' }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: '#EF4444', textAlign: 'center', lineHeight: 1.4 }}>
                  QR unavailable — reference number missing
                </p>
              </div>
            )}
            <p style={{ fontSize: 14, fontWeight: 500, color: '#64748B', marginTop: 14 }}>Give this QR code to the driver for kiosk check-in</p>
            <p style={{ fontSize: 14, fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: '#1C1917', marginTop: 4 }}>{ref}</p>

            {/* Download actions */}
            <div style={{ display: 'flex', width: '100%', marginTop: 18 }}>
              <button
                onClick={exportPdf}
                style={{ flex: 1, height: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(var(--brand-rgb),0.30)', whiteSpace: 'nowrap', transition: 'all 0.13s' }}
                onMouseOver={e => { e.currentTarget.style.opacity = '0.88' }}
                onMouseOut={e  => { e.currentTarget.style.opacity = '1' }}
              >
                <Icon name={ICONS.document} size={13} />
                Export PDF
              </button>
            </div>
          </div>
          )}

          {/* Right column: details + charges + EFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Booking details */}
            <div style={{ borderRadius: 'var(--r-md)', padding: 16, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 12 }}>Booking Details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 14 }}>
                {[
                  { label: 'Driver',   value: state.driverName || state.guestName },
                  { label: 'Service',  value: state.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off' },
                  { label: 'Load type', value: (state.loadType ?? '').toUpperCase() },
                  { label: 'Date',     value: state.selectedDate },
                  { label: 'Time',     value: slot ? `${slot.startTime} – ${slot.endTime}` : state.selectedSlotLabel },
                  ...(state.hbl            ? [{ label: 'HBL',       value: state.hbl }]            : []),
                  ...(state.containerNumber ? [{ label: 'Container', value: state.containerNumber }] : []),
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: '#1C1917' }}>{row.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Charges */}
            {charges.total > 0 && (
              <div style={{ borderRadius: 'var(--r-md)', padding: 16, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 12 }}>Charges</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  {charges.storageCharge > 0    && <ChargeRow label="Storage"      val={charges.storageCharge} />}
                  {charges.shrinkWrapCharge > 0  && <ChargeRow label="Shrink wrap"  val={charges.shrinkWrapCharge} />}
                  {charges.slotFee > 0           && <ChargeRow label="Slot fee"     val={charges.slotFee} />}
                  {charges.gst > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                      <span>GST (10%)</span><span>${charges.gst.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1C1917', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.09)' }}>
                    <span>Total</span>
                    <span style={{ color: 'var(--brand-color)' }}>${charges.total.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                    <span>{state.paymentMethod?.toUpperCase()}</span>
                    <span style={{ color: isEft ? '#FBBF24' : '#22C55E', fontWeight: 500 }}>{isEft ? 'EFT Pending' : 'Pending'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* EFT details */}
            {isEft && (
              <div style={{ borderRadius: 'var(--r-md)', padding: 16, background: 'rgba(var(--brand-rgb),0.06)', border: '1px solid rgba(var(--brand-rgb),0.20)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-color)', marginBottom: 10 }}>Transfer details</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'rgba(var(--brand-rgb),0.65)' }}>
                  {Object.entries({ Bank: tenant?.eftBankName || '—', BSB: tenant?.eftBsb || '—', 'Account No.': tenant?.eftAccountNumber || '—', 'Account Name': tenant?.eftAccountName || '—', Reference: ref }).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{k}</span>
                      <span style={{ fontFamily: k !== 'Bank' && k !== 'Account Name' ? 'ui-monospace,monospace' : undefined, fontWeight: k === 'Reference' ? 700 : 500, color: 'var(--brand-color)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32, justifyContent: 'center' }}>
          <button
            onClick={() => { dispatch({ type: 'RESET' }); window.location.href = '/reception/bookings/new' }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)' }}
          >
            <Icon name={ICONS.add} size={14} />
            Create Another Booking
          </button>
          <Link to="/reception/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', textDecoration: 'none', transition: 'all 0.15s' }}>
            <Icon name={ICONS.search} size={14} />
            Back to Bookings
          </Link>
          <button
            onClick={handleResendEmail}
            disabled={resendLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: resendLoading ? 'not-allowed' : 'pointer', opacity: resendLoading ? 0.6 : 1, transition: 'all 0.15s' }}
          >
            <Icon name={ICONS.email} size={14} />
            {resendLoading ? 'Sending…' : 'Resend Email'}
          </button>
          <button
            onClick={handleAddToCalendar}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            <Icon name={ICONS.calendar} size={14} />
            Add to Calendar
          </button>
        </div>

      </div>
    </div>
  )
}

function ChargeRow({ label, val }: { label: string; val: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
      <span>{label}</span><span>${val.toFixed(2)}</span>
    </div>
  )
}

function WizardOrConfirmed() {
  const { state } = useWizard()
  if (state.step === 8) return <ConfirmedScreen />
  return <BookingWizard />
}

export default function NewBookingPage() {
  usePageTitle('Glido | New Booking')
  return (
    <WizardProvider>
      <WizardOrConfirmed />
    </WizardProvider>
  )
}
