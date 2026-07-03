import { Icon, ICONS } from '../../lib/Icon'
import type { Booking } from '../../data/types'

interface Props {
  bookings: Booking[]
  id?: string
  'hx-swap-oob'?: string
}

export const BookingKpiTiles = ({ bookings, id, 'hx-swap-oob': hxSwapOob }: Props) => {
  const totalBookings = bookings.length
  const totalVisitors = new Set(bookings.map((b) => b.driverName)).size
  const preProcessed  = bookings.filter((b) => b.status === 'scheduled').length
  const checkedIn     = bookings.filter((b) => b.status === 'checked_in').length
  const completed     = bookings.filter((b) => b.status === 'completed').length

  const tiles = [
    {
      label:   'Total Bookings',
      value:   totalBookings,
      sub:     'Matching filters',
      icon:    ICONS.bookings,
      iconBg:  'rgba(28,25,23,0.06)',
      iconFg:  '#1C1917',
      trend:   '+12%',
      trendUp: true,
    },
    {
      label:   'Total Visitors',
      value:   totalVisitors,
      sub:     'Unique drivers',
      icon:    ICONS.users,
      iconBg:  'rgba(59,130,246,0.10)',
      iconFg:  '#3B82F6',
      trend:   '+8%',
      trendUp: true,
    },
    {
      label:   'Pre-processed',
      value:   preProcessed,
      sub:     'Scheduled status',
      icon:    ICONS.calendar,
      iconBg:  'rgba(251,191,36,0.10)',
      iconFg:  '#FBBF24',
      trend:   '-3%',
      trendUp: false,
    },
    {
      label:   'Checked-in',
      value:   checkedIn,
      sub:     'Currently on site',
      icon:    ICONS.userCheck,
      iconBg:  'rgba(34,197,94,0.10)',
      iconFg:  '#22C55E',
      trend:   '+15%',
      trendUp: true,
    },
    {
      label:   'Completed',
      value:   completed,
      sub:     'Visit finished',
      icon:    ICONS.checkSquare,
      iconBg:  'rgba(148,163,184,0.10)',
      iconFg:  '#94A3B8',
      trend:   '+21%',
      trendUp: true,
    },
  ]

  return (
    <div id={id} hx-swap-oob={hxSwapOob} style="display:grid; grid-template-columns:repeat(5, 1fr); gap:16px; margin-bottom:24px;" data-stagger data-stagger-ms="60">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:18px; padding:20px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07); transition:transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease;"
          onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)';"
          onmouseout="this.style.transform=''; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07)';"
        >
          <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px;">
            <div
              style={`width:40px; height:40px; border-radius:12px; background:${tile.iconBg}; display:flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid ${tile.iconFg}22;`}
            >
              <Icon name={tile.icon} size={20} style={`color:${tile.iconFg};`} />
            </div>

            {/* Percentage change badge — Hardcoded placeholder as requested */}
            {/* TODO: Wire real comparison data later */}
            <div style={`vertical-align:middle; display:inline-flex; align-items:center; gap:3px; padding:4px 10px; border-radius:8px; font-size:13px; font-weight:700; ${tile.trendUp ? 'background:rgba(34,197,94,0.08); color:#16A34A; border:1px solid rgba(34,197,94,0.15);' : 'background:rgba(239,68,68,0.08); color:#DC2626; border:1px solid rgba(239,68,68,0.15);'}`}>
              <Icon name={tile.trendUp ? ICONS.arrowUp : ICONS.arrowDown} size={11} />
              {tile.trend}
            </div>
          </div>

          <p style="font-size:38px; font-weight:800; letter-spacing:-0.04em; line-height:1; color:#1C1917; margin-bottom:5px; font-variant-numeric:tabular-nums;">
            {tile.value}
          </p>
          <p style="font-size:14px; font-weight:700; color:#1C1917; margin-bottom:2px;">{tile.label}</p>
          <p style="font-size:14px; color:#4B5563; margin:0;">{tile.sub}</p>
        </div>
      ))}
    </div>
  )
}
