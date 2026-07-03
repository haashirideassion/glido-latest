import { useEffect, useRef } from 'react'
import type { Booking } from '@/data/types'

declare const echarts: any

const HOURS = ['07','08','09','10','11','12','13','14','15','16','17']

interface Props {
  bookings: Booking[]
  loading?: boolean
  capacityByHour?: Record<string, number>
  defaultCapacity?: number
}

export function DayChart({ bookings, loading, capacityByHour, defaultCapacity }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const scheduled = HOURS.map(h => bookings.filter(b => b.slotStartTime.startsWith(h) && b.status === 'scheduled').length)
  const checkedIn = HOURS.map(h => bookings.filter(b => b.slotStartTime.startsWith(h) && (b.status === 'checked_in' || b.status === 'completed')).length)
  const capacity  = HOURS.map(h => capacityByHour?.[`${h}:00`] ?? defaultCapacity ?? 5)

  useEffect(() => {
    if (!ref.current) return
    let chart: any

    const init = () => {
      if (typeof echarts === 'undefined') { setTimeout(init, 100); return }
      if (!ref.current) return
      chart = echarts.init(ref.current, null, { renderer: 'svg' })
      chart.setOption({
        animation: false,
        grid: { top: 12, right: 12, bottom: 52, left: 32, containLabel: false },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(28,25,23,0.88)',
          borderColor: 'transparent',
          textStyle: { color: '#FCFBF8', fontFamily: 'Inter,ui-sans-serif,sans-serif', fontSize: 14 },
          axisPointer: { type: 'shadow' },
          formatter: (params: any[]) => {
            const hour  = params[0]?.axisValue ?? ''
            const sched = params.find((p: any) => p.seriesName === 'Scheduled')?.value ?? 0
            const onSite = params.find((p: any) => p.seriesName === 'Visitor')?.value ?? 0
            const cap   = params.find((p: any) => p.seriesName === 'Capacity')?.value ?? (defaultCapacity ?? 5)
            const total = sched + onSite
            const pct   = cap > 0 ? Math.round((total / cap) * 100) : 0
            return [
              `<span style="font-weight:600;color:#FCFBF8">${hour}</span>`,
              `<span style="color:rgba(var(--brand-rgb),0.80)">● Scheduled</span> ${sched}`,
              `<span style="color:var(--brand-color)">● Visitor</span> ${onSite}`,
              `<span style="color:#C7C3BF">— Capacity</span> ${total} / ${cap} slots (${pct}%)`,
            ].join('<br/>')
          },
        },
        legend: {
          bottom: 0, left: 'center',
          itemWidth: 10, itemHeight: 10,
          textStyle: { color: 'var(--text-tertiary)', fontFamily: 'Inter,ui-sans-serif,sans-serif', fontSize: 13 },
          icon: 'circle',
        },
        xAxis: {
          type: 'category',
          data: HOURS.map(h => `${h}:00`),
          axisLine: { lineStyle: { color: 'rgba(214,211,209,0.5)' } },
          axisTick: { show: false },
          axisLabel: { color: 'var(--text-tertiary)', fontFamily: 'Inter,ui-sans-serif,sans-serif', fontSize: 13 },
        },
        yAxis: {
          type: 'value', minInterval: 1,
          splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } },
          axisLabel: { color: 'var(--text-tertiary)', fontFamily: 'Inter,ui-sans-serif,sans-serif', fontSize: 13 },
        },
        series: [
          {
            name: 'Scheduled', type: 'bar', stack: 'day', data: scheduled, barMaxWidth: 28,
            itemStyle: { color: 'rgba(var(--brand-rgb),0.35)', borderRadius: [4, 4, 0, 0] },
          },
          {
            name: 'Visitor', type: 'bar', stack: 'day', data: checkedIn, barMaxWidth: 28,
            itemStyle: { color: 'var(--brand-color)', borderRadius: [4, 4, 0, 0] },
          },
          {
            name: 'Capacity', type: 'line', data: capacity,
            symbol: 'circle', symbolSize: 5,
            lineStyle: { color: '#C7C3BF', type: 'dashed', width: 1.5 },
            itemStyle: { color: '#C7C3BF' },
            areaStyle: undefined,
          },
        ],
      })
      const onResize = () => chart?.resize()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
    init()
    return () => chart?.dispose()
  }, [bookings, capacityByHour]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', letterSpacing: '-0.01em' }}>Day at a Glance</h2>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Today · hourly schedule</span>
      </div>
      {loading ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 6, padding: '0 4px' }}>
          {[40,65,30,80,55,45,70,35,60,50,25].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0', background: 'rgba(0,0,0,0.07)', animation: 'dash-pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.07}s` }} />
          ))}
          <style>{`@keyframes dash-pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
        </div>
      ) : (
        <div ref={ref} style={{ height: 160, width: '100%' }} />
      )}
    </div>
  )
}
