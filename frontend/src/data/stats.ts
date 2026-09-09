import type { DashboardStats } from './types'

// This is superseded by getDashboardStats() in bookings.ts, but kept for
// fallback import compatibility.
export const mockStats: DashboardStats = {
  totalScheduled: 8,
  checkedIn: 2,
  completed: 2,
  held: 1,
}
