import type { TenantRow } from './db/tenants'

export interface ChargeInput {
  serviceType: 'pickup' | 'dropoff'
  loadType: 'fcl' | 'lcl'
  weightKg?: number
  volumeCbm?: number
  palletCount?: number
  palletType?: string
  storageStartDate?: string
  slotDate: string
  tenant: TenantRow
}

export interface ChargeResult {
  storageCharge: number
  storageDays: number
  shrinkWrapCharge: number
  slotFee: number
  subtotal: number
  gstAmount: number
  totalAmount: number
  currency: string
}

export function calculateCharges(input: ChargeInput): ChargeResult {
  const t = input.tenant
  const gstRate = t.gst_enabled ? Number(t.gst_rate) / 100 : 0
  const currency = t.currency ?? 'AUD'

  // Storage calculation
  let storageDays = 0
  let storageCharge = 0
  if (input.storageStartDate && input.loadType === 'lcl') {
    const start  = new Date(input.storageStartDate)
    const slot   = new Date(input.slotDate)
    const diffMs = slot.getTime() - start.getTime()
    const rawDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    storageDays = Math.max(0, rawDays - (t.storage_free_days ?? 0))

    if (storageDays > 0) {
      // Billable CBM = MAX(weight_cbm_equivalent, volume_cbm)
      const weightCbm = (input.weightKg ?? 0) / 1000
      const volCbm    = input.volumeCbm ?? 0
      const billableCbm = Math.max(weightCbm, volCbm)
      storageCharge = round2(billableCbm * Number(t.storage_rate_per_cbm) * storageDays)
    }
  }

  // Shrink wrap — LCL only, per pallet
  let shrinkWrapCharge = 0
  if (input.loadType === 'lcl' && (input.palletCount ?? 0) > 0) {
    shrinkWrapCharge = round2((input.palletCount ?? 0) * Number(t.shrink_wrap_rate_per_pallet))
  }

  // Slot fee
  const slotFee = round2(
    input.serviceType === 'pickup'
      ? Number(t.slot_fee_pickup)
      : Number(t.slot_fee_dropoff),
  )

  const subtotal    = round2(storageCharge + shrinkWrapCharge + slotFee)
  const gstAmount   = round2(subtotal * gstRate)
  const totalAmount = round2(subtotal + gstAmount)

  return { storageCharge, storageDays, shrinkWrapCharge, slotFee, subtotal, gstAmount, totalAmount, currency }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
}
