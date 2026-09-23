import { fetcher } from '../fetcher'

export interface AllocatorActivityItem {
  id: string
  category: 'resource' | 'maintenance' | 'trip' | 'driver'
  message: string
  createdAt: string
}

export async function getAllocatorActivity(): Promise<AllocatorActivityItem[]> {
  const res = await fetcher('/api/allocator/activity')
  return (res?.data ?? []).map((r: any) => ({ id: r.id, category: r.category, message: r.message, createdAt: r.created_at }))
}
