import { useState, useEffect } from 'react'
import { getTenant } from '@/lib/db/tenants'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

/**
 * The CFS-Admin-facing Settings sections a Super Admin can allow/disallow.
 * Keys match the section hashes used by SettingsPage (#general, #working-hours, …).
 * When a section is disallowed it is hidden entirely from the CFS Admin (reception_admin)
 * UI — the Super Admin still controls it from /superadmin.
 */
export const CFS_ADMIN_SECTIONS = [
  { key: 'general',          label: 'General',       hint: 'Business profile, branding logo, kiosk agreement and devices' },
  { key: 'working-hours',    label: 'Working Hours', hint: 'Operating hours the facility accepts bookings' },
  { key: 'slot-config',      label: 'Slot Config',   hint: 'Slot duration, capacity and booking windows' },
  { key: 'pricing',          label: 'Pricing',       hint: 'Slot fees, storage rates and client exception pricing' },
  { key: 'payment',          label: 'Payment',       hint: 'EFT, Stripe and ComPay settings' },
  { key: 'doc-requirements', label: 'Documents',     hint: 'Required documents per service and cargo type' },
  { key: 'user-management',  label: 'Team',          hint: 'Team members, roles and staff permissions' },
] as const

export type CfsAdminSectionKey = typeof CFS_ADMIN_SECTIONS[number]['key']

export type CfsAdminAccess = Record<string, boolean>

/** Normalize a raw config blob → every known key present, missing keys default to allowed (true). */
export function normalizeAccess(raw: any): CfsAdminAccess {
  const out: CfsAdminAccess = {}
  for (const { key } of CFS_ADMIN_SECTIONS) {
    out[key] = raw?.[key] !== false // undefined/true → allowed; only an explicit false disallows
  }
  return out
}

/**
 * Reads the Super Admin's per-section access grants for CFS Admins.
 * `loading` is true until the tenant config resolves; treat everything as allowed while loading
 * to avoid a flash of hidden nav on first paint.
 */
export function useCfsAdminSections(): { access: CfsAdminAccess; loading: boolean } {
  const [access, setAccess] = useState<CfsAdminAccess>(() => normalizeAccess(undefined))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getTenant(DEFAULT_TENANT_ID)
      .then(t => {
        if (cancelled) return
        setAccess(normalizeAccess((t?.working_hours as any)?.cfs_admin_sections))
      })
      .catch(() => { /* keep all-allowed default */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { access, loading }
}
