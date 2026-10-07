/**
 * Packing & Unpacking — API integration tests (real Postgres).
 *
 *   TEST_DATABASE_URL=postgresql://user@localhost:5432/glido_test npx tsx tests/packing-unpacking.integration.ts
 *
 * Needs a scratch database with migrations applied (incl. 019). It TRUNCATES the pu_* tables,
 * so it refuses to run unless the database name contains "test".
 */
import './_testEnv'
import express from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '../src/db'
const router = require('../src/routes/packing-unpacking').default

const T = 'a0000000-0000-0000-0000-000000000001'
let fails = 0
const ok = (name: string, cond: boolean, extra?: unknown) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + JSON.stringify(extra))); if (!cond) fails++ }

async function mkUser(email: string, role: string) {
  const r = await pool.query(`INSERT INTO app_users (email,name,role) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET role=$3 RETURNING id,email,name,role`, [email, email.split('@')[0], role])
  return { user: r.rows[0], token: jwt.sign(r.rows[0], 'testsecret') }
}
const app = express(); app.use(express.json()); app.use('/api/packing-unpacking', router)

const srv = app.listen(0, async () => {
  const base = `http://localhost:${(srv.address() as any).port}/api/packing-unpacking`
  const call = async (tok: string | null, method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const j: any = await r.json().catch(() => ({}))
    return { s: r.status, j, d: j.data, e: j.error }
  }
  try {
    await pool.query(`TRUNCATE pu_activity, pu_results, pu_messages, pu_notes, pu_photos, pu_shipments, pu_containers, pu_requests, pu_counters RESTART IDENTITY CASCADE`)
    const staff = await mkUser('staff@t.com', 'packing')
    const admin = await mkUser('admin@t.com', 'packing')
    const recep = await mkUser('recep@t.com', 'reception_admin')
    const sadmin = await mkUser('sadmin@t.com', 'super_admin')
    const cust = await mkUser('cust@t.com', 'visitor_registered')
    const cust2 = await mkUser('cust2@t.com', 'visitor_registered')

    // ── auth boundaries
    let r = await call(null, 'GET', '/summary?direction=import')
    ok('no token -> 401', r.s === 401, r)
    r = await call(cust.token, 'GET', '/summary?direction=import')
    ok('customer cannot hit staff summary -> 403', r.s === 403, r)
    r = await call(cust.token, 'GET', '/containers?direction=import&stage=new_request')
    ok('customer cannot list containers -> 403', r.s === 403, r)
    // Independent credentials: no other module's login opens this one.
    r = await call(recep.token, 'GET', '/summary?direction=import')
    ok('reception_admin cannot use the module -> 403', r.s === 403, r)
    r = await call(sadmin.token, 'GET', '/summary?direction=import')
    ok('super_admin cannot use the module -> 403', r.s === 403, r)
    r = await call(staff.token, 'GET', '/summary?direction=import')
    ok('packing user can -> 200', r.s === 200, r)

    // ── validation on intake
    r = await call(cust.token, 'POST', '/requests', { direction: 'sideways', containers: [] })
    ok('bad direction -> 400', r.s === 400, r)
    r = await call(cust.token, 'POST', '/requests', { direction: 'import', containers: [{ containerNumber: 'BAD123' }] })
    ok('bad container number -> 400', r.s === 400 && /valid container number/.test(r.e.message), r)
    r = await call(cust.token, 'POST', '/requests', { direction: 'import', containers: [{ containerNumber: 'MSKU1234567' }, { containerNumber: 'msku 1234567' }] })
    ok('duplicate container in one request -> 400', r.s === 400, r)

    // ── customer import request
    r = await call(cust.token, 'POST', '/requests', {
      direction: 'import', notes: 'please be careful', photos: [{ storagePath: '2026-10-05/photos/a.jpg', fileName: 'a.jpg' }],
      containers: [{ containerNumber: 'msku 1234567' }, { containerNumber: 'TCLU7654321' }, { containerNumber: 'CMAU0000003' }, { containerNumber: 'OOLU5555559' }],
    })
    ok('customer import request created (201, I-101, submitted)', r.s === 201 && r.d.request.request_ref === 'I-101' && r.d.request.status === 'submitted' && r.d.containerIds.length === 4, r)
    const impReq = r.d.request; const impIds: string[] = r.d.containerIds
    r = await call(cust.token, 'POST', '/requests', { direction: 'import', containers: [{ containerNumber: 'MSKU1234567' }] })
    ok('second request -> I-102, warns about open duplicate container', r.s === 201 && r.d.request.request_ref === 'I-102' && r.d.warnings.length === 1, r)

    // ── manifest data was fetched + prefilled
    r = await call(staff.token, 'GET', `/containers/${impIds[0]}`)
    ok('detail has shipments with comparison + prefilled header', r.s === 200 && r.d.shipments.length >= 2 && r.d.shipments[0].comparison && r.d.container.vessel && r.d.container.eta, r.d && r.d.container)
    ok('numbers are numbers not strings', typeof r.d.shipments[0].weight_kg === 'number' && typeof r.d.container.net_weight_kg === 'number', r.d.container.net_weight_kg)
    ok('customer photo visible on container', r.d.photos.length === 1, r.d.photos)
    ok('cannot confirm before acceptance', r.d.match.can_confirm === false)

    // ── acceptance flow
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/confirm-manifest`)
    ok('confirm before accept -> 409', r.s === 409, r)
    r = await call(staff.token, 'GET', '/summary?direction=import')
    ok('summary: 5 awaiting acceptance', r.d.new_request.awaiting_acceptance === 5 && r.d.new_request.accepted === 0, r.d)
    r = await call(staff.token, 'POST', `/requests/${impReq.id}/decline`, {})
    ok('decline needs reason -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/requests/${impReq.id}/accept`)
    ok('accept -> 200', r.s === 200 && r.d.status === 'accepted')
    r = await call(staff.token, 'POST', `/requests/${impReq.id}/accept`)
    ok('accept twice -> 409', r.s === 409)

    // ── list + sorting
    r = await call(staff.token, 'GET', '/containers?direction=import&stage=new_request&acceptance=accepted')
    ok('accepted list has the 4 containers', r.s === 200 && r.d.length === 4, r.d && r.d.length)
    const etas = r.d.map((c: any) => c.sort_date)
    ok('sorted by ETA ascending', etas.every((d: string, i: number) => i === 0 || etas[i - 1] <= d), etas)
    ok('card carries request ref + customer', r.d[0].request_ref === 'I-101' && r.d[0].customer_name === 'cust')
    r = await call(staff.token, 'GET', '/containers?direction=import&stage=new_request&q=tclu')
    ok('search by container number', r.d.length === 1 && r.d[0].container_number === 'TCLU7654321', r.d)
    r = await call(staff.token, 'GET', '/containers?direction=export&stage=new_request')
    ok('direction isolation: no export containers', r.d.length === 0)

    // ── reconcile mismatches. find a container that has unresolved items
    let target: any = null
    for (const id of impIds) {
      const d = (await call(staff.token, 'GET', `/containers/${id}`)).d
      if (d.match.unresolved > 0 && !target) target = d
    }
    ok('at least one sample container has mismatches to resolve', !!target)
    // confirm should be blocked
    r = await call(staff.token, 'POST', `/containers/${target.container.id}/confirm-manifest`)
    ok('confirm with unresolved mismatches -> 422 unresolved_mismatches', r.s === 422 && r.e.code === 'unresolved_mismatches', r)
    // resolve a single field manually
    const sh = target.shipments.find((s: any) => s.comparison.fields.some((f: any) => f.needsResolution))
    if (sh) {
      const fld = sh.comparison.fields.find((f: any) => f.needsResolution)
      r = await call(staff.token, 'POST', `/shipments/${sh.id}/resolve`, { field: fld.key, source: 'ics' })
      ok('resolve single field -> 200', r.s === 200, r)
      const after = (await call(staff.token, 'GET', `/containers/${target.container.id}`)).d
      const s2 = after.shipments.find((s: any) => s.id === sh.id)
      const f2 = s2.comparison.fields.find((f: any) => f.key === fld.key)
      ok('chosen source persisted + working value switched to ICS', f2.chosen === 'ics' && String(s2[fld.key]) === String(fld.ics), { f2, working: s2[fld.key], ics: fld.ics })
    }
    r = await call(staff.token, 'POST', `/shipments/${target.shipments[0].id}/resolve`, { field: 'bogus', source: 'ics' })
    ok('resolve unknown field -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${target.container.id}/resolve-all`, { source: 'manifest' })
    ok('resolve-all -> 200', r.s === 200, r)
    const after2 = (await call(staff.token, 'GET', `/containers/${target.container.id}`)).d
    ok('nothing unresolved after resolve-all, can_confirm true', after2.match.unresolved === 0 && after2.match.can_confirm === true, after2.match)

    // ── confirm manifest for ALL four (resolve-all first)
    for (const id of impIds) {
      await call(staff.token, 'POST', `/containers/${id}/resolve-all`, { source: 'manifest' })
      r = await call(staff.token, 'POST', `/containers/${id}/confirm-manifest`)
      ok(`confirm manifest ${id.slice(0, 4)} -> manifested`, r.s === 200 && r.d.status === 'manifested', r)
    }
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/confirm-manifest`)
    ok('confirm twice -> 409', r.s === 409)
    r = await call(staff.token, 'PATCH', `/containers/${impIds[0]}`, { vessel: 'X' })
    ok('cannot edit after confirm -> 409', r.s === 409)

    // ── settings: min match threshold
    r = await call(staff.token, 'PUT', '/settings/import', { min_match_pct: 50 })
    ok('packing user can change settings', r.s === 200, r)
    r = await call(admin.token, 'PUT', '/settings/import', { min_match_pct: 150 })
    ok('settings validation -> 400', r.s === 400)
    r = await call(admin.token, 'PUT', '/settings/import', { notification_emails: 'not-an-email' })
    ok('bad emails -> 400', r.s === 400)

    // ── planning
    const settings = (await call(staff.token, 'GET', '/settings')).d
    ok('seeded locations + teams visible', settings.locations.length === 3 && settings.teams.length === 3, settings)
    const locA = settings.locations.find((l: any) => l.name === 'Warehouse A'); const yard = settings.locations.find((l: any) => l.name === 'Yard 1')
    const impTeam = settings.teams.find((t: any) => t.name === 'Unpacking Team 1'); const expTeam = settings.teams.find((t: any) => t.name === 'Packing Team 1')
    const planBody = { locationId: locA.id, teamId: impTeam.id, plannedDate: '2026-10-12', startTime: '09:00', endTime: '11:00' }
    r = await call(staff.token, 'POST', `/containers/${impIds[1]}/plan`, { ...planBody, endTime: '08:00' })
    ok('end before start -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${impIds[1]}/plan`, { ...planBody, teamId: expTeam.id })
    ok('export-only team rejected for import job -> 400', r.s === 400, r)
    r = await call(admin.token, 'PUT', '/settings/import', { default_team_id: impTeam.id, notification_emails: 'a@x.com, b@x.com', min_match_pct: 0, numeric_tolerance_pct: 1 })
    ok('admin sets default team + emails', r.s === 200 && r.d.default_team_id === impTeam.id && r.d.notification_emails === 'a@x.com, b@x.com', r)
    r = await call(staff.token, 'POST', `/containers/${impIds[1]}/plan`, { locationId: locA.id, plannedDate: '2026-10-12', startTime: '09:00', endTime: '11:00' })
    ok('plan without teamId uses default team -> planned', r.s === 200 && r.d.status === 'planned' && r.d.team_name === 'Unpacking Team 1' && !r.d.plan_confirmed_at, r)
    r = await call(staff.token, 'POST', `/containers/${impIds[1]}/unplan`)
    ok('unplan -> manifested', r.s === 200 && r.d.status === 'manifested' && !r.d.location_id)
    // capacity: yard capacity 4. fill with all 4 import + then export
    for (const id of impIds) await call(staff.token, 'POST', `/containers/${id}/plan`, { ...planBody, locationId: yard.id })
    // 4 planned at yard on that day; capacity is 4 -> 5th should conflict (use new container)
    const extra = await call(staff.token, 'POST', '/requests', { direction: 'import', customer: { name: 'Walk-in Co', email: 'w@x.com' }, containers: [{ containerNumber: 'HLXU1111112' }] })
    ok('staff-created request is auto-accepted (E/I ref, source staff)', extra.s === 201 && extra.d.request.status === 'accepted' && extra.d.request.source === 'staff')
    const exId = extra.d.containerIds[0]
    await call(staff.token, 'POST', `/containers/${exId}/resolve-all`, { source: 'ics' })
    await call(staff.token, 'POST', `/containers/${exId}/confirm-manifest`)
    r = await call(staff.token, 'POST', `/containers/${exId}/plan`, { ...planBody, locationId: yard.id })
    ok('over capacity -> 409 capacity_exceeded', r.s === 409 && r.e.code === 'capacity_exceeded', r)
    r = await call(staff.token, 'POST', `/containers/${exId}/plan`, { ...planBody, locationId: yard.id, force: true })
    ok('force overrides capacity', r.s === 200)

    r = await call(staff.token, 'GET', '/plan-board?from=2026-10-10&days=5')
    ok('plan board returns days, locations and jobs on 12th', r.s === 200 && r.d.days.length === 5 && r.d.jobs.filter((j: any) => j.planned_date === '2026-10-12').length === 5, r.d && r.d.jobs.length)

    // ── confirm plan → tablet
    r = await call(staff.token, 'GET', `/containers/${impIds[0]}/info-sheet`)
    ok('info sheet available once planned', r.s === 200 && r.d.shipments.length > 0 && r.d.plan.location === 'Yard 1', r)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/confirm-plan`)
    ok('confirm plan -> tablet payload stored', r.s === 200 && !!r.d.plan_confirmed_at && !!r.d.tablet_pushed_at && r.d.tablet_payload.shipments.length > 0, r)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/plan`, planBody)
    ok('cannot re-plan a confirmed plan -> 409', r.s === 409)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/unplan`)
    ok('cannot unplan a confirmed plan -> 409', r.s === 409)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/recall-plan`)
    ok('recall -> unconfirmed', r.s === 200 && !r.d.plan_confirmed_at)
    await call(staff.token, 'POST', `/containers/${impIds[0]}/confirm-plan`)

    // ── tablet result → validation → complete
    const det = (await call(staff.token, 'GET', `/containers/${impIds[0]}`)).d
    r = await call(staff.token, 'POST', `/containers/${impIds[2]}/tablet-result`, { shipments: [{ shipmentId: det.shipments[0].id, actualPackageCount: 5 }] })
    ok('result for unconfirmed plan -> 409', r.s === 409)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/tablet-result`, { shipments: [{ shipmentId: '11111111-1111-1111-1111-111111111111', actualPackageCount: 5 }] })
    ok('result for foreign shipment -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/tablet-result`, { shipments: [] })
    ok('empty result -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/tablet-result`, {
      notes: 'one pallet damaged',
      shipments: det.shipments.map((s: any) => ({ shipmentId: s.id, actualWeightKg: s.weight_kg, actualVolumeCbm: s.volume_cbm, actualPackageCount: s.package_count - 1, notes: 'short 1' })),
      photos: [{ storagePath: '2026-10-12/tablet/1.jpg', fileName: '1.jpg', shipmentId: det.shipments[0].id }],
    })
    ok('tablet result -> result_validation', r.s === 201 && r.d.status === 'result_validation', r)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/result/reject`, {})
    ok('reject needs reason -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/result/reject`, { notes: 'recount please' })
    ok('reject -> back to planned (still confirmed)', r.s === 200 && r.d.status === 'planned' && !!r.d.plan_confirmed_at, r)
    await call(staff.token, 'POST', `/containers/${impIds[0]}/tablet-result`, { shipments: det.shipments.map((s: any) => ({ shipmentId: s.id, actualPackageCount: s.package_count })) })
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/result/approve`, { notes: 'good' })
    ok('approve -> completed + shared with customer', r.s === 200 && r.d.status === 'completed' && !!r.d.shared_with_customer_at && !!r.d.completed_at, r)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/result/approve`, {})
    ok('approve again -> 409', r.s === 409)
    const full = (await call(staff.token, 'GET', `/containers/${impIds[0]}`)).d
    ok('results history: 1 rejected + 1 approved, tablet photo recorded', full.results.map((x: any) => x.status).sort().join() === 'approved,rejected' && full.photos.some((p: any) => p.source === 'tablet'), full.results)
    ok('activity trail recorded the whole journey', ['request_submitted', 'request_accepted', 'manifest_confirmed', 'plan_assigned', 'plan_confirmed', 'result_submitted', 'result_rejected', 'result_approved'].every(a => full.activity.some((x: any) => x.action === a)), full.activity.map((a: any) => a.action))

    // ── notes, photos, messages, compliance
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/notes`, { body: '  ' })
    ok('empty note -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/notes`, { body: 'Forklift needed' })
    ok('add note', r.s === 201)
    const noteId = r.d.id
    r = await call(admin.token, 'DELETE', `/notes/${noteId}`)
    ok('admin deletes any note', r.s === 200)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/messages`, { body: 'Can you confirm the consignee?', shipmentId: det.shipments[0].id })
    ok('message customer', r.s === 201 && r.d.recipient_email === 'cust@t.com' && r.d.email_sent === false, r)
    r = await call(staff.token, 'PATCH', `/containers/${impIds[2]}/compliance`, { inspection_status: 'pending', fumigation_status: 'completed' })
    ok('compliance update', r.s === 200 && r.d.inspection_status === 'pending')
    r = await call(staff.token, 'PATCH', `/containers/${impIds[2]}/compliance`, { inspection_status: 'maybe' })
    ok('compliance invalid -> 400', r.s === 400)
    r = await call(staff.token, 'GET', '/containers?direction=import&stage=planned')
    ok('compliance shows on cards', Array.isArray(r.d) && r.d.some((c: any) => c.id === impIds[2] && c.inspection_status === 'pending' && c.fumigation_status === 'completed'), r.d)

    // ── cancel
    r = await call(staff.token, 'POST', `/containers/${impIds[3]}/cancel`, {})
    ok('cancel needs reason -> 400', r.s === 400)
    r = await call(staff.token, 'POST', `/containers/${impIds[3]}/cancel`, { reason: 'customer withdrew' })
    ok('cancel -> ok', r.s === 200)
    r = await call(staff.token, 'POST', `/containers/${impIds[0]}/cancel`, { reason: 'x' })
    ok('cannot cancel completed -> 409', r.s === 409)

    // ── customer views
    r = await call(cust.token, 'GET', '/my-requests')
    ok('customer sees own 2 requests only', r.s === 200 && r.d.length === 2, r.d && r.d.length)
    r = await call(cust2.token, 'GET', '/my-requests')
    ok('other customer sees none', r.s === 200 && r.d.length === 0)
    r = await call(cust2.token, 'GET', `/my-requests/${impReq.id}`)
    ok("other customer cannot open someone else's request -> 404", r.s === 404)
    r = await call(cust.token, 'GET', `/my-requests/${impReq.id}`)
    ok('customer detail shows messages, completed shipments, no internal notes/activity', r.s === 200 && r.d.messages.length === 1 && r.d.containers.find((c: any) => c.id === impIds[0]).shipments.length > 0 && !('notes' in r.d) && !('activity' in r.d), r.d && Object.keys(r.d))

    // ── decline path
    const dec = await call(cust.token, 'POST', '/requests', { direction: 'import', containers: [{ containerNumber: 'ZIMU9999990' }] })
    r = await call(staff.token, 'POST', `/requests/${dec.d.request.id}/decline`, { reason: 'No capacity this week' })
    ok('decline with reason', r.s === 200 && r.d.status === 'declined')
    r = await call(cust.token, 'GET', `/my-requests/${dec.d.request.id}`)
    ok('customer sees decline reason', r.d.request.decline_reason === 'No capacity this week')
    r = await call(staff.token, 'GET', '/containers?direction=import&stage=new_request')
    ok('declined requests drop out of staff lists', !r.d.some((c: any) => c.container_number === 'ZIMU9999990'))

    // ── EXPORT / packing
    r = await call(cust.token, 'POST', '/requests', {
      direction: 'export', relatedServices: ['lcl_collection', 'pra', 'fcl_delivery'],
      containers: [{ containerNumber: 'EXPU1234560', etd: '2026-10-20', shipments: [{ houseBillNumber: 'EXP-1', consignee: 'Tokyo Imports', packageCount: 10 }] }],
    })
    ok('export request -> E-101 with services + customer-declared shipment', r.s === 201 && r.d.request.request_ref === 'E-101' && r.d.request.related_services.length === 3, r)
    const exReq = r.d.request; const exCont = r.d.containerIds[0]
    await call(staff.token, 'POST', `/requests/${exReq.id}/accept`)
    r = await call(staff.token, 'POST', `/containers/${exCont}/confirm-manifest`)
    ok('export confirm with missing data -> 422 list of errors', r.s === 422 && r.e.code === 'validation' && r.e.errors.length >= 4, r.e)
    r = await call(staff.token, 'POST', `/containers/${exCont}/refresh-manifest`)
    ok('export has no manifest to refresh -> 400', r.s === 400)
    r = await call(staff.token, 'PATCH', `/containers/${exCont}`, { vessel: 'ONE HARMONY', voyage: '12E', load_port: 'SYDNEY', discharge_port: 'TOKYO', seal_number: 'S123' })
    ok('staff keys in header data', r.s === 200 && r.d.vessel === 'ONE HARMONY')
    r = await call(staff.token, 'PATCH', `/containers/${exCont}`, { net_weight_kg: 'abc' })
    ok('bad number -> 400', r.s === 400)
    let ex = (await call(staff.token, 'GET', `/containers/${exCont}`)).d
    r = await call(staff.token, 'PUT', `/containers/${exCont}/shipments`, { shipments: [{ house_bill_number: 'A1' }, { house_bill_number: 'a-1' }] })
    ok('duplicate house bills -> 400', r.s === 400)
    r = await call(staff.token, 'PUT', `/containers/${exCont}/shipments`, {
      shipments: [{ id: ex.shipments[0].id, house_bill_number: 'EXP-1', package_count: 12, weight_kg: 500, consignee: 'Tokyo Imports' }, { house_bill_number: 'EXP-2', package_count: 3, weight_kg: 90 }],
    })
    ok('shipments saved (update + insert)', r.s === 200 && r.d.length === 2 && r.d[0].package_count === 12, r)
    r = await call(staff.token, 'PUT', `/containers/${exCont}/shipments`, { shipments: [{ id: ex.shipments[0].id, house_bill_number: 'EXP-1', package_count: 12 }] })
    ok('omitted shipment removed', r.s === 200 && r.d.length === 1)
    r = await call(staff.token, 'POST', `/containers/${exCont}/confirm-manifest`)
    ok('export confirm -> manifested + ICS push (stubbed)', r.s === 200 && r.d.status === 'manifested' && r.d.ics_push_status === 'stubbed' && /STUB-E-101/.test(r.d.ics_push_ref), r)
    r = await call(staff.token, 'PUT', `/containers/${exCont}/shipments`, { shipments: [] })
    ok('cannot edit shipments after submit -> 409', r.s === 409)
    r = await call(staff.token, 'POST', `/containers/${exCont}/plan`, { locationId: locA.id, plannedDate: '2026-10-21', startTime: '13:00', endTime: '15:00', teamId: expTeam.id })
    ok('export plans with packing team', r.s === 200 && r.d.team_name === 'Packing Team 1')
    r = await call(staff.token, 'GET', '/summary?direction=export')
    ok('export summary counts', r.d.planned.draft === 1 && r.d.manifested === 0, r.d)
    r = await call(staff.token, 'GET', '/summary?direction=import')
    ok('import summary counts', r.d.completed === 1 && r.d.planned.draft === 3 && r.d.new_request.awaiting_acceptance === 1 && r.d.new_request.accepted === 0, r.d)

    // ── injection / safety
    r = await call(staff.token, 'GET', `/containers?direction=import&stage=new_request&q=${encodeURIComponent("' OR 1=1 --")}`)
    ok('search is parameterised (no error, no rows)', r.s === 200 && r.d.length === 0)
    r = await call(staff.token, 'GET', '/containers/not-a-uuid')
    ok('bad id -> 400', r.s === 400)
    r = await call(staff.token, 'GET', '/containers?direction=import&stage=bogus')
    ok('bad stage -> 400', r.s === 400)
  } catch (e) { console.error('TEST CRASH', e); fails++ }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); srv.close(); await pool.end(); process.exit(fails ? 1 : 0)
})
