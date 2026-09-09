import { fetcher, putFetcher } from '../fetcher'
import type { CustomFieldType, CustomFieldConfig } from './truck-custom-field'

const BASE = '/api/maintenance-custom-field'

export async function getMaintenanceCustomField(): Promise<CustomFieldConfig> {
  const res = await fetcher(BASE)
  return { label: res?.data?.fieldLabel ?? null, type: res?.data?.fieldType ?? 'text' }
}

export async function setMaintenanceCustomField(label: string, type: CustomFieldType): Promise<CustomFieldConfig> {
  const res = await putFetcher(BASE, { field_label: label, field_type: type })
  return { label: res?.data?.fieldLabel ?? null, type: res?.data?.fieldType ?? 'text' }
}
