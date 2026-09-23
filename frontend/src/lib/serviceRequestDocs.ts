import type { ServiceKey } from '@/data/types'

export interface ServiceRequestDocSlot {
  docType: string
  label: string
  required: boolean
}

const BASE_DOCS: ServiceRequestDocSlot[] = [
  { docType: 'bill_of_lading',        label: 'Bill of Lading',        required: true  },
  { docType: 'commercial_invoice',    label: 'Commercial Invoice',    required: true  },
  { docType: 'packing_list',          label: 'Packing List',          required: false },
  { docType: 'certificate_of_origin', label: 'Certificate of Origin', required: false },
]

// The FRD's four required-documents names are fixed, but "the document list must be driven by
// the selected service" — services that specifically depend on one of the normally-optional docs
// promote it to required rather than introducing brand-new document types the FRD never names.
const SERVICE_PROMOTES_REQUIRED: Partial<Record<ServiceKey, string[]>> = {
  inspection_compliance: ['certificate_of_origin'],
  unpack:                ['packing_list'],
}

export function getDocSlotsForServices(serviceKeys: ServiceKey[]): ServiceRequestDocSlot[] {
  const promoted = new Set(serviceKeys.flatMap(key => SERVICE_PROMOTES_REQUIRED[key] ?? []))
  return BASE_DOCS.map(doc => promoted.has(doc.docType) ? { ...doc, required: true } : doc)
}

export function requiredDocTypesForServices(serviceKeys: ServiceKey[]): string[] {
  return getDocSlotsForServices(serviceKeys).filter(d => d.required).map(d => d.docType)
}
