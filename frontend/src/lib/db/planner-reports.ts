import { fetcher, postFetcher } from '../fetcher'
import type { PlannerReports, TripCategory } from '@/data/types'

export interface PlannerReportsParams {
  from?: string
  to?: string
  category?: TripCategory
}

export async function getPlannerReports(params: PlannerReportsParams = {}): Promise<PlannerReports | null> {
  const qs = new URLSearchParams()
  if (params.from)     qs.set('from', params.from)
  if (params.to)       qs.set('to', params.to)
  if (params.category) qs.set('category', params.category)
  const query = qs.toString()
  const res = await fetcher(`/api/planner/reports${query ? `?${query}` : ''}`)
  return res?.data ?? null
}

export function logReportExport(): void {
  postFetcher('/api/planner/reports/export-log', {}).catch(() => {})
}

export interface PlannerActivityItem {
  id: string
  category: 'vessel' | 'trip' | 'report'
  message: string
  createdAt: string
}

export async function getPlannerActivity(): Promise<PlannerActivityItem[]> {
  const res = await fetcher('/api/planner/activity')
  return (res?.data ?? []).map((r: any) => ({ id: r.id, category: r.category, message: r.message, createdAt: r.created_at }))
}
