export type BookingStatus = 'scheduled' | 'checked_in' | 'completed' | 'cancelled'
export type ServiceType = 'pickup' | 'dropoff'
export type LoadType = 'fcl' | 'lcl'
export type SlotBusyness = 'available' | 'busy' | 'full' | 'closed'
export type IcsStatus = 'cleared' | 'held' | 'examination' | 'pending' | 'unavailable'
export type PalletType = 'chep' | 'plain' | 'other' | 'none'
export type WalkInPurpose = 'walk_in_pickup' | 'walk_in_dropoff' | 'visit_person' | 'visit_office' | 'visit_yard'

export interface Booking {
  id: string
  referenceNumber: string    // GLD-YYYY-XXXXX
  sessionId?: string         // groups multiple slots
  status: BookingStatus
  serviceType: ServiceType
  loadType: LoadType
  slotDate: string           // YYYY-MM-DD
  slotStartTime: string      // HH:MM
  slotEndTime: string        // HH:MM
  guestName?: string         // if guest booking
  guestEmail?: string
  guestPhone?: string
  companyName?: string
  driverName: string         // person physically visiting
  driverPhone?: string
  houseBillNumber?: string   // HBL — required for LCL
  containerNumber?: string   // required for FCL or LCL pickup
  weightKg?: number
  volumeCbm?: number
  packageCount?: number
  palletCount?: number
  palletType?: PalletType
  storageStartDate?: string
  storageDays?: number
  storageCharge?: number
  shrinkWrapCharge?: number
  slotFee?: number
  subtotal?: number
  gstAmount?: number
  totalAmount?: number
  paymentMethod?: 'card' | 'eft'
  paymentStatus?: 'pending' | 'pending_eft' | 'paid' | 'failed'
  icsStatus?: IcsStatus
  icsLastCheckedAt?: string
  checkedInAt?: string
  completedAt?: string
  completionNotes?: string
  // Extended shipment / load fields
  containerSize?:      string
  entryNumber?:        string
  purpose?:            string
  consolidator?:       string
  bookingReference?:   string
  vehicleRegistration?: string
  // Multi-slot grouping
  bookingGroupId?:     string
  slotIndex?:          number
  groupReference?:     string   // human-readable master ref, same across all slots in a group
  // Booking origin
  bookingSource?:      'self_booking' | 'guest' | 'reception_booking'
  tenantId: string
  createdAt: string
  updatedAt: string
}

export interface TimeSlot {
  id: string
  date: string
  startTime: string
  endTime: string
  capacity: number
  confirmed: number
  held: number
  busyness: SlotBusyness
  // Present only when the slot list was fetched with a serviceType+loadType and that combo
  // has a configured sub-quota (Settings → Capacity by Booking Type) — busyness already
  // reflects whichever of the hour-total or combo cap is tighter.
  comboCapacity?:  number
  comboConfirmed?: number
}

export interface WalkIn {
  id: string
  tenantId: string
  purpose: WalkInPurpose
  visitorName: string
  contactNumber?: string
  companyName?: string
  personBeingVisited?: string
  reason?: string
  arrivedAt: string
  licenceCaptured: boolean
  dismissed: boolean
  dismissedAt?: string
}

export interface DashboardStats {
  todaysVisitors: number
  checkedIn: number
  pending: number
  icsHeld: number   // ICS status = 'held', awaiting customs clearance
  recentVisitors: Booking[]
}
