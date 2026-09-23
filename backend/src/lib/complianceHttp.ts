/**
 * Shared HTTP plumbing for the compliance routes — mirrors billingHttp.ts.
 *
 * Capability gating (FRD 2.4.4: "New Activity" needs create rights, "Export Report" needs
 * export rights, "Add Schedule Inspection" needs scheduling rights) must be visible — the UI
 * hides or disables an action rather than letting it fail on submit — so the server exposes
 * the capability set and also enforces it. The UI reads it; the server never trusts it.
 */

import { Request, Response, NextFunction } from 'express'
import { pool } from '../db'

export const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

/** Roles allowed anywhere in the Compliance module at all. */
export const COMPLIANCE_ROLES = ['compliance_officer', 'compliance_admin', 'super_admin', 'reception_admin']

export type ComplianceCapability =
  | 'can_create_activity' | 'can_edit_activity' | 'can_cancel_activity'
  | 'can_export_report'
  | 'can_schedule_inspection' | 'can_edit_inspection' | 'can_start_inspection'

export type CapabilitySet = Record<ComplianceCapability, boolean>

const NONE: CapabilitySet = {
  can_create_activity: false, can_edit_activity: false, can_cancel_activity: false,
  can_export_report: false,
  can_schedule_inspection: false, can_edit_inspection: false, can_start_inspection: false,
}
const ALL: CapabilitySet = Object.fromEntries(Object.keys(NONE).map(k => [k, true])) as CapabilitySet

declare global {
  namespace Express {
    interface Request {
      complianceCaps?: CapabilitySet
    }
  }
}

export async function loadCapabilities(userId: string, role: string): Promise<CapabilitySet> {
  if (role === 'super_admin' || role === 'reception_admin') return { ...ALL }
  const result = await pool.query(
    `SELECT can_create_activity, can_edit_activity, can_cancel_activity, can_export_report,
            can_schedule_inspection, can_edit_inspection, can_start_inspection
     FROM compliance_capabilities WHERE tenant_id = $1 AND user_id = $2`,
    [DEFAULT_TENANT_ID, userId]
  )
  if (!result.rows[0]) return { ...NONE }
  return result.rows[0]
}

/** Requires a compliance-capable role and attaches the user's capability set. */
export async function requireCompliance(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
  }
  if (!COMPLIANCE_ROLES.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: { message: 'You do not have access to the Compliance module.' },
    })
  }
  try {
    req.complianceCaps = await loadCapabilities(req.user.id, req.user.role)
  } catch (err) {
    console.error('[compliance] capability load failed', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
  next()
}

const CAPABILITY_LABELS: Record<ComplianceCapability, string> = {
  can_create_activity:     'create a compliance activity',
  can_edit_activity:       'edit a compliance activity',
  can_cancel_activity:     'cancel a compliance activity',
  can_export_report:       'export a compliance report',
  can_schedule_inspection: 'schedule an inspection',
  can_edit_inspection:     'edit an inspection',
  can_start_inspection:    'start an inspection',
}

/** Gate one route on one capability. */
export function requireCapability(capability: ComplianceCapability) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.complianceCaps?.[capability]) return next()
    return res.status(403).json({
      success: false,
      error: {
        message: `You do not have permission to ${CAPABILITY_LABELS[capability]}.`,
        capability,
      },
    })
  }
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
      if (err.code === '23505') return badRequest(res, 'A record with this code already exists')
      if (err.code === '23514') return badRequest(res, 'That value is not allowed')
      if (err.code === '42P01') {
        return res.status(503).json({
          success: false,
          error: { message: 'The Compliance module tables are not installed. Run migration 039.' },
        })
      }
      console.error(`[${name}]`, err)
      if (res.headersSent) return
      return res.status(500).json({ success: false, error: { message: 'Server error' } })
    }
  }
}

export const ok = (res: Response, data: unknown, extra: Record<string, unknown> = {}) =>
  res.json({ success: true, data, ...extra })

export const created = (res: Response, data: unknown) =>
  res.status(201).json({ success: true, data })
