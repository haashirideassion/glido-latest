import { fetcher, putFetcher } from '../fetcher'
import type { CustomFieldType } from './truck-custom-field'
import type { ServiceKey } from '@/data/types'

export type { CustomFieldType }
export interface ServiceFieldConfig { label: string | null; type: CustomFieldType }

const BASE = '/api/service-field-settings'

export async function getServiceFieldSettings(): Promise<Partial<Record<ServiceKey, ServiceFieldConfig>>> {
  const res = await fetcher(BASE)
  const data = res?.data ?? {}
  const out: Partial<Record<ServiceKey, ServiceFieldConfig>> = {}
  for (const key of Object.keys(data)) {
    out[key as ServiceKey] = { label: data[key]?.fieldLabel ?? null, type: data[key]?.fieldType ?? 'text' }
  }
  return out
}

export async function setServiceFieldSetting(serviceKey: ServiceKey, label: string, type: CustomFieldType): Promise<ServiceFieldConfig> {
  const res = await putFetcher(`${BASE}/${serviceKey}`, { field_label: label, field_type: type })
  return { label: res?.data?.fieldLabel ?? null, type: res?.data?.fieldType ?? 'text' }
}
