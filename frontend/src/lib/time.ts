/**
 * Australian freight / logistics time helpers.
 *
 * Timezone : Australia/Sydney  (AEST UTC+10 / AEDT UTC+11, DST-aware)
 * Clock    : 24-hour  —  e.g. 13:26, 07:04:59
 * Standard : used across all CFS operations in NSW
 */

export const TZ = 'Australia/Sydney'

/** "13:26" */
export function fmtTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: TZ,
  })
}

/** "13:26:03" */
export function fmtTimeSec(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour:     '2-digit',
    minute:   '2-digit',
    second:   '2-digit',
    hour12:   false,
    timeZone: TZ,
  })
}

/** "05/06/2026" */
export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day:      '2-digit',
    month:    '2-digit',
    year:     'numeric',
    timeZone: TZ,
  })
}

/** "05/06/2026 13:26" */
export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('en-AU', {
    day:      '2-digit',
    month:    '2-digit',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: TZ,
  })
}

/** "05/06" */
export function fmtDateShort(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day:      '2-digit',
    month:    '2-digit',
    timeZone: TZ,
  })
}

/** Today's date as YYYY-MM-DD in Sydney time */
export function todaySydney(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ }) // sv-SE gives ISO format
}
