// Shared presentation constants for the Customer Portal Reports screen and its Custom Reports
// section — kept in one place so both stay in sync and avoid a circular import between them.

export const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.07)',
  borderRadius: 'var(--r-lg)',
  padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
}

export const SERVICE_LABEL: Record<string, string> = {
  fcl_collection_terminal: 'FCL run into Terminal', inspection_compliance: 'Inspection & compliance',
  fcl_storage: 'FCL Storage', lcl_storage: 'LCL storage',
  fcl_collection: 'FCL collection', lcl_collection: 'LCL collection',
  dehire: 'Empty container collection', unpack: 'Pack',
}

// "Request Status" (FR 2.4.1.4) is the request-level status field — matches the labels used in
// My Requests / Request Details, distinct from the progress-stage labels.
export const STATUS_LABEL: Record<string, string> = { pending: 'Pending', approved: 'Approved', in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected' }
