// R3: turn phone reminders on/off for this phone, and send a test reminder.
// The phone's push address is saved through save_push_subscription (database function), so it is
// always tied to whoever is signed in on this phone.
import { supabase } from './supabase'

const FN = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''}/functions/v1/reminders`

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const ready = navigator.serviceWorker.ready
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
  return (await Promise.race([ready, timeout])) ?? null
}

export async function pushState(): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return isIOS() && !isInstalled() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Returns '' when reminders are on, otherwise a plain message saying what went wrong
export async function enablePush(): Promise<string> {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'Notifications were not allowed. Allow them for Swayam in your phone settings, then try again.'
    const reg = await registration()
    if (!reg) return 'This browser cannot show reminders. Use Chrome and install Swayam on your home screen.'
    const r = await fetch(`${FN}?op=key`)
    const { publicKey } = (await r.json()) as { publicKey?: string }
    if (!publicKey) return 'Could not reach the reminder service. Try again in a minute.'
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
    const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth })
    if (error) return 'Could not save this phone: ' + error.message
    return ''
  } catch (e) {
    return 'Could not turn on reminders: ' + (e as Error).message
  }
}

// Stop reminders on this phone (also used before signing out)
export async function disablePush(): Promise<void> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return 'Sign in again.'
  try {
    const r = await fetch(`${FN}?op=test`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const j = (await r.json()) as { ok?: boolean; message?: string; error?: string }
    if (j.ok) return 'Test sent. It should appear within a minute.'
    return j.message || j.error || 'The test could not be sent.'
  } catch {
    return 'Could not reach the reminder service.'
  }
}
