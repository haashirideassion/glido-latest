import { useState, useEffect } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { getUserNotifications, markAllUserNotificationsRead } from '@/lib/db/userNotifications'
import type { UserNotification } from '@/lib/db/userNotifications'

// Shared per-user notification bell — used by Planner/Allocator layouts. Mirrors Reception's
// bell dropdown, minus booking-specific link parsing (not applicable to these modules).
export function NotificationBell({ categoryIcon }: { categoryIcon: Record<string, { icon: string; color: string }> }) {
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<UserNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const loadCount = async () => {
      try {
        const rows = await getUserNotifications()
        if (!cancelled) setUnreadCount(rows.filter(n => !n.read).length)
      } catch { /* ignore */ }
    }
    loadCount()
    const interval = setInterval(loadCount, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const toggleOpen = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    try {
      const rows = await getUserNotifications()
      setNotifs(rows)
      setUnreadCount(0)
      markAllUserNotificationsRead()
    } catch { /* ignore */ }
  }

  const markAllRead = () => {
    markAllUserNotificationsRead()
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={toggleOpen} title="Notifications" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        style={{ width: 36, height: 36, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.09)', background: open ? 'rgba(var(--brand-rgb),0.07)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.13s' }}>
        <Icon name={ICONS.bell} size={17} style={{ color: open ? 'var(--brand-color)' : '#6B7280' }} />
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 999, background: '#EF4444', border: '2px solid #f9f9f9', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 3px' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9100 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: 56, right: 60, zIndex: 9101, width: 360, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.15),0 3px 10px rgba(0,0,0,0.07)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>Notifications</span>
              {notifs.length > 0 && (
                <button onClick={markAllRead} style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  Mark all read
                </button>
              )}
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <Icon name={ICONS.bell} size={32} style={{ color: 'rgba(0,0,0,0.12)' }} />
                  <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No notifications yet</p>
                </div>
              ) : notifs.map(n => {
                const meta = categoryIcon[n.category] ?? { icon: ICONS.bell, color: '#6B7280' }
                const age = (() => {
                  const s = Math.floor((Date.now() - new Date(n.createdAt).getTime()) / 1000)
                  if (s < 60) return 'Just now'
                  if (s < 3600) return `${Math.floor(s / 60)}m ago`
                  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
                  return `${Math.floor(s / 86400)}d ago`
                })()
                return (
                  <div key={n.id} style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: n.read ? 'transparent' : 'rgba(var(--brand-rgb),0.03)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', background: `${meta.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={meta.icon} size={14} style={{ color: meta.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1C1917', margin: 0 }}>{n.title}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.35 }}>{n.body}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{age}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
