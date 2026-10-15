// R3: Swayam phone reminders (Web Push).
//   GET  ?op=key                  -> public key the phone needs to turn reminders on
//   POST ?op=send  (x-cron-key)   -> every 5 minutes (database timer): send what is due
//   POST ?op=test  (signed-in)    -> send a test reminder to the signed-in person's phones
//   POST ?op=action {token}       -> "Done" / "+30 min" tapped on a reminder
// The rules for WHAT is due live in reminderRules.ts (exact copy of src/lib/reminderRules.ts).
// Server keys live in public.app_secrets (no app access). Deployed with verify_jwt = false:
// every operation checks its own key, token or sign-in below.
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'
import { remindersDue, istDay, nextDate, clock, istMinutes } from './reminderRules.ts'
import type { Alert, RVisit, RFollowUp, REvent } from './reminderRules.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------- server keys ----------
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))

async function secret(name: string): Promise<string | null> {
  const { data } = await db.from('app_secrets').select('value').eq('name', name).maybeSingle()
  return (data?.value as string | undefined) ?? null
}

let vapidReady: { publicKey: string } | null = null
async function vapid(): Promise<{ publicKey: string }> {
  if (vapidReady) return vapidReady
  let pub = await secret('vapid_public')
  let priv = await secret('vapid_private')
  if (!pub || !priv) {
    // First run: make the key pair once and keep it (a second run racing us keeps the first one)
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    await db.from('app_secrets').upsert(
      [{ name: 'vapid_public', value: b64url(raw) }, { name: 'vapid_private', value: jwk.d as string }],
      { onConflict: 'name', ignoreDuplicates: true }
    )
    pub = await secret('vapid_public')
    priv = await secret('vapid_private')
  }
  webpush.setVapidDetails('mailto:support@swayam.app', pub!, priv!)
  vapidReady = { publicKey: pub! }
  return vapidReady
}

// ---------- action tokens (Done / +30 min without opening the app) ----------
async function hmac(data: string): Promise<string> {
  const key = await secret('action_key')
  if (!key) throw new Error('action key missing')
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data))))
}
async function makeToken(userId: string, kind: string, id: string, action: string): Promise<string> {
  const exp = Date.now() + 2 * 864e5
  const payload = `${userId}.${kind}.${id}.${action}.${exp}`
  return b64url(new TextEncoder().encode(payload)) + '.' + (await hmac(payload))
}
async function readToken(token: string): Promise<{ userId: string; kind: string; id: string; action: string } | null> {
  const [p, sig] = String(token ?? '').split('.')
  if (!p || !sig) return null
  let payload: string
  try { payload = new TextDecoder().decode(fromB64url(p)) } catch { return null }
  if ((await hmac(payload)) !== sig) return null
  const [userId, kind, id, action, exp] = payload.split('.')
  if (!userId || !id || Number(exp) < Date.now()) return null
  return { userId, kind, id, action }
}

// ---------- sending ----------
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

async function push(sub: Sub, message: Record<string, unknown>): Promise<'ok' | 'gone' | 'error'> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 3600, urgency: 'high' })
    return 'ok'
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    if (code === 404 || code === 410) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
      return 'gone'
    }
    console.error('push failed', code, (e as Error).message)
    return 'error'
  }
}

async function messageFor(userId: string, alert: Alert, actionUrl: string) {
  const actions = []
  for (const a of alert.actions) {
    if (!alert.target) continue
    actions.push({ action: a.action, title: a.title, token: await makeToken(userId, alert.target.kind, alert.target.id, a.action) })
  }
  return { title: alert.title, body: alert.body, tag: alert.key, url: '/', actionUrl, actions }
}

const nameOf = (c: unknown) => ((Array.isArray(c) ? c[0] : c) as { name?: string } | null)?.name || 'Customer'

async function sendDue(actionUrl: string) {
  const now = new Date()
  const { data: subs, error } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth')
  if (error) throw error
  const byUser = new Map<string, Sub[]>()
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  const today = istDay(now)
  const from = `${today}T00:00:00+05:30`
  const until = `${nextDate(nextDate(today))}T00:00:00+05:30`
  let sent = 0

  for (const [userId, userSubs] of byUser) {
    const [p, v, f, e, log] = await Promise.all([
      db.from('profiles').select('work_start_time').eq('id', userId).maybeSingle(),
      db.from('visits').select('id,customer_id,status,planned_start,customers(name)').eq('user_id', userId).gte('planned_start', from).lt('planned_start', until),
      db.from('follow_ups').select('id,customer_id,due_date,action,expected_value,status,customers(name)').eq('user_id', userId).eq('status', 'open').lte('due_date', nextDate(today)),
      db.from('personal_events').select('id,title,category,starts_at,all_day,status,reminder_minutes').eq('user_id', userId).gte('starts_at', from).lt('starts_at', until),
      db.from('reminder_log').select('key').eq('user_id', userId).gte('sent_at', new Date(now.getTime() - 3 * 864e5).toISOString())
    ])
    if (v.error || f.error || e.error || log.error) {
      console.error('load failed', userId, v.error?.message ?? f.error?.message ?? e.error?.message ?? log.error?.message)
      continue
    }
    const visits: RVisit[] = (v.data ?? []).map(r => ({ id: r.id, customer_id: r.customer_id, status: r.status, planned_start: r.planned_start, name: nameOf(r.customers) }))
    const followUps: RFollowUp[] = (f.data ?? []).map(r => ({ id: r.id, customer_id: r.customer_id, due_date: r.due_date, action: r.action, expected_value: Number(r.expected_value), status: r.status, name: nameOf(r.customers) }))
    const events = (e.data ?? []) as REvent[]

    const due = remindersDue({ now, visits, followUps, events, workStart: p.data?.work_start_time, sent: new Set((log.data ?? []).map(r => r.key as string)) })
    for (const alert of due) {
      // Claim the key first: if two runs overlap, only one of them sends
      const claim = await db.from('reminder_log').insert({ user_id: userId, key: alert.key }).select('key')
      if (claim.error || !claim.data?.length) continue
      const message = await messageFor(userId, alert, actionUrl)
      const results = await Promise.all(userSubs.map(s => push(s, message)))
      if (results.includes('ok')) sent++
      // Every phone failed for a temporary reason: free the key so the next run tries again
      else if (results.includes('error')) await db.from('reminder_log').delete().eq('user_id', userId).eq('key', alert.key)
    }
  }
  // Keep the log small
  await db.from('reminder_log').delete().lt('sent_at', new Date(now.getTime() - 14 * 864e5).toISOString())
  return { users: byUser.size, sent }
}

