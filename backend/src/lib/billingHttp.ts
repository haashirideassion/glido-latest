/**
 * Shared HTTP plumbing for the billing routes.
 *
 * Two things live here because getting them wrong is expensive:
 *
 *  * Capability gating (S-11). The FRS requires actions the user cannot perform
 *    to be absent or disabled with a reason, *not* to fail on submit — so the
 *    server exposes the capability set (GET /api/billing/settings/capabilities)
 *    and also enforces it. The UI reads it; the server never trusts it.
 *
 *  * Refusals that explain and offer the legal alternative (cross-cutting rule
 *    6). A refusal returns `{ error: { message, hint, alternative } }` so the UI
 *    can render "deactivate instead" or "raise a credit note" as an action
 *    rather than as prose.
 */

import { Request, Response, NextFunction } from 'express'
import { pool } from '../db'
import {
  BillingCapability, CapabilitySet, DEFAULT_TENANT_ID, loadCapabilities,
} from './billingRepo'

export { DEFAULT_TENANT_ID }

/** Roles allowed anywhere in the billing module at all. */
export const BILLING_ROLES = ['billing', 'reception_admin', 'reception_staff', 'super_admin']

declare global {
  namespace Express {
    interface Request {
      billingCaps?: CapabilitySet
      tenantId?: string
    }
  }
}

export function tenantOf(req: Request): string {
  const q = (req.query.tenantId as string) || (req.body?.tenant_id as string)
  return q || DEFAULT_TENANT_ID
}

/** Requires a billing-capable role and attaches the user's capability set. */
export async function requireBilling(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
  }
  if (!BILLING_ROLES.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: { message: 'You do not have access to the Billing module.' },
    })
  }
  req.tenantId = tenantOf(req)
  try {
    req.billingCaps = await loadCapabilities(pool, req.tenantId, req.user.id, req.user.role)
  } catch (err) {
    console.error('[billing] capability load failed', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
  next()
}

const CAPABILITY_LABELS: Record<BillingCapability, string> = {
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

/** Gate one route on one capability. */
export function requireCapability(capability: BillingCapability) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.billingCaps?.[capability]) return next()
    return res.status(403).json({
      success: false,
      error: {
        message: `You do not have permission to ${CAPABILITY_LABELS[capability]}.`,
        capability,
      },
    })
  }
}

/** A refusal that names the legal alternative (SC-09, IN-06). */
export function refuse(
  res: Response,
  message: string,
  alternative?: 'deactivate' | 'credit_note' | 'prepaid_checkout' | 'override_request',
  status = 409,
) {
  return res.status(status).json({
    success: false,
    error: { message, alternative },
  })
}

export function badRequest(res: Response, message: string) {
  return res.status(400).json({ success: false, error: { message } })
}

export function notFound(res: Response, what = 'Record') {
  return res.status(404).json({ success: false, error: { message: `${what} not found` } })
}

/** Wrap a handler so a thrown error becomes one logged 500, not an unhandled rejection. */
export function handler(
  name: string,
  fn: (req: Request, res: Response) => Promise<unknown>,
) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res)
    } catch (err: any) {
      // Postgres surfaces the FRS's absolute rules as constraint violations with
      // a HINT naming the legal alternative. Pass that through rather than
      // flattening it into "Server error".
      if (err?.hint === 'credit_note' || err?.hint === 'deactivate') {
        return refuse(res, cleanPgMessage(err.message), err.hint)
      }
      if (err?.code === '23505' || err?.constraint?.includes('no_self_approval')) {
        return refuse(
          res,
          'The same person cannot request and approve this action. A second approver is required.',
          undefined, 403,
        )
      }
      if (err?.constraint === 'billing_charge_lines_reason_required') {
        return badRequest(res, 'A reason is required for this charge.')
      }
      if (err?.code === '23505' || err?.code === '23514') {
        return badRequest(res, cleanPgMessage(err.message))
      }
      if (err?.code === '42P01') {
        return res.status(503).json({
          success: false,
          error: { message: 'The Billing module tables are not installed. Run migration 036.' },
        })
      }
      console.error(`[${name}]`, err)
      if (res.headersSent) return
      return res.status(500).json({ success: false, error: { message: 'Server error' } })
    }
  }
}

function cleanPgMessage(message: string): string {
  return String(message ?? '').replace(/^.*violates check constraint\s+"?([^"]*)"?.*$/s, (_m, c) =>
    `That change is not allowed (${c}).`)
}

export const ok = (res: Response, data: unknown, extra: Record<string, unknown> = {}) =>
  res.json({ success: true, data, ...extra })

export const created = (res: Response, data: unknown) =>
  res.status(201).json({ success: true, data })
