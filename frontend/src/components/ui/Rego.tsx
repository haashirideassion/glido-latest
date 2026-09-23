/**
 * The registration plate that travels with a driver.
 *
 * A driver is identified at a depot gate by the plate they arrive on, so wherever a driver's name
 * appears the rego appears beside it. Monospaced and boxed so a plate reads as a plate rather than
 * as more of the name — it is scanned against a physical vehicle, not read as prose.
 *
 * Note this is the vehicle's registration, not the driver's. On the Planner/Allocator side it
 * comes from `trucks.vehicle_registration`, mirrored onto a trip when the truck is allocated;
 * `trucks.resource_code` (TRK-004) is an internal asset reference and is NOT a plate. On the
 * Reception side it comes from `bookings.vehicle_registration` / `saved_drivers.vehicle_registration`.
 */
export function Rego({ value, title = 'Vehicle registration' }: { value?: string | null; title?: string }) {
  if (!value) return null
  return (
    <span title={title}
      style={{
        flexShrink: 0, fontSize: 11.5, fontWeight: 700,
        fontFamily: 'ui-monospace,monospace', letterSpacing: '0.02em',
        color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.05)',
        border: '1px solid rgba(0,0,0,0.07)', padding: '1px 6px',
        borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
      }}>
      {value}
    </span>
  )
}
