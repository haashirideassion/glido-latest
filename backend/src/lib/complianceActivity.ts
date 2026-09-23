import { pool } from '../db'
import { DEFAULT_TENANT_ID } from './complianceHttp'

/** Fire-and-forget dashboard activity logger — mirrors logAllocatorActivity. */
export async function logComplianceActivity(
  category: 'activity' | 'inspection',
  message: string,
  createdBy?: string,
  extra: { status?: string; priority?: string } = {},
) {
  try {
    await pool.query(
      `INSERT INTO compliance_activity_log (category, message, status, priority, tenant_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [category, message, extra.status ?? null, extra.priority ?? null, DEFAULT_TENANT_ID, createdBy ?? null]
    )
  } catch (err) {
    console.error('[logComplianceActivity]', err)
  }
}
