import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useWizard } from '@/contexts/WizardContext'
import datetimeImg from '@/assets/datetime.png'
import { getTenant } from '@/lib/db/tenants'
import { getSlotsByDate } from '@/lib/db/slots'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { todaySydney, TZ } from '@/lib/time'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import type { TimeSlot } from '@/data/types'
import type { TenantRow } from '@/lib/db/tenants'

const TZ_OPT = { timeZone: TZ }

// ─── Tenant config types ──────────────────────────────────────────────────────

interface DayHours { enabled: boolean; open: string; close: string }
interface WorkingHoursConfig {
  mon: DayHours; tue: DayHours; wed: DayHours; thu: DayHours
  fri: DayHours; sat: DayHours; sun: DayHours
  periods?: PeriodConfig
}
interface PeriodDef { enabled: boolean; label: string; start: string; end: string }
interface PeriodConfig { morning: PeriodDef; afternoon: PeriodDef; evening: PeriodDef }

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

const DEFAULT_PERIODS: PeriodConfig = {
  morning:   { enabled: true,  label: 'Morning Slots',   start: '00:00', end: '12:00' },
  afternoon: { enabled: true,  label: 'Afternoon Slots', start: '12:00', end: '17:00' },
  evening:   { enabled: true,  label: 'Evening Slots',   start: '17:00', end: '24:00' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function getDayKey(isoDate: string): typeof DAY_KEYS[number] {
  // Parse using Sydney local time
  const d = new Date(isoDate + 'T00:00:00')
  const dow = parseInt(d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: TZ })
    .slice(0, 2).toLowerCase() === 'su' ? '0' :
    d.toLocaleDateString('en-AU', { weekday: 'narrow', timeZone: TZ }) === 'M' ? '1' :
    d.toLocaleDateString('en-AU', { weekday: 'narrow', timeZone: TZ }) === 'T' &&
    d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: TZ }).startsWith('Tu') ? '2' :
    d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: TZ }).startsWith('W') ? '3' :
    d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: TZ }).startsWith('Th') ? '4' :
    d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: TZ }).startsWith('F') ? '5' :
    d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: TZ }).startsWith('Sa') ? '6' : '0')
  // Simpler: use getDay on the date parsed in Sydney time
  const sydneyDate = new Date(new Date(isoDate + 'T12:00:00').toLocaleString('en-US', TZ_OPT))
  return DAY_KEYS[sydneyDate.getDay()]
}

