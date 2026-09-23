import { useState, useEffect, createContext, useContext } from 'react'
import {
  ApprovalThreshold, BillingCapabilities, NO_CAPABILITIES, getCapabilities,
} from '@/lib/db/billing'

/**
 * S-11 — capability gating, read once per module mount.
 *
 * The FRS is specific that this must be *visible*: "Actions the user cannot
 * perform are absent or disabled with a reason, not failing on submit"
 * (cross-cutting rule 4). So components ask this hook before rendering an
 * action, and use `reasonFor()` to say why it is disabled. The server enforces
 * the same set independently — this is for the interface, not for security.
 */

export interface BillingCapabilityState {
  caps: BillingCapabilities
  thresholds: Record<string, ApprovalThreshold>
  loading: boolean
  /** True once the capability set has actually been fetched. */
  ready: boolean
}

export const BillingCapabilityContext = createContext<BillingCapabilityState>({
  caps: NO_CAPABILITIES,
  thresholds: {},
  loading: true,
  ready: false,
})

/** Fetches the capability set. Used once, by BillingLayout. */
export function useLoadBillingCapabilities(): BillingCapabilityState {
  const [state, setState] = useState<BillingCapabilityState>({
    caps: NO_CAPABILITIES, thresholds: {}, loading: true, ready: false,
  })

  useEffect(() => {
    let cancelled = false
    getCapabilities()
      .then(res => {
        if (cancelled) return
        setState({
          caps: res?.capabilities ?? NO_CAPABILITIES,
          thresholds: res?.thresholds ?? {},
          loading: false,
          ready: true,
        })
      })
      .catch(() => {
        // Failing closed is the only safe default: a user whose capabilities
        // could not be read is shown no privileged actions rather than all of
        // them. The server would refuse anyway, but rule 4 says the UI must not
        // offer what it cannot deliver.
        if (!cancelled) setState({
          caps: NO_CAPABILITIES, thresholds: {}, loading: false, ready: true,
        })
      })
    return () => { cancelled = true }
  }, [])

  return state
}

export function useBillingCapabilities(): BillingCapabilityState {
  return useContext(BillingCapabilityContext)
}

const CAPABILITY_LABELS: Record<keyof BillingCapabilities, string> = {
  can_manage_catalogue:      'manage the service catalogue',
  can_manage_tariffs:        'edit rate cards',
  can_publish_tariffs:       'publish a rate card',
  can_add_manual_charge:     'add a manual charge',
  can_adjust_charge:         'adjust a charge',
  can_waive_charge:          'waive a charge',
  can_issue_invoice:         'issue an invoice',
  can_run_billing:           'run a billing cycle',
  can_issue_credit_note:     'raise a credit note',
  can_confirm_eft_payment:   'confirm an EFT payment',
  can_refund:                'process a refund',
  can_write_off:             'write off a debt',
  can_override_credit_limit: 'override a credit limit',
  can_approve:               'approve financial actions',
  can_export:                'export data',
  can_manage_integration:    'manage the accounting integration',
}

/** The reason an action is disabled, or null when the user may perform it. */
export function reasonFor(
  caps: BillingCapabilities,
  capability: keyof BillingCapabilities,
): string | null {
  if (caps[capability]) return null
  return `You do not have permission to ${CAPABILITY_LABELS[capability]}. Ask an administrator to grant it in Settings → Approvals & roles.`
}

/**
 * Whether an amount needs a second approver, and the message to show when it
 * does (S-10). Returned rather than thrown so a form can warn *before* the user
 * fills it in, which is the difference between a helpful UI and a wasted keystroke.
 */
export function approvalFor(
  thresholds: Record<string, ApprovalThreshold>,
  action: string,
  amount: number,
  currency = 'AUD',
): { required: boolean; threshold: number; approverRole: string; message: string | null } {
  const t = thresholds[action]
  if (!t) return { required: false, threshold: 0, approverRole: '', message: null }
  const required = Math.abs(amount) >= t.threshold
  return {
    required,
    threshold: t.threshold,
    approverRole: t.approverRole,
    message: required
      ? `${formatPlain(amount, currency)} is at or above the ${formatPlain(t.threshold, currency)} approval threshold for this action, so a second approver is required.`
      : null,
  }
}

function formatPlain(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
}
