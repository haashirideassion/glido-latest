import { fetcher, putFetcher } from '../fetcher'

export type CustomFieldType = 'text' | 'number' | 'date'
export interface CustomFieldConfig { label: string | null; type: CustomFieldType }

export function customFieldInputType(type: CustomFieldType): 'text' | 'number' | 'date' {
  return type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'
}

const BASE = '/api/truck-custom-field'

export async function getTruckCustomField(): Promise<CustomFieldConfig> {
  const res = await fetcher(BASE)
  return { label: res?.data?.fieldLabel ?? null, type: res?.data?.fieldType ?? 'text' }
}

export async function setTruckCustomField(label: string, type: CustomFieldType): Promise<CustomFieldConfig> {
  const res = await putFetcher(BASE, { field_label: label, field_type: type })
  return { label: res?.data?.fieldLabel ?? null, type: res?.data?.fieldType ?? 'text' }
}