// ---------- Done / +30 min ----------
const SHIFT = 30 * 60_000

async function doAction(t: { userId: string; kind: string; id: string; action: string }) {
  if (t.kind === 'event') {
    const { data: ev } = await db.from('personal_events').select('id,starts_at,ends_at,status').eq('id', t.id).eq('user_id', t.userId).maybeSingle()
    if (!ev || ev.status !== 'planned') return { ok: false, message: 'Already changed. Open Swayam to check.' }
    if (t.action === 'done') {
      const r = await db.from('personal_events').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', t.id).eq('user_id', t.userId).eq('status', 'planned').select('id')
      return r.data?.length === 1 ? { ok: true, message: 'Marked done.' } : { ok: false, message: 'Not saved. Open Swayam to check.' }
    }
    if (t.action === 'later') {
      const start = Math.max(Date.parse(ev.starts_at), Date.now()) + SHIFT
      const newStart = new Date(Math.ceil(start / 300_000) * 300_000)
      const ends = ev.ends_at ? new Date(Date.parse(ev.ends_at) + (newStart.getTime() - Date.parse(ev.starts_at))).toISOString() : null
      const r = await db.from('personal_events').update({ starts_at: newStart.toISOString(), ends_at: ends, updated_at: new Date().toISOString() })
        .eq('id', t.id).eq('user_id', t.userId).eq('status', 'planned').eq('starts_at', ev.starts_at).select('id')
      return r.data?.length === 1 ? { ok: true, message: `Moved to ${clock(istMinutes(newStart))}.` } : { ok: false, message: 'Not moved. Open Swayam to check.' }
    }
  }
  if (t.kind === 'visit' && t.action === 'later') {
    const { data: v } = await db.from('visits').select('id,planned_start,status').eq('id', t.id).eq('user_id', t.userId).maybeSingle()
    if (!v || v.status !== 'planned' || !v.planned_start) return { ok: false, message: 'Already changed. Open Swayam to check.' }
    const start = Math.max(Date.parse(v.planned_start), Date.now()) + SHIFT
    const newStart = new Date(Math.ceil(start / 300_000) * 300_000)
    if (istDay(newStart) !== istDay(new Date(v.planned_start))) return { ok: false, message: 'That would move it to another day. Open Swayam to choose a time.' }
    const r = await db.from('visits').update({ planned_start: newStart.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', t.id).eq('user_id', t.userId).eq('status', 'planned').eq('planned_start', v.planned_start).select('id')
    return r.data?.length === 1 ? { ok: true, message: `Visit moved to ${clock(istMinutes(newStart))}.` } : { ok: false, message: 'Not moved. Open Swayam to check.' }
  }
  return { ok: false, message: 'Open Swayam to do this.' }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const op = url.searchParams.get('op')
  const actionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/reminders?op=action`
  try {
    if (op === 'key') return json({ publicKey: (await vapid()).publicKey })

    if (op === 'send' && req.method === 'POST') {
      const expected = await secret('cron_key')
      if (!expected || req.headers.get('x-cron-key') !== expected) return json({ error: 'forbidden' }, 403)
      await vapid()
      return json(await sendDue(actionUrl))
    }

    if (op === 'test' && req.method === 'POST') {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await db.auth.getUser(jwt)
      if (!u?.user) return json({ error: 'Sign in again.' }, 401)
      await vapid()
      const { data: subs } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('user_id', u.user.id)
      if (!subs?.length) return json({ ok: false, message: 'Reminders are not turned on for this phone yet.' })
      const results = await Promise.all((subs as Sub[]).map(s => push(s, {
        title: 'Swayam reminders are on', body: `This is how a reminder looks. Sent at ${clock(istMinutes(new Date()))}.`, tag: 'test', url: '/', actionUrl, actions: []
      })))
      return json({ ok: results.includes('ok'), phones: results.length })
    }

    if (op === 'action' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const t = await readToken((body as { token?: string }).token ?? '')
      if (!t) return json({ ok: false, message: 'This reminder expired. Open Swayam.' }, 400)
      return json(await doAction(t))
    }

    return json({ error: 'unknown request' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'server error' }, 500)
  }
})
