import { compareField, compareShipment, similarity, resolvedFieldValue, overallMatchPct } from '../src/lib/puCompare'
let f = 0
const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(x))); if (!c) f++ }
ok('8.9 vs 8.88 cbm is a near match at 1% tolerance', compareField('number', 8.9, 8.88, 1).status === 'near')
ok('8.9 vs 8.88 is a mismatch at 0% tolerance', compareField('number', 8.9, 8.88, 0).status === 'mismatch')
ok('identical numbers match', compareField('number', 10, '10', 1).status === 'match')
ok('50 vs 54 packages mismatch', compareField('number', 50, 54, 1).status === 'mismatch')
ok('zero vs zero matches', compareField('number', 0, 0, 1).status === 'match')
ok('missing on one side', compareField('text', 'Acme', '', 1).status === 'missing')
ok('both empty is a match', compareField('text', null, '  ', 1).status === 'match')
ok('punctuation/case-only text difference is a match', compareField('text', 'Acme Pty Ltd', 'ACME PTY. LTD.', 1).status === 'match')
ok('different text mismatches with partial score', (() => { const r = compareField('text', 'Acme Pty Ltd', 'Acme Trading', 1); return r.status === 'mismatch' && r.score > 0 && r.score < 1 })())
ok('similarity basics', similarity('abc', 'abc') === 1 && similarity('abc', 'xyz') === 0 && similarity('', 'a') === 0)
const m: any = { house_bill_number: 'H1', weight_kg: 100, volume_cbm: 8.9, package_count: 10, consignee: 'A', consignor: 'B', goods_description: 'G', job_reference: 'J', marks_numbers: 'M', handling_instructions: '' }
const i: any = { ...m, volume_cbm: 8.88, package_count: 12 }
const c = compareShipment(m, i, {}, 1)
ok('paired: near volume needs no resolution, package mismatch does', c.fields.find(x => x.key === 'volume_cbm')!.status === 'near' && !c.fields.find(x => x.key === 'volume_cbm')!.needsResolution && c.fields.find(x => x.key === 'package_count')!.needsResolution && c.unresolvedCount === 1 && !c.resolved)
ok('% match is high but below 100', c.matchPct > 95 && c.matchPct < 100, c.matchPct)
const c2 = compareShipment(m, i, { package_count: 'ics' }, 1)
ok('choosing a source resolves it', c2.resolved && c2.unresolvedCount === 0)
ok('resolved value follows choice', resolvedFieldValue(m, i, 'package_count', { package_count: 'ics' }) === 12 && resolvedFieldValue(m, i, 'package_count', { package_count: 'manifest' }) === 10 && resolvedFieldValue(m, i, 'package_count', {}) === 10)
ok('default never discards a value the other side has', resolvedFieldValue({ ...m, consignee: '' }, i, 'consignee', {}) === 'A')
const c3 = compareShipment(m, null, {}, 1)
ok('manifest-only shipment needs include/exclude, 0%', c3.pairState === 'manifest_only' && c3.needsInclusionDecision && c3.unresolvedCount === 1 && c3.matchPct === 0)
ok('include decision resolves unpaired', compareShipment(null, i, { _include: 'include' }, 1).resolved)
ok('perfect match is 100% and fully resolved', (() => { const p = compareShipment(m, { ...m }, {}, 1); return p.matchPct === 100 && p.resolved })())
ok('overall pct averages shipments', overallMatchPct([c, c3]) === Math.round(((c.matchPct + 0) / 2) * 10) / 10 && overallMatchPct([]) === null)
console.log(f ? `\n${f} FAILED` : '\nALL PASSED'); process.exit(f ? 1 : 0)
