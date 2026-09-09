import type { TimeSlot } from '@/data/types'

interface Props {
  slots: TimeSlot[]
  selectedSlotId: string | null
  onSelect: (slot: TimeSlot) => void
}

export function SlotGrid({ slots, selectedSlotId, onSelect }: Props) {
  const morning   = slots.filter(s => parseInt(s.startTime) < 12)
  const afternoon = slots.filter(s => parseInt(s.startTime) >= 12 && parseInt(s.startTime) < 16)
  const evening   = slots.filter(s => parseInt(s.startTime) >= 16)

  if (slots.length === 0) return (
    <p style={{ fontSize: 15, color: 'var(--text-tertiary)', padding: '16px 0', textAlign: 'center' }}>No slots available for this date.</p>
  )

  const groups = [{ label: 'Morning', group: morning }, { label: 'Afternoon', group: afternoon }, { label: 'Evening', group: evening }]
    .filter(g => g.group.length > 0)
  const showLabels = groups.length > 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups
        .map(({ label, group }) => (
          <div key={label}>
            {showLabels && <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
              {group.map(slot => {
                const full     = slot.busyness === 'full'
                const busy     = slot.busyness === 'busy'
                const selected = slot.id === selectedSlotId
                const fill     = slot.capacity > 0 ? Math.round((slot.confirmed / slot.capacity) * 100) : 0
                const fillColor = full ? '#EF4444' : busy ? '#F59E0B' : '#22C55E'
                const left      = slot.capacity - slot.confirmed

                return (
                  <button
                    key={slot.id}
                    disabled={full}
                    onClick={() => !full && onSelect(slot)}
                    style={{
                      padding: '12px 10px', borderRadius: 'var(--r-md)', textAlign: 'left',
                      border: `2px solid ${selected ? 'var(--brand-color)' : full ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.09)'}`,
                      background: selected ? 'rgba(var(--brand-rgb),0.06)' : full ? '#F7F6F5' : '#fff',
                      cursor: full ? 'not-allowed' : 'pointer',
                      opacity: full ? 0.55 : 1,
                      boxShadow: selected ? '0 0 0 3px rgba(var(--brand-rgb),0.15)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Availability dot */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: selected ? 'var(--brand-color)' : '#1C1917', fontVariantNumeric: 'tabular-nums' }}>
                        {slot.startTime}
                      </span>
                      {selected && <div style={{ width: 7, height: 7, borderRadius: 'var(--r-full)', background: 'var(--brand-color)' }} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>{slot.startTime}–{slot.endTime}</div>

                    {/* Fill bar */}
                    <div style={{ height: 3, borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${fill}%`, background: fillColor, borderRadius: 'var(--r-full)', transition: 'width 0.3s ease' }} />
                    </div>

                    <span style={{ fontSize: 13, fontWeight: 600, color: full ? '#EF4444' : fill >= 75 ? '#D97706' : '#16A34A' }}>
                      {full ? 'Full' : `${left} left`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, paddingTop: 4 }}>
        {[['#22C55E', 'Open'], ['#F59E0B', 'Filling up'], ['#EF4444', 'Full']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 'var(--r-full)', background: c }} />
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
