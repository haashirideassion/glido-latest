import QRCode from 'qrcode'
import { loadLogoDataUrl, glidoLogoPng } from '@/lib/pdfBranding'
import type { Booking } from '@/data/types'

interface TenantLike {
  name?: string | null
  logoUrl?: string | null
}

/**
 * Generates and downloads the same "Booking Confirmation" PDF shown on the /book success screen,
 * driven by a persisted Booking row (one booking = one slot) instead of wizard state — so it can
 * be triggered from the reception bookings list. Layout mirrors BookPage.exportPdf.
 */
export async function generateBookingPdf(b: Booking, tenant?: TenantLike, mode: 'print' | 'download' = 'print'): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const tenantName = tenant?.name || 'Container Freight Station'

  const ref = b.referenceNumber

  // QR encodes the booking reference (scanned at the gate for check-in)
  let qrUrl = ''
  try {
    qrUrl = await QRCode.toDataURL(ref, { width: 220, margin: 1, color: { dark: '#1C1917', light: '#ffffff' } })
  } catch { /* QR optional */ }

  const pdfRow = (label: string, val: string, y: number) => {
    doc.setTextColor(120, 113, 108); doc.text(label, 20, y)
    doc.setTextColor(28, 25, 23);   doc.text(val, pw - 20, y, { align: 'right' })
  }
  const section = (title: string, curY: number): number => {
    curY += 4
    doc.setDrawColor(220, 215, 210); doc.line(20, curY, pw - 20, curY); curY += 7
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
    doc.text(title, 20, curY); curY += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
    return curY
  }

  let y = 18

  // ── Header ──
  let placedLogo = false
  if (tenant?.logoUrl) {
    const logo = await loadLogoDataUrl(tenant.logoUrl)
    if (logo) {
      const maxW = 40, maxH = 16
      const ratio = Math.min(maxW / logo.w, maxH / logo.h)
      const lw = logo.w * ratio, lh = logo.h * ratio
      const fmt = logo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
      doc.addImage(logo.dataUrl, fmt, (pw - lw) / 2, y, lw, lh)
      y += lh + 6
      placedLogo = true
    }
  }
  if (!placedLogo) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 113, 108)
    doc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
  }

  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
  doc.text('Booking Confirmation', pw / 2, y, { align: 'center' }); y += 9

  doc.setFontSize(13); doc.setFont('courier', 'bold'); doc.setTextColor(100, 92, 80)
  doc.text(ref, pw / 2, y, { align: 'center' }); y += 10

  // ── QR ──
  if (qrUrl) {
    const sz = 56
    doc.addImage(qrUrl, 'PNG', (pw - sz) / 2, y, sz, sz); y += sz + 6
  }
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
  doc.text('Present this QR code at the gate for check-in', pw / 2, y, { align: 'center' }); y += 10

  // ── Contact & Driver ──
  y = section('Contact & Driver', y)
  const contactRows: [string, string][] = [
    ...(b.guestName && b.guestName !== b.guestEmail ? [['Guest Name',   b.guestName]           as [string, string]] : []),
    ...(b.guestEmail          ? [['Guest Email',  b.guestEmail]          as [string, string]] : []),
    ...(b.guestPhone          ? [['Guest Phone',  b.guestPhone]          as [string, string]] : []),
    ...(b.companyName         ? [['Company',      b.companyName]         as [string, string]] : []),
    ...(b.driverName          ? [['Driver Name',  b.driverName]          as [string, string]] : []),
    ...(b.driverPhone         ? [['Driver Phone', b.driverPhone]         as [string, string]] : []),
    ...(b.vehicleRegistration ? [['Vehicle Rego', b.vehicleRegistration] as [string, string]] : []),
  ]
  for (const [label, val] of contactRows) { pdfRow(label, val, y); y += 5.5 }

  // ── Slot / shipment details ──
  y = section('Slot Details', y)
  const slotRows: [string, string][] = [
    ['Service Type', b.serviceType === 'pickup' ? 'Pick Up' : b.serviceType === 'dropoff' ? 'Drop Off' : '—'],
    ['Load Type',    (b.loadType ?? '—').toUpperCase()],
    ['Date',         b.slotDate || '—'],
    ['Time Slot',    b.slotStartTime && b.slotEndTime ? `${b.slotStartTime} – ${b.slotEndTime}` : '—'],
    ...(b.houseBillNumber   ? [['HBL Number',            b.houseBillNumber]   as [string, string]] : []),
    ...(b.containerNumber   ? [['Container Number',      b.containerNumber]   as [string, string]] : []),
    ...(b.containerSize     ? [['Container Size',        b.containerSize]     as [string, string]] : []),
    ...(b.entryNumber       ? [['Entry Number',          b.entryNumber]       as [string, string]] : []),
    ...(b.purpose           ? [['Purpose',               b.purpose]           as [string, string]] : []),
    ...(b.bookingReference  ? [['Booking Confirmation #', b.bookingReference] as [string, string]] : []),
    ...(b.consolidator      ? [['Consolidator',          b.consolidator]      as [string, string]] : []),
    ...(b.weightKg          ? [['Weight',                `${b.weightKg.toLocaleString()} kg`] as [string, string]] : []),
    ...(b.volumeCbm         ? [['Volume',                `${b.volumeCbm} CBM`] as [string, string]] : []),
    ...(b.packageCount      ? [['Packages',              `${b.packageCount}`] as [string, string]] : []),
    ...((b.palletCount ?? 0) > 0 ? [['Pallets',          `${b.palletCount} × ${b.palletType ?? ''}`.trim()] as [string, string]] : []),
  ]
  for (const [label, val] of slotRows) { pdfRow(label, val, y); y += 5.5 }

  // ── Payment ──
  if ((b.totalAmount ?? 0) > 0) {
    y = section('Payment', y)
    const chargeRows: [string, string][] = [
      ...((b.storageCharge ?? 0) > 0    ? [['Storage',     `$${b.storageCharge!.toFixed(2)}`]    as [string, string]] : []),
      ...((b.shrinkWrapCharge ?? 0) > 0 ? [['Shrink wrap', `$${b.shrinkWrapCharge!.toFixed(2)}`] as [string, string]] : []),
      ...(b.slotFee !== undefined       ? [['Slot fee',    `$${b.slotFee.toFixed(2)}`]           as [string, string]] : []),
      ...(b.gstAmount !== undefined     ? [['GST (10%)',   `$${b.gstAmount.toFixed(2)}`]         as [string, string]] : []),
      ['Total Amount', `$${(b.totalAmount ?? 0).toFixed(2)} AUD`],
      ['Payment',      (b.paymentMethod ?? '—').toUpperCase()],
      ...(b.paymentStatus ? [['Payment Status', b.paymentStatus === 'paid' ? 'Paid' : b.paymentStatus === 'pending_eft' ? 'EFT Pending' : b.paymentStatus] as [string, string]] : []),
    ]
    for (const [label, val] of chargeRows) { pdfRow(label, val, y); y += 5.5 }
  }

  // ── Footer ──
  const glidoPng = await glidoLogoPng()
  if (glidoPng) {
    const gw = 22, gh = gw * (62 / 320)
    doc.addImage(glidoPng, 'PNG', (pw - gw) / 2, ph - 22, gw, gh)
  }
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(156, 163, 175)
  doc.text(`${tenantName} · Generated ${new Date().toLocaleDateString('en-AU')}`, pw / 2, ph - 9, { align: 'center' })

  if (mode === 'print') {
    // Open the PDF in a new tab and auto-invoke the browser print dialog.
    doc.autoPrint()
    const blobUrl = doc.output('bloburl') as unknown as string
    const win = window.open(blobUrl, '_blank')
    // Popup blocked → fall back to a download so the action never silently no-ops.
    if (!win) doc.save(`booking-${ref}.pdf`)
  } else {
    doc.save(`booking-${ref}.pdf`)
  }
}
