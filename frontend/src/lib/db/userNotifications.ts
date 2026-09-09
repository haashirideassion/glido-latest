import { fetcher, patchFetcher } from '../fetcher'

export interface UserNotification {
  id: string
  category: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

function rowToNotif(row: any): UserNotification {
  return { id: row.id, category: row.category, title: row.title, body: row.body, read: row.read, createdAt: row.created_at }
}

export async function getUserNotifications(): Promise<UserNotification[]> {
  const res = await fetcher('/api/user-notifications')
  return (res?.data ?? []).map(rowToNotif)
}

export function markAllUserNotificationsRead(): void {
  patchFetcher('/api/user-notifications/read-all', {}).catch(() => {})
}