function generateSlotsFromConfig(
  date: string,
  dayCfg: DayHours,
  durationMin: number,
  capacity: number,
  dbSlots: TimeSlot[],
  periods: PeriodConfig,
  capacityByHour?: Record<string, number>,
): TimeSlot[] {
  // Only generate within enabled period ranges
  const enabledRanges = Object.values(periods)
    .filter(p => p.enabled)
    .map(p => ({ start: timeToMin(p.start), end: timeToMin(p.end) }))

  // Fallback to full open→close if no periods configured
  if (enabledRanges.length === 0) {
    enabledRanges.push({ start: timeToMin(dayCfg.open), end: timeToMin(dayCfg.close) })
  }

  const slots: TimeSlot[] = []

  for (const range of enabledRanges) {
    for (let start = range.start; start + durationMin <= range.end; start += durationMin) {
      const startTime = minToTime(start)
      const endTime   = minToTime(start + durationMin)
      const id        = `gen-${date}-${startTime.replace(':', '')}`

      // Merge with DB slot if one exists for this exact time
      const dbSlot = dbSlots.find(s => s.startTime === startTime)

      // Format slot start time as "HH:MM" to match the stored key
      const slotKey      = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`
      const slotCapacity = capacityByHour?.[slotKey] ?? capacity

      const confirmed = dbSlot?.confirmed ?? 0
      const held      = dbSlot?.held      ?? 0
      const busyness  = confirmed >= slotCapacity
        ? 'full'
        : confirmed / slotCapacity >= 0.6 ? 'busy' : 'available'

      slots.push({
        id:        dbSlot?.id ?? id,
        date,
        startTime,
        endTime,
        capacity:  slotCapacity,
        confirmed,
        held,
        busyness:  busyness as TimeSlot['busyness'],
      })
    }
  }
  return slots
}

function groupSlotsByPeriods(slots: TimeSlot[], periods: PeriodConfig) {
  const groups: { period: PeriodDef; key: string; slots: TimeSlot[] }[] = []
  const periodEntries = Object.entries(periods) as [string, PeriodDef][]
  const lastKey = periodEntries.filter(([, p]) => p.enabled).at(-1)?.[0]
  for (const [key, period] of periodEntries) {
    if (!period.enabled) continue
    const isLast = key === lastKey
    const periodSlots = slots.filter(s =>
      isLast
        ? s.startTime >= period.start   // last period: no upper bound
        : s.startTime >= period.start && s.startTime < period.end
    )
    if (periodSlots.length > 0) {
      groups.push({ period, key, slots: periodSlots })
    }
  }
  return groups  // ← no "Other Slots" fallback at all
}

// ─── Date strip ───────────────────────────────────────────────────────────────

function calendarDays(n: number) {
  const days = []
  const todayIso = todaySydney()
  const startMs = new Date(new Date().toLocaleString('en-US', TZ_OPT)).setHours(0, 0, 0, 0)
  let ms = startMs
  while (days.length < n) {
    const d   = new Date(ms)
    const iso = d.toLocaleDateString('sv-SE', TZ_OPT)
    days.push({
      iso,
      isToday: iso === todayIso,
      dayFull: d.toLocaleDateString('en-AU', { weekday: 'long',    timeZone: TZ }),
      num:     d.toLocaleDateString('en-AU', { day: 'numeric',     timeZone: TZ }),
      dayKey:  DAY_KEYS[new Date(new Date(iso + 'T12:00:00').toLocaleString('en-US', TZ_OPT)).getDay()],
    })
    ms += 86400000
  }
  return days
}

// DATES is now computed dynamically inside the component from tenant config

// Period icon mapping
const PERIOD_ICONS: Record<string, string> = {
  morning:   ICONS.bell,
  afternoon: ICONS.clock,
  evening:   ICONS.star,
  other:     ICONS.calendar,
}

// ─── Main component ────────────────────────────────────────────────────────────

export function Step4ShipmentDetails() {
  const { state, dispatch } = useWizard()

  // Tab state for multi-slot — lifted into WizardState so the 3D scene can focus on the slot being edited
  const activeSlot = state.step4ActiveSlot ?? 0
  const setActiveSlot = (i: number) => dispatch({ type: 'SET', field: 'step4ActiveSlot', value: i })

  // Start on the first slot without a selection (only on first visit)
  useEffect(() => {
    if (state.step4ActiveSlot === 0) {
      const firstIncomplete4 = state.slotConfigs.findIndex(c => !c.selectedSlotId)
      if (firstIncomplete4 > 0) setActiveSlot(firstIncomplete4)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tenant config — loaded once on mount
  const [tenant,        setTenant]        = useState<TenantRow | null>(null)
  const [tenantLoading, setTenantLoading] = useState(true)

  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(t => setTenant(t ?? null))
      .catch(() => setTenant(null))
      .finally(() => setTenantLoading(false))
  }, [])

  const multi = state.slotCount > 1

  // ── Single-slot: existing state-driven slot loading ────────────────────────
  useEffect(() => {
    if (multi || !state.selectedDate || tenantLoading) return
    let cancelled = false
    dispatch({ type: 'SET_SLOTS', slots: [], loading: true })
    const wh     = tenant?.working_hours as unknown as WorkingHoursConfig | null
    const dayKey = getDayKey(state.selectedDate)
    const dayCfg = wh?.[dayKey]
    if (dayCfg && !dayCfg.enabled) {
      if (!cancelled) dispatch({ type: 'SET_SLOTS', slots: [], loading: false })
      return
    }
    const durationMin      = tenant?.slot_duration_min     ?? 60
    const capacityByHour   = (tenant as any)?.slot_capacity_by_hour as Record<string, number> | undefined
    const capacityByCombo  = (tenant as any)?.slot_capacity_by_combo as Record<string, number> | undefined
    const comboKey         = `${state.serviceType ?? 'pickup'}-${state.loadType ?? 'lcl'}`
    const capacity         = capacityByCombo?.[comboKey] ?? tenant?.max_bookings_per_slot ?? 10
    getSlotsByDate(state.selectedDate)
      .then(dbSlots => {
        if (cancelled) return
        const slots: TimeSlot[] = dayCfg?.enabled && dayCfg.open && dayCfg.close
          ? generateSlotsFromConfig(state.selectedDate, dayCfg, durationMin, capacity, dbSlots, periods, capacityByHour)
          : dbSlots.map(s => ({ ...s, capacity: s.capacity > 0 ? s.capacity : capacity }))
        dispatch({ type: 'SET_SLOTS', slots, loading: false })
      })
      .catch(() => { if (!cancelled) dispatch({ type: 'SET_SLOTS', slots: [], loading: false }) })
    return () => { cancelled = true }
  }, [state.selectedDate, tenant, tenantLoading, multi]) // eslint-disable-line react-hooks/exhaustive-deps

  const wh       = tenant?.working_hours as unknown as WorkingHoursConfig | null
  const periods: PeriodConfig = {
    morning:   { ...(wh?.periods?.morning   ?? DEFAULT_PERIODS.morning)   },
    afternoon: { ...(wh?.periods?.afternoon ?? DEFAULT_PERIODS.afternoon) },
    evening:   { ...(wh?.periods?.evening   ?? DEFAULT_PERIODS.evening)   },
  }
  const advanceDays        = tenant?.advance_booking_days ?? 14
  const cutoff             = tenant?.same_day_cutoff_time ?? null
  const isTodayPastCutoff  = (() => {
    if (!cutoff) return false
    const now = new Date(); const [ch, cm] = cutoff.split(':').map(Number)
    return now.getHours() * 60 + now.getMinutes() >= ch * 60 + cm
  })()
  const dates = calendarDays(advanceDays)

  // ── Single-slot UI ────────────────────────────────────────────────────────
  if (!multi) {
    const selectSlot = (slot: TimeSlot) => {
      if (state.selectedSlotId === slot.id) {
        dispatch({ type: 'DESELECT_SLOT' })
        return
      }
      dispatch({ type: 'SELECT_SLOT', slotId: slot.id, label: `${slot.startTime} – ${slot.endTime}` })
      setTimeout(() => {
        dispatch({ type: 'SET', field: 'step', value: (state.step + 1) as any })
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 300)
    }
    const slotGroups   = groupSlotsByPeriods(state.slots, periods)
    const isLoading    = state.slotsLoading || tenantLoading

    const [activePeriod, setActivePeriod] = useState<string>(() => slotGroups[0]?.key ?? 'morning')
    useEffect(() => {
      setActivePeriod(slotGroups[0]?.key ?? 'morning')
    }, [state.selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

    const activeGroup = slotGroups.find(g => g.key === activePeriod) ?? slotGroups[0]

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={datetimeImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Pick Date &amp; Time</h2>
            <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Select a date and time slot and please ensure your vehicle arrives within the chosen window to avoid delays.</p>
          </div>
        </div>
        <DateStrip dates={dates} selectedDate={state.selectedDate} wh={wh} cutoff={cutoff} isTodayPastCutoff={isTodayPastCutoff}
          onSelect={iso => dispatch({ type: 'SELECT_DATE', date: iso })} />
        {isLoading && <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontSize: 15 }}>Loading slots…</div>}
        {!isLoading && state.slots.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8, padding: '48px 0', color: '#9CA3AF' }}>
            <Icon name={ICONS.calendar} size={32} style={{ opacity: 0.35 }} />
            <p style={{ fontSize: 15 }}>No slots available for this date.</p>
          </div>
        )}
        {!isLoading && slotGroups.length > 0 && (
          <>
            <PeriodTabs groups={slotGroups} active={activePeriod} onChange={setActivePeriod} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePeriod}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeGroup
                  ? <SlotGrid slots={activeGroup.slots} selectedId={state.selectedSlotId} onSelect={selectSlot} />
                  : <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 15, padding: '24px 0' }}>No slots available for this period — try another.</p>
                }
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    )
  }

  // ── Multi-slot UI ──────────────────────────────────────────────────────────
  const [applyAll, setApplyAll] = useState(false)

  const toggleApplyAll = (newVal: boolean) => {
    setApplyAll(newVal)
    if (!newVal) return
    const anySelected = state.slotConfigs.some(c => !!c.selectedSlotId)
    if (anySelected) {
      toast(`Same slot applied to all ${state.slotCount} bookings`, 'success')
    } else {
      toast("Select a slot — it'll apply to all bookings automatically", 'info')
    }
  }

  const dispatchSlotDetail = (slotIndex: number, field: string, value: any) =>
    dispatch({ type: 'SET_SLOT_DETAIL', slotIndex, field, value })

  const handleSlotSelect = (slotIndex: number, slot: TimeSlot) => {
    const label = `${slot.startTime} – ${slot.endTime}`
    const currentCfg = state.slotConfigs.find(c => c.index === slotIndex)
    const isSelected = applyAll
      ? state.slotConfigs[0]?.selectedSlotId === slot.id
      : currentCfg?.selectedSlotId === slot.id

    if (isSelected) {
      // Deselect
      if (applyAll) {
        for (const cfg of state.slotConfigs) {
          dispatchSlotDetail(cfg.index, 'selectedSlotId',    null)
          dispatchSlotDetail(cfg.index, 'selectedSlotLabel', '')
        }
      } else {
        dispatchSlotDetail(slotIndex, 'selectedSlotId',    null)
        dispatchSlotDetail(slotIndex, 'selectedSlotLabel', '')
      }
      dispatch({ type: 'DESELECT_SLOT' })
      return
    }

    if (applyAll) {
      for (const cfg of state.slotConfigs) {
        dispatchSlotDetail(cfg.index, 'selectedSlotId',    slot.id)
        dispatchSlotDetail(cfg.index, 'selectedSlotLabel', label)
      }
      toast(`Same slot applied to all ${state.slotCount} bookings`, 'success')
    } else {
      dispatchSlotDetail(slotIndex, 'selectedSlotId',    slot.id)
      dispatchSlotDetail(slotIndex, 'selectedSlotLabel', label)
    }
    // Start the hold timer (works for both single and multi-slot)
    dispatch({ type: 'SELECT_SLOT', slotId: slot.id, label })
    // Auto-advance to next tab
    setActiveSlot(a => Math.min(a + 1, state.slotConfigs.length - 1))
    // If all slots are now filled, advance to the next wizard step
    const allFilled = applyAll || state.slotConfigs.every(c =>
      c.index === slotIndex ? true : c.selectedSlotId !== null
    )
    if (allFilled) {
      setTimeout(() => {
        dispatch({ type: 'SET', field: 'step', value: (state.step + 1) as any })
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 300)
    }
  }

  const handleDateSelect = (slotIndex: number, iso: string) => {
    if (applyAll) {
      for (const cfg of state.slotConfigs) {
        dispatchSlotDetail(cfg.index, 'selectedDate',      iso)
        dispatchSlotDetail(cfg.index, 'selectedSlotId',    null)
        dispatchSlotDetail(cfg.index, 'selectedSlotLabel', '')
      }
    } else {
      dispatchSlotDetail(slotIndex, 'selectedDate',      iso)
      dispatchSlotDetail(slotIndex, 'selectedSlotId',    null)
      dispatchSlotDetail(slotIndex, 'selectedSlotLabel', '')
    }
  }

  const activeCfg4 = state.slotConfigs[activeSlot]

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={datetimeImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Pick Date &amp; Time</h2>
            <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Select a date and time slot for each booking.</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <button
            type="button"
            onClick={() => toggleApplyAll(!applyAll)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 12px', borderRadius: 'var(--r-full)',
              background: applyAll ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.06)',
              border: `1.5px solid ${applyAll ? 'rgba(var(--brand-rgb),0.30)' : 'rgba(0,0,0,0.12)'}`,
              cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
            }}
          >
            <span style={{
              position: 'relative', width: 28, height: 16, borderRadius: 'var(--r-full)',
              background: applyAll ? 'var(--brand-color, #FC6514)' : '#D1D5DB',
              display: 'inline-block', flexShrink: 0, transition: 'background 0.15s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: applyAll ? 14 : 2,
                width: 12, height: 12, borderRadius: 'var(--r-full)',
                background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.18)', transition: 'left 0.15s',
              }} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: applyAll ? 'var(--brand-color, #FC6514)' : '#6B7280', whiteSpace: 'nowrap' }}>
              Apply to all bookings
            </span>
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {applyAll
              ? `Same time slot for all ${state.slotCount} bookings`
              : `Use the same time slot for all ${state.slotCount} bookings`}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'linear-gradient(180deg, #ECEBEA 0%, #F5F4F3 100%)', borderRadius: 'var(--r-md)', padding: 5, boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.7)', overflowX: 'auto' }}>
        {state.slotConfigs.map((cfg, i) => {
          const done   = !!cfg.selectedSlotId
          const active = activeSlot === i
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => setActiveSlot(i)}
              whileTap={{ scale: 0.97 }}
              style={{
                position: 'relative', padding: '9px 18px', fontSize: 15,
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--brand-color, #FC6514)' : '#6B7280',
                background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
                cursor: 'pointer', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                transition: 'color 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              {active && (
                <motion.span
                  layoutId="slot4-tab-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 'var(--r-sm)', zIndex: 0, background: 'linear-gradient(160deg, #FFFFFF 0%, #FAFAF9 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.10), inset 0 1.5px 0 rgba(255,255,255,0.9)' }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {done && (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                Slot {i + 1}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Copy from the previous slot — quick fill for repetitive multi-slot bookings */}
      {!applyAll && activeSlot > 0 && state.slotConfigs[activeSlot - 1]?.selectedSlotId && (
        <button
          type="button"
          onClick={() => {
            const prev = state.slotConfigs[activeSlot - 1]
            dispatchSlotDetail(activeCfg4.index, 'selectedDate',      prev.selectedDate)
            dispatchSlotDetail(activeCfg4.index, 'selectedSlotId',    prev.selectedSlotId)
            dispatchSlotDetail(activeCfg4.index, 'selectedSlotLabel', prev.selectedSlotLabel)
            dispatch({ type: 'SELECT_SLOT', slotId: prev.selectedSlotId as string, label: prev.selectedSlotLabel })
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.06)',
            border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 999, padding: '6px 14px',
            marginBottom: 16, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3 10.5V3.5C3 2.9 3.4 2.5 4 2.5H10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Copy from Slot {activeSlot} · {state.slotConfigs[activeSlot - 1].selectedSlotLabel}
        </button>
      )}

      {/* Active slot picker */}
      <style>{`@keyframes slideInFromRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
      {activeCfg4 && (
        <div key={activeSlot} style={{ animation: 'slideInFromRight 0.22s ease forwards' }}>
        <SlotPickerForSlot
          slotIndex={activeCfg4.index}
          tenant={tenant}
          tenantLoading={tenantLoading}
          dates={dates}
          wh={wh}
          cutoff={cutoff}
          isTodayPastCutoff={isTodayPastCutoff}
          periods={periods}
          onDateSelect={iso => handleDateSelect(activeCfg4.index, iso)}
          onSlotSelect={slot => handleSlotSelect(activeCfg4.index, slot)}
        />
        </div>
      )}
    </div>
  )
}

// ─── Per-slot date/time picker ─────────────────────────────────────────────────
function SlotPickerForSlot({ slotIndex, tenant, tenantLoading, dates, wh, cutoff, isTodayPastCutoff, periods, onDateSelect, onSlotSelect }: {
  slotIndex:           number
  tenant:              TenantRow | null
  tenantLoading:       boolean
  dates:               ReturnType<typeof calendarDays>
  wh:                  WorkingHoursConfig | null
  cutoff:              string | null
  isTodayPastCutoff:   boolean
  periods:             PeriodConfig
  onDateSelect:        (iso: string) => void
  onSlotSelect:        (slot: TimeSlot) => void
}) {
  const { state } = useWizard()
  const cfg = state.slotConfigs.find(c => c.index === slotIndex)!

  const [slots,   setSlots]   = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)

  const cancelRef = useRef<boolean>(false)

  useEffect(() => {
    if (!cfg.selectedDate || tenantLoading) return
    cancelRef.current = false
    setLoading(true)
    setSlots([])
    const dayKey = getDayKey(cfg.selectedDate)
    const dayCfg = wh?.[dayKey]
    const durationMin      = tenant?.slot_duration_min     ?? 60
    const capacityByHour   = (tenant as any)?.slot_capacity_by_hour as Record<string, number> | undefined
    const capacityByCombo  = (tenant as any)?.slot_capacity_by_combo as Record<string, number> | undefined
    const comboKey         = `${cfg.serviceType ?? 'pickup'}-${cfg.loadType ?? 'lcl'}`
    const capacity         = capacityByCombo?.[comboKey] ?? tenant?.max_bookings_per_slot ?? 10
    if (dayCfg && !dayCfg.enabled) { setLoading(false); return }
    getSlotsByDate(cfg.selectedDate)
      .then(dbSlots => {
        if (cancelRef.current) return
        const generated: TimeSlot[] = dayCfg?.enabled && dayCfg.open && dayCfg.close
          ? generateSlotsFromConfig(cfg.selectedDate, dayCfg, durationMin, capacity, dbSlots, periods, capacityByHour)
          : dbSlots.map(s => ({ ...s, capacity: s.capacity > 0 ? s.capacity : capacity }))
        setSlots(generated)
      })
      .catch(() => {})
      .finally(() => { if (!cancelRef.current) setLoading(false) })
    return () => { cancelRef.current = true }
  }, [cfg.selectedDate, tenant, tenantLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Adjust confirmed count for slots already chosen by other wizard tabs.
  // Each other tab that picked the same slot consumes 1 spot — don't mark full unless capacity is actually exhausted.
  const takenByOthersCount = new Map<string, number>()
  for (const c of state.slotConfigs) {
    if (c.index !== slotIndex && c.selectedSlotId) {
      takenByOthersCount.set(c.selectedSlotId, (takenByOthersCount.get(c.selectedSlotId) ?? 0) + 1)
    }
  }
  const displaySlots = slots.map(s => {
    const extra = takenByOthersCount.get(s.id) ?? 0
    if (extra === 0) return s
    const adjustedConfirmed = s.confirmed + extra
    const newBusyness: TimeSlot['busyness'] = adjustedConfirmed >= s.capacity
      ? 'full'
      : adjustedConfirmed / s.capacity >= 0.6 ? 'busy' : 'available'
    return { ...s, confirmed: adjustedConfirmed, busyness: newBusyness }
  })

  const slotGroups = groupSlotsByPeriods(displaySlots, periods)

  const [activePeriod, setActivePeriod] = useState<string>(() => slotGroups[0]?.key ?? 'morning')
  useEffect(() => {
    setActivePeriod(slotGroups[0]?.key ?? 'morning')
  }, [cfg.selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeGroup = slotGroups.find(g => g.key === activePeriod) ?? slotGroups[0]

  return (
    <div>
      <DateStrip dates={dates} selectedDate={cfg.selectedDate} wh={wh} cutoff={cutoff} isTodayPastCutoff={isTodayPastCutoff} onSelect={onDateSelect} />
      {loading && <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 15 }}>Loading slots…</div>}
      {!loading && displaySlots.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 0', color: '#9CA3AF' }}>
          <Icon name={ICONS.calendar} size={24} style={{ opacity: 0.35 }} />
          <p style={{ fontSize: 15 }}>No slots available for this date.</p>
        </div>
      )}
      {!loading && slotGroups.length > 0 && (
        <>
          <PeriodTabs groups={slotGroups} active={activePeriod} onChange={setActivePeriod} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activePeriod}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeGroup
                ? <SlotGrid slots={activeGroup.slots} selectedId={cfg.selectedSlotId} onSelect={onSlotSelect} />
                : <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 15, padding: '24px 0' }}>No slots available for this period — try another.</p>
              }
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// ─── Date strip (extracted for reuse) ────────────────────────────────────────
function DateStrip({ dates, selectedDate, wh, cutoff, isTodayPastCutoff, onSelect }: {
  dates: ReturnType<typeof calendarDays>
  selectedDate: string
  wh: WorkingHoursConfig | null
  cutoff: string | null
  isTodayPastCutoff: boolean
  onSelect: (iso: string) => void
}) {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'clip', marginBottom: 28 }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', paddingTop: 12, paddingBottom: 8, paddingRight: 12 }}>
      {dates.map(d => {
        const sel            = selectedDate === d.iso
        const dayCfg         = wh?.[d.dayKey]
        const closedDay      = dayCfg ? !dayCfg.enabled : false
        const cutoffDisabled = d.isToday && isTodayPastCutoff
        const disabled       = closedDay || cutoffDisabled
        const shortDay       = d.dayFull.slice(0, 3).toUpperCase()
        return (
          <button key={d.iso} type="button"
            className={`wiz-tile${sel ? ' selected' : ''}`}
            onClick={() => {
              if (cutoffDisabled) toast(`Same-day booking unavailable after ${cutoff}`, 'info')
              else if (closedDay) toast(`${d.dayFull} is not a working day — no slots available.`, 'info')
              else onSelect(d.iso)
            }}
            style={{
              position: 'relative', flex: '0 0 64px', width: 64,
              padding: '10px 0', textAlign: 'center',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.38 : 1,
              boxSizing: 'border-box',
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: sel ? 'var(--brand-color)' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              {shortDay}
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color: sel ? 'var(--brand-color)' : '#1C1917', lineHeight: 1, fontFamily: 'inherit' }}>
              {d.num}
            </p>
            {d.isToday && !cutoffDisabled && (
              <div style={{ width: 4, height: 4, borderRadius: 'var(--r-full)', background: 'var(--brand-color)', margin: '6px auto 0' }} />
            )}
            {d.isToday && cutoffDisabled && cutoff && (
              <p style={{ fontSize: 9, color: '#EF4444', lineHeight: 1.2, margin: '4px 0 0' }}>After {cutoff}</p>
            )}
            {sel && (
              <div style={{ position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: 'var(--r-full)', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 800, lineHeight: 1 }}>✓</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
    </div>
  )
}

// ─── Period tab bar ───────────────────────────────────────────────────────────
function PeriodTabs({ groups, active, onChange }: {
  groups: { key: string; period: { label: string } }[]
  active: string
  onChange: (key: string) => void
}) {
  if (groups.length === 1) {
    return (
      <div style={{ marginBottom: 16 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 700, color: 'var(--brand-color)',
          background: 'rgba(var(--brand-rgb),0.08)',
          border: '1px solid rgba(var(--brand-rgb),0.18)',
          borderRadius: 'var(--r-xl)', padding: '4px 12px',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {groups[0].period.label.replace(' Slots', '')}
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'linear-gradient(180deg, #ECEBEA 0%, #F5F4F3 100%)', borderRadius: 'var(--r-md)', padding: 5, boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.7)' }}>
      {groups.map(({ key, period }) => {
        const sel = key === active
        return (
          <motion.button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            whileTap={{ scale: 0.97 }}
            style={{
              position: 'relative', flex: 1, padding: '9px 12px', borderRadius: 'var(--r-sm)', border: 'none', fontFamily: 'inherit',
              fontSize: 15, fontWeight: sel ? 700 : 500, cursor: 'pointer',
              background: 'transparent',
              color: sel ? 'var(--brand-color)' : '#6B7280',
              transition: 'color 0.2s ease',
            }}
          >
            {sel && (
              <motion.span
                layoutId="period-tab-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 'var(--r-sm)', zIndex: 0,
                  background: 'linear-gradient(160deg, #FFFFFF 0%, #FAFAF9 100%)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.10), inset 0 1.5px 0 rgba(255,255,255,0.9)',
                }}
              />
            )}
            <span style={{ position: 'relative', zIndex: 1 }}>{period.label.replace(' Slots', '')}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Flat slot grid (no section header) ──────────────────────────────────────
function SlotGrid({ slots, selectedId, onSelect }: {
  slots: TimeSlot[]; selectedId: string | null; onSelect: (s: TimeSlot) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 8 }}>
      {slots.map(slot => {
        const full      = slot.busyness === 'full' || slot.busyness === 'closed'
        const selected  = slot.id === selectedId
        const available = Math.max(0, slot.capacity - slot.confirmed - slot.held)
        return (
          <button
            key={slot.id}
            type="button"
            disabled={full}
            className={`wiz-tile${selected ? ' selected' : ''}`}
            onClick={() => !full && onSelect(slot)}
            style={{
              width: '100%', position: 'relative', display: 'flex', flexDirection: 'column',
              padding: '14px 18px', textAlign: 'left',
              boxSizing: 'border-box', fontFamily: 'inherit',
              background: full ? '#FAFAFA' : undefined,
              cursor: full ? 'not-allowed' : 'pointer',
              opacity: full ? 0.5 : 1,
              boxShadow: full ? 'none' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: full ? '#9CA3AF' : '#1C1917' }}>
                {slot.startTime}
              </span>
              {selected && (
                <div style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              {full && !selected && <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Full</span>}
            </div>
            <span style={{ fontSize: 12, color: full ? '#EF4444' : available <= 2 ? '#EF4444' : '#6B7280', fontWeight: 500 }}>
              {full ? 'No spots available' : `${available} spot${available !== 1 ? 's' : ''} left`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SlotGroup({ label, slots, selectedId, onSelect }: {
  label: string; icon?: string; slots: TimeSlot[]; selectedId: string | null; onSelect: (s: TimeSlot) => void
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section header — clean label + thin divider, no icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#9CA3AF', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {slots.map(slot => {
          const full      = slot.busyness === 'full' || slot.busyness === 'closed'
          const selected  = slot.id === selectedId
          const available = Math.max(0, slot.capacity - slot.confirmed - slot.held)

          return (
            <button
              key={slot.id}
              type="button"
              disabled={full}
              onClick={() => !full && onSelect(slot)}
              style={{
                width: '100%', position: 'relative', display: 'flex', flexDirection: 'column',
                padding: '14px 18px', borderRadius: 'var(--r-lg)', textAlign: 'left',
                transition: 'all 0.15s ease', boxSizing: 'border-box', fontFamily: 'inherit',
                border: selected ? '2px solid var(--brand-color)' : '1.5px solid rgba(0,0,0,0.08)',
                background: full ? '#FAFAFA' : selected ? 'rgba(var(--brand-rgb),0.03)' : '#fff',
                cursor: full ? 'not-allowed' : 'pointer',
                opacity: full ? 0.5 : 1,
              }}
            >
              {/* Time + check/full indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: full ? '#9CA3AF' : '#1C1917' }}>
                  {slot.startTime}
                </span>
                {selected && (
                  <div style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                {full && !selected && <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Full</span>}
              </div>
              {/* Spots label */}
              <span style={{ fontSize: 12, color: full ? '#EF4444' : available <= 2 ? '#EF4444' : '#6B7280', fontWeight: 500 }}>
                {full ? 'No spots available' : `${available} spot${available !== 1 ? 's' : ''} left`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
