import type { BookingStatus, SlotBusyness, ServiceType, LoadType, IcsStatus } from '../data/types'

export const STATUS_ROW_CLASS: Record<BookingStatus, string> = {
  scheduled:  'bg-white hover:bg-slate-50',
  checked_in: 'bg-green-50 hover:bg-green-100',
  completed:  'bg-slate-50 hover:bg-slate-100',
  cancelled:  'bg-slate-100 text-slate-400',
}

export const STATUS_BADGE_VARIANT: Record<BookingStatus, string> = {
  scheduled:  'default',
  checked_in: 'success',
  completed:  'secondary',
  cancelled:  'outline',
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  scheduled:  'Scheduled',
  checked_in: 'Checked In',
  completed:  'Completed',
  cancelled:  'Cancelled',
}

export const SLOT_CELL_CLASS: Record<SlotBusyness, string> = {
  available: 'bg-green-50 border border-green-200 text-green-800 hover:bg-green-100 cursor-pointer transition-colors',
  busy:      'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 cursor-pointer transition-colors',
  full:      'bg-red-50 border border-red-200 text-red-500 cursor-not-allowed opacity-60',
  closed:    'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed',
}

export const SERVICE_LABEL: Record<ServiceType, string> = {
  pickup:  'Pick Up',
  dropoff: 'Drop Off',
}

export const LOAD_LABEL: Record<LoadType, string> = {
  fcl: 'FCL',
  lcl: 'LCL',
}

export const ICS_BADGE_CLASS: Record<IcsStatus, string> = {
  cleared:     'bg-green-100 text-green-800 border-green-200',
  held:        'bg-red-100 text-red-800 border-red-200',
  examination: 'bg-amber-100 text-amber-800 border-amber-200',
  pending:     'bg-slate-100 text-slate-500 border-slate-200',
  unavailable: 'bg-slate-100 text-slate-400 border-slate-200',
}

export const ICS_LABEL: Record<IcsStatus, string> = {
  cleared:     'Cleared',
  held:        'Held',
  examination: 'Examination',
  pending:     'Pending',
  unavailable: 'N/A',
}
