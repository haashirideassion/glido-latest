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
  staffNotes?: string
  additionalReference?: string
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

// ── Customer Portal — Service Requests (Phase 2, FRD §2.4.1) ──────────────────

export type ServiceCategory = 'import' | 'export'
export type ShipmentMode = 'sea' | 'air'
export type RequestStage = 'received' | 'in_transit' | 'arrived' | 'completed'
// Request-level status badge (FR 2.3) — distinct from the progress `stage` above.
export type RequestStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected'
// FR 1.1.4.2 "Selected Services" list — matched 1:1: FCL Collection from Terminal, FCL Storage,
// FCL Collection, Dehire (empty container collection), LCL Collection, LCL Storage, Pack
// (Unpack), Inspection & Compliance. FCL/LCL Delivery are no longer tile options.
export type ServiceKey =
  | 'fcl_collection_terminal' | 'fcl_storage' | 'fcl_collection'
  | 'lcl_collection' | 'lcl_storage'
  | 'inspection_compliance' | 'unpack' | 'dehire'
export type ServiceStatus = 'pending' | 'in_progress' | 'completed'
// Admin-configurable from Reception Settings → Store Types (was a fixed union; now free text).
export type StoreSubType = string

// One selected storage option within the Store multi-select popup (Underbond/Reefer/General/
// admin-configured types, plus a free-text "Other"). Reefer alone carries power/temp.
export interface StoreDetailEntry {
  type: string
  note?: string
  power?: boolean
  temp?: string
}

export interface ServiceRequestService {
  id: string
  serviceKey: ServiceKey
  subType?: StoreSubType
  status: ServiceStatus
  currentInfo?: string
  durationLabel?: string
  details: Record<string, string>
}

export interface ServiceRequestDocument {
  id: string
  documentType: string
  filename?: string
  fileSizeBytes?: number
  storagePath: string
  createdAt: string
}

export interface ServiceRequest {
  id: string
  requestId: string           // SR###### shown to the customer
  customerId: string
  tenantId: string
  serviceCategory: ServiceCategory
  stage: RequestStage
  status: RequestStatus
  containerNumber?: string
  containerType?: string
  containerSize?: string
  vesselLine?: string
  voyageNumber?: string
  collectionDate?: string
  estimatedCost?: number
  // FR 2.3 — Out of Gauge cargo indicator; length/width/height (cm) only meaningful when isOOG.
  isOOG?: boolean
  oogLength?: string
  oogWidth?: string
  oogHeight?: string
  termsAccepted: boolean
  completedAt?: string
  createdAt: string
  updatedAt: string
  // Present only on the single-request detail fetch
  services?: ServiceRequestService[]
  documents?: ServiceRequestDocument[]
}

// ── Planner Module — Vessels & Trips (Phase 2, FRD §2.4.2) ────────────────────

export type VesselStatus = 'scheduled' | 'in_transit' | 'arrived'
export type TripCategory = 'import' | 'export'
export type TripServiceType = 'collection' | 'delivery' | 'dehire'
export type TripStage = 'planned' | 'assigned' | 'in_progress' | 'completed'

export interface Vessel {
  id: string
  vesselName: string
  vesselCode: string
  eta?: string
  /** Estimated time of departure. Third in the list sort chain (slotted → discharged → etd → eta). */
  etd?: string
  port?: string
  status: VesselStatus
  /** Live count of containers assigned via created business requests — derived, never stored. */
  containerCount: number
  /** Vessel capacity, in containers. */
  capacity?: number
  voyageNumber?: string
  /** Lloyd's Register / IMO identifier. Matched by the vessel search alongside name and ID. */
  lloydNumber?: string
  slottedAt?: string
  dischargedAt?: string
  tenantId: string
  createdAt: string
  updatedAt: string
}

export interface Trip {
  id: string
  tripRef: string
  serviceCategory: TripCategory
  serviceType: TripServiceType
  containerNumber?: string
  vesselId?: string
  vesselName?: string
  tripDate?: string
  vehicle?: string
  driver?: string
  stage: TripStage
  // FR — "Haz y/n" and "Weight" on the Planner Trips card (FRD §2.4.2.2). Both are columns on
  // trips and are set by the Allocator; optional here and required on AllocatorTrip, the same
  // relationship isOOG already has.
  isHazardous?: boolean
  weight?: string
  /** Rego of the allocated truck, mirrored on allocation — shown beside the driver. */
  vehicleRego?: string
  // FR — "OOG y/N if Y w/l/h in cm" (Planner Trips card/detail, FRD §2.4.2.2).
  isOOG?: boolean
  oogLength?: string
  oogWidth?: string
  oogHeight?: string
  tenantId: string
  createdAt: string
  updatedAt: string
}

export interface PlannerSettings {
  defaultLandingPage: string
  itemsPerPage: number
  showCompletedDefault: boolean
  emailNotifications: { vessel_arrival: boolean; trip_scheduled: boolean; trip_completed: boolean }
  systemNotifications: { vessel_arrival: boolean; trip_scheduled: boolean; trip_completed: boolean }
}

