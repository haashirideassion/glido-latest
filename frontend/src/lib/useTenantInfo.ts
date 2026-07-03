import { useState, useEffect } from 'react'
import { getTenant } from '@/lib/db/tenants'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export interface TenantInfo {
  name:               string
  eftBankName:        string
  eftAccountName:     string
  eftBsb:             string
  eftAccountNumber:   string
  logoUrl:            string | null
  primaryColor:       string | null
  compayClientNumber: string | null
  slotHoldDurationMin: number
  kioskTerms:         string   // site entry agreement shown before arrived screen
}

const FALLBACK: TenantInfo = {
  name:               '',
  eftBankName:        '',
  eftAccountName:     '',
  eftBsb:             '',
  eftAccountNumber:   '',
  logoUrl:            null,
  primaryColor:       null,
  compayClientNumber: null,
  slotHoldDurationMin: 10,
  kioskTerms:         '',
}

/**
 * Fetches and caches basic tenant display info.
 * Returns null while loading so callers can hide/skeleton appropriately.
 */
export function useTenantInfo(): TenantInfo | null {
  const [info, setInfo] = useState<TenantInfo | null>(null)

  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(t => {
        if (!t) return
        setInfo({
          name:             t.name               ?? '',
          eftBankName:      t.eft_bank_name      ?? '',
          eftAccountName:   t.eft_account_name   ?? '',
          eftBsb:           t.eft_bsb            ?? '',
          eftAccountNumber: t.eft_account_number ?? '',
          logoUrl:            t.logo_url                        ?? null,
          primaryColor:       t.primary_color                   ?? null,
          compayClientNumber: (t as any).compay_client_number   ?? null,
          slotHoldDurationMin: (t as any).slot_hold_duration_min ?? 10,
          kioskTerms:         (t.working_hours as any)?.kiosk_terms ?? '',
        })
      })
      .catch(() => setInfo(FALLBACK))
  }, [])

  return info
}
