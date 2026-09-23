import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { ServiceRequest, ServiceRequestService, ServiceRequestDocument, ServiceCategory } from '@/data/types'

const BASE = '/api/service-requests'

function rowToService(row: any): ServiceRequestService {
  return {
    id:            row.id,
    serviceKey:    row.service_key,
    subType:       row.sub_type ?? undefined,
    status:        row.status,
    currentInfo:   row.current_info ?? undefined,
    durationLabel: row.duration_label ?? undefined,
    details:       row.details ?? {},
  }
}

function rowToDocument(row: any): ServiceRequestDocument {
  return {
    id:            row.id,
    documentType:  row.document_type,
    filename:      row.filename ?? undefined,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : undefined,
    storagePath:   row.storage_path,
    createdAt:     row.created_at,
  }
}

function rowToServiceRequest(row: any): ServiceRequest {
  return {
    id:              row.id,
    requestId:       row.request_id,
    customerId:      row.customer_id,
    tenantId:        row.tenant_id,
    serviceCategory: row.service_category,
    stage:           row.stage,
    status:          row.status ?? 'pending',
    containerNumber: row.container_number ?? undefined,
    containerType:   row.container_type   ?? undefined,
    containerSize:   row.container_size   ?? undefined,
    vesselLine:      row.vessel_line      ?? undefined,
    voyageNumber:    row.voyage_number    ?? undefined,
    collectionDate:  row.collection_date  ?? undefined,
    estimatedCost:   row.estimated_cost != null ? Number(row.estimated_cost) : undefined,
    isOOG:           row.is_oog ?? false,
    oogLength:       row.oog_length ?? undefined,
    oogWidth:        row.oog_width  ?? undefined,
    oogHeight:       row.oog_height ?? undefined,
    termsAccepted:   row.terms_accepted,
    completedAt:     row.completed_at     ?? undefined,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    services:        Array.isArray(row.services)  ? row.services.map(rowToService)   : undefined,
    documents:       Array.isArray(row.documents) ? row.documents.map(rowToDocument) : undefined,
  }
}

export interface ServiceRequestListParams {
  category?: ServiceCategory
  search?: string
  sort?: 'newest' | 'oldest'
  from?: string
  to?: string
}

export async function getServiceRequests(params: ServiceRequestListParams = {}): Promise<ServiceRequest[]> {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.search)   qs.set('search', params.search)
  if (params.sort)     qs.set('sort', params.sort)
  if (params.from)     qs.set('from', params.from)
  if (params.to)       qs.set('to', params.to)
  const query = qs.toString()
  const res = await fetcher(`${BASE}${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToServiceRequest)
}

export async function getServiceRequest(idOrRequestId: string): Promise<ServiceRequest | null> {
  const res = await fetcher(`${BASE}/${idOrRequestId}`)
  return res?.data ? rowToServiceRequest(res.data) : null
}

export interface CreateServiceRequestPayload {
  request_id?: string
  service_category: ServiceCategory
  services: Array<{
    service_key: string
    sub_type?: string
    duration_label?: string
    details?: Record<string, string>
  }>
  documents: Array<{ doc_type: string; filename: string; size: number; storage_path: string }>
  terms_accepted: boolean
  container_number?: string
  container_type?: string
  container_size?: string
  vessel_line?: string
  voyage_number?: string
  collection_date?: string
  is_oog?: boolean
  oog_length?: string
  oog_width?: string
  oog_height?: string
}

export async function createServiceRequest(payload: CreateServiceRequestPayload): Promise<ServiceRequest | null> {
  const res = await postFetcher(BASE, payload)
  return res?.data ? rowToServiceRequest(res.data) : null
}

// Shipment-detail corrections a customer may make while their request is still `pending`.
// Services and documents are not editable — see EditRequestModal for the reasoning.
export interface UpdateServiceRequestPayload {
  container_number?: string | null
  container_type?: string | null
  container_size?: string | null
  vessel_line?: string | null
  voyage_number?: string | null
  collection_date?: string | null
  is_oog?: boolean
  oog_length?: string | null
  oog_width?: string | null
  oog_height?: string | null
}

export async function updateServiceRequest(idOrRequestId: string, payload: UpdateServiceRequestPayload): Promise<ServiceRequest | null> {
  const res = await patchFetcher(`${BASE}/${idOrRequestId}`, payload)
  return res?.data ? rowToServiceRequest(res.data) : null
}

export interface ServiceRequestReports {
  serviceTypeDistribution: Array<{ service_key: string; count: number }>
  requestStatus: Array<{ status: string; count: number }>
  monthlyRequests: Array<{ month: string; count: number }>
  avgProcessingDays: number | null
}

export interface ServiceRequestReportsParams {
  category?: ServiceCategory
  from?: string
  to?: string
}

export async function getServiceRequestReports(params: ServiceRequestReportsParams = {}): Promise<ServiceRequestReports | null> {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.from)      qs.set('from', params.from)
  if (params.to)        qs.set('to', params.to)
  const query = qs.toString()
  const res = await fetcher(`${BASE}/reports${query ? `?${query}` : ''}`)
  return res?.data ?? null
}
