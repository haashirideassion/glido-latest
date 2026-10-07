import { useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { cfs, fmtNum, type CfsShipment, type ContainerDetail, type FieldComparison } from '@/lib/cfs'
import { Btn, CARD, Chip, FIELD_STATUS_STYLE, MatchBadge, SectionTitle } from './ui'

const show = (v: string | number | null, type: 'text' | 'number') =>
  v === null || v === undefined || v === '' ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : type === 'number' ? fmtNum(v) : String(v)

const PAIR_LABEL = { paired: null, manifest_only: 'On manifest only', ics_only: 'In ICS only' } as const

/**
 * Import (Unpacking) stage 1: compare manifest against ICS shipment by shipment, resolve
 * differences field by field, then confirm. Confirm Manifest itself lives in the parent's
 * action bar so it stays visible while scrolling this long list.
 */
export default function ReconcilePanel({ detail, editable, onChanged }: {
  detail: ContainerDetail; editable: boolean; onChanged: () => Promise<void>
}) {
  const { container, shipments, match, settings } = detail
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (s: CfsShipment) => open[s.id] ?? (s.comparison ? !s.comparison.resolved || s.comparison.needsInclusionDecision : false)

  const run = async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key)
    try { await fn(); if (okMsg) toast(okMsg, 'success'); await onChanged() }
    catch (e: any) { toast(e.message || 'Something went wrong', 'error') }
    finally { setBusy(null) }
  }

  const pct = match.overall_pct
  const belowMin = pct !== null && pct < Number(settings.min_match_pct)

  return (
    <div style={CARD}>
      <SectionTitle action={editable ? (
        <Btn small loading={busy === 'refresh'} onClick={() => run('refresh', () => cfs.refreshManifest(container.id), 'Manifest and ICS data refreshed')}>
          <Icon name={ICONS.refresh} size={16} /> Refresh from sources
        </Btn>) : undefined}>
        Manifest vs ICS
      </SectionTitle>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <MatchBadge pct={pct} />
        {match.unresolved > 0
          ? <Chip tone="amber">{match.unresolved} difference{match.unresolved === 1 ? '' : 's'} to resolve</Chip>
          : <Chip tone="green">Nothing left to resolve</Chip>}
        {belowMin && <Chip tone="red" title="Overall match is under the minimum in Settings">Below the {settings.min_match_pct}% minimum</Chip>}
        {editable && match.unresolved > 0 && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn small loading={busy === 'all-manifest'} onClick={() => run('all-manifest', () => cfs.resolveAll(container.id, 'manifest'), 'Used the manifest for every difference')}>Use manifest for all</Btn>
            <Btn small loading={busy === 'all-ics'} onClick={() => run('all-ics', () => cfs.resolveAll(container.id, 'ics'), 'Used ICS for every difference')}>Use ICS for all</Btn>
          </span>
        )}
      </div>

      {shipments.length === 0 && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>No shipments were found on the manifest or in ICS for this container.</p>}

      <div style={{ display: 'grid', gap: 10 }}>
        {shipments.map(s => {
          const cmp = s.comparison
          if (!cmp) return null
          const expanded = isOpen(s)
          const pairLabel = PAIR_LABEL[cmp.pairState]
          const excluded = cmp.inclusion === 'exclude'
          return (
            <div key={s.id} style={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', overflow: 'hidden', opacity: excluded ? 0.7 : 1 }}>
              <button type="button" onClick={() => setOpen(o => ({ ...o, [s.id]: !expanded }))} aria-expanded={expanded}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: '#FAFAF9', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexWrap: 'wrap' }}>
                <Icon name={expanded ? ICONS.arrowDown : ICONS.arrowRight} size={16} style={{ color: '#78716C' }} />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#1C1917' }}>{s.house_bill_number}</span>
                {pairLabel && <Chip tone="amber">{pairLabel}</Chip>}
                {excluded && <Chip tone="neutral">Excluded</Chip>}
                {cmp.needsInclusionDecision && !cmp.inclusion && <Chip tone="red">Include or exclude?</Chip>}
                {cmp.unresolvedCount > 0 && <Chip tone="red">{cmp.unresolvedCount} to resolve</Chip>}
                <span style={{ marginLeft: 'auto' }}><MatchBadge pct={cmp.matchPct} /></span>
              </button>

              {expanded && (
                <div style={{ padding: 12 }}>
                  {cmp.needsInclusionDecision && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 10, marginBottom: 10, borderRadius: 'var(--r-sm)', background: 'rgba(245,158,11,0.10)', fontSize: 13 }}>
                      <span style={{ flex: 1, minWidth: 200 }}>
                        This house bill is {cmp.pairState === 'manifest_only' ? 'on the manifest but not in ICS' : 'in ICS but not on the manifest'}. Decide whether it belongs to this container.
                      </span>
                      {editable && (
                        <>
                          <Btn small variant={cmp.inclusion === 'include' ? 'primary' : 'secondary'} loading={busy === `inc-${s.id}`} onClick={() => run(`inc-${s.id}`, () => cfs.resolve(s.id, '_include', 'include'))}>Include</Btn>
                          <Btn small variant={cmp.inclusion === 'exclude' ? 'danger' : 'secondary'} loading={busy === `exc-${s.id}`} onClick={() => run(`exc-${s.id}`, () => cfs.resolve(s.id, '_include', 'exclude'))}>Exclude</Btn>
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                      <thead>
                        <tr>{['Field', 'Manifest', 'ICS', 'Result', ''].map((h, i) => (
                          <th key={i} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: 'var(--text-tertiary)', letterSpacing: '0.04em', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{h}</th>))}</tr>
                      </thead>
                      <tbody>
                        {cmp.fields.map((f: FieldComparison) => {
                          const st = FIELD_STATUS_STYLE[f.status]
                          return (
                            <tr key={f.key} style={{ background: f.needsResolution ? 'rgba(239,68,68,0.04)' : undefined }}>
                              <td style={{ padding: '7px 8px', fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{f.label}</td>
                              <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', fontWeight: f.chosen === 'manifest' ? 800 : 400 }}>{show(f.manifest, f.type)}</td>
                              <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', fontWeight: f.chosen === 'ics' ? 800 : 400 }}>{show(f.ics, f.type)}</td>
                              <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>{st.label}</span>
                                {f.chosen && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}>using {f.chosen === 'ics' ? 'ICS' : 'manifest'}</span>}
                              </td>
                              <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                {editable && (f.status === 'mismatch' || f.status === 'missing' || f.chosen) && (
                                  <span style={{ display: 'inline-flex', gap: 6 }}>
                                    <Btn small variant={f.chosen === 'manifest' ? 'primary' : 'secondary'} disabled={f.manifest === null || f.manifest === ''}
                                      loading={busy === `${s.id}-${f.key}-manifest`} onClick={() => run(`${s.id}-${f.key}-manifest`, () => cfs.resolve(s.id, f.key, 'manifest'))}>Manifest</Btn>
                                    <Btn small variant={f.chosen === 'ics' ? 'primary' : 'secondary'} disabled={f.ics === null || f.ics === ''}
                                      loading={busy === `${s.id}-${f.key}-ics`} onClick={() => run(`${s.id}-${f.key}-ics`, () => cfs.resolve(s.id, f.key, 'ics'))}>ICS</Btn>
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
