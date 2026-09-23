import { fetcher, postFetcher, patchFetcher, deleteFetcher } from '../fetcher'

export type ReportFrequency = 'daily' | 'weekly' | 'monthly'
export type ReportMetric = 'service_type_distribution' | 'request_status' | 'monthly_requests' | 'processing_time'

export const METRIC_LABEL: Record<ReportMetric, string> = {
  service_type_distribution: 'Service Type Distribution',
  request_status: 'Request Status',
  monthly_requests: 'Monthly Service Requests',
  processing_time: 'Processing Time Average',
}

export interface CustomerReportSchedule {
  id: string
  name: string
  categoryFilter?: 'import' | 'export'
  metrics: ReportMetric[]
  frequency: ReportFrequency
  active: boolean
  lastRunAt?: string
  nextRunAt: string
  runCount: number
  createdAt: string
}

export interface CustomerReportRun {
  id: string
  generatedAt: string
  snapshot: {
    serviceTypeDistribution: Array<{ service_key: string; count: number }>
    requestStatus: Array<{ status: string; count: number }>
    monthlyRequests: Array<{ month: string; count: number }>
    avgProcessingDays: number | null
  }
}

const BASE = '/api/customer-report-schedules'

function rowToSchedule(row: any): CustomerReportSchedule {
  return {
    id: row.id,
    name: row.name,
    categoryFilter: row.category_filter ?? undefined,
    metrics: row.metrics ?? [],
    frequency: row.frequency,
    active: row.active,
    lastRunAt: row.last_run_at ?? undefined,
    nextRunAt: row.next_run_at,
    runCount: row.run_count ?? 0,
    createdAt: row.created_at,
  }
}

function rowToRun(row: any): CustomerReportRun {
  return { id: row.id, generatedAt: row.generated_at, snapshot: row.snapshot }
}

export async function getCustomerReportSchedules(): Promise<CustomerReportSchedule[]> {
  const res = await fetcher(BASE)
  return (res?.data ?? []).map(rowToSchedule)
}

export interface CreateSchedulePayload {
  name: string
  category_filter?: 'import' | 'export'
  metrics: ReportMetric[]
  frequency: ReportFrequency
}

export async function createCustomerReportSchedule(payload: CreateSchedulePayload): Promise<CustomerReportSchedule | null> {
  const res = await postFetcher(BASE, payload)
  return res?.data ? rowToSchedule(res.data) : null
}

export async function updateCustomerReportSchedule(id: string, patch: Partial<CreateSchedulePayload & { active: boolean }>): Promise<CustomerReportSchedule | null> {
  const res = await patchFetcher(`${BASE}/${id}`, patch)
  return res?.data ? rowToSchedule(res.data) : null
}

export async function deleteCustomerReportSchedule(id: string): Promise<boolean> {
  const res = await deleteFetcher(`${BASE}/${id}`)
  return !!res?.success
}

export async function getCustomerReportRuns(scheduleId: string): Promise<CustomerReportRun[]> {
  const res = await fetcher(`${BASE}/${scheduleId}/runs`)
  return (res?.data ?? []).map(rowToRun)
}