export interface PlannerReports {
  totalVessels: number
  activeTrips: number
  onTimeDeliveryPct: number | null
  monthlyContainerActivity: Array<{ month: string; imports: number; exports: number }>
  performanceMetrics: {
    avgTurnaroundHours: number | null
    resourceUtilizationPct: number | null
    planningAccuracyPct: number | null
    costPerTrip: number | null
  }
}

// ── Allocator Module — Resources, Trip Allocation, Maintenance (Phase 2, FRD §2.4.3) ──────────

export type ResourceStatus = 'available' | 'on_trip' | 'maintenance'
export type DriverStatus = 'on_duty' | 'off_duty' | 'on_leave'
export type TripPriority = 'high' | 'medium' | 'low'
export type AllocationStatus = 'pending' | 'allocated'
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed'
export type MaintenanceTab = 'current' | 'scheduled' | 'history'

export interface Truck {
  id: string
  resourceCode: string
  /** Registration plate. resourceCode (TRK-004) is an internal asset reference, not a plate. */
  vehicleRegistration?: string
  truckType?: string
  capacity?: string
  location?: string
  status: ResourceStatus
  lastServiceDate?: string
  customFieldValue?: string
  assignedTrailer?: Trailer | null
  assignedDriver?: Driver | null
  createdAt: string
  updatedAt: string
}

export interface Trailer {
  id: string
  resourceCode: string
  trailerType?: string
  capacity?: string
  attachedTruckId?: string | null
  status: ResourceStatus
  lastServiceDate?: string
  createdAt: string
  updatedAt: string
}

export interface Driver {
  id: string
  resourceCode: string
  driverName: string
  licenseClass?: string
  experienceYears?: number
  assignedTruckId?: string | null
  status: DriverStatus
  createdAt: string
  updatedAt: string
}

export interface AllocatorTrip extends Trip {
  priority: TripPriority
  origin?: string
  destination?: string
  timeWindowStart?: string
  timeWindowEnd?: string
  truckId?: string | null
  trailerId?: string | null
  driverId?: string | null
  allocationStatus: AllocationStatus
  timeToReach?: string
  timeToComplete?: string
  isHazardous: boolean
  weight?: string
  isOOG: boolean
  oogLength?: string
  oogWidth?: string
  oogHeight?: string
  customFieldValue?: string
}

export interface MaintenanceRecord {
  id: string
  maintenanceCode: string
  resourceType: 'truck' | 'trailer'
  resourceId: string
  resourceCode?: string | null
  activityType: string
  status: MaintenanceStatus
  priority: TripPriority
  dueDate?: string
  estimatedDuration?: string
  startDate?: string
  estimatedCompletion?: string
  completedDate?: string
  progressPct: number
  technician?: string
  contractor?: string
  customFieldValue?: string
  remarks?: string
  createdAt: string
  updatedAt: string
}

export interface AllocatorSettings {
  defaultView: string
  automatedAllocation: boolean
  operationStartTime: string
  operationEndTime: string
  newTripNotifications: boolean
  resourceConflictAlerts: boolean
  maintenanceReminders: boolean
  emailNotifications: boolean
}

// ── Compliance Module — Activities & Site Inspection (Phase 2, FRD §2.4.4) ────────────────────

export type ShipmentType = 'fcl' | 'lcl'
export type ComplianceActivityStatus = 'in_transit' | 'received' | 'completed' | 'cancelled'
export type InspectionStatus = 'scheduled' | 'in_progress' | 'completed' | 'overdue'
export type CompliancePriority = 'high' | 'medium' | 'low'

export interface ComplianceActivity {
  id: string
  entryNumber: string
  title: string
  requestNumber?: string
  containerNumber?: string
  containerType?: string
  vesselName?: string
  voyageNumber?: string
  shipmentType: ShipmentType
  status: ComplianceActivityStatus
  collectionDate?: string
  description?: string
  category?: string
  tags: string[]
  completedDate?: string
  completedBy?: string | null
  completedByName?: string | null
  assignedBy?: string | null
  assignedByName?: string | null
  qualityRating?: number | null
  reportAvailable: boolean
  createdAt: string
  updatedAt: string
}

export interface ComplianceInspection {
  id: string
  inspectionCode: string
  title: string
  description?: string
  inspectionType?: string
  location?: string
  inspectorName?: string
  scheduledAt?: string
  status: InspectionStatus
  priority: CompliancePriority
  checklistItems: string[]
  checklistObservations: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface ComplianceSummary {
  activeTasks: number
  completedThisMonth: number
  scheduledInspections: number
  overdueItems: number
}

export interface ComplianceActivityLogItem {
  id: string
  category: 'activity' | 'inspection'
  message: string
  status?: string | null
  priority?: string | null
  createdAt: string
}

export interface CompletedActivitiesSummary {
  totalCompleted: number
  thisMonth: number
  avgRating: number
  onTimePct: number
}

export interface InspectionsSummary {
  thisWeek: number
  inProgress: number
  completed: number
  overdue: number
}

export interface ComplianceCapabilities {
  can_create_activity: boolean
  can_edit_activity: boolean
  can_cancel_activity: boolean
  can_export_report: boolean
  can_schedule_inspection: boolean
  can_edit_inspection: boolean
  can_start_inspection: boolean
}
