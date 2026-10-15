// R3: phone reminders. Loaded into Swayam's service worker (vite.config.ts → workbox.importScripts).
// Shows a reminder, and handles its buttons: "Done" / "+30 min" are sent to the server with a
// signed one-time token, so they work without opening the app. Tapping the reminder opens Swayam.

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: 'Swayam', body: event.data ? event.data.text() : '' } }
  const actions = Array.isArray(data.actions) ? data.actions.slice(0, 2) : []
  event.waitUntil(self.registration.showNotification(data.title || 'Swayam', {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: true,
    requireInteraction: actions.length > 0,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    actions: actions.map(a => ({ action: a.action, title: a.title })),
    data: { url: data.url || '/', actionUrl: data.actionUrl, actions }
  }))
})

async function openSwayam(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const c of all) {
    if ('focus' in c) { await c.focus(); c.postMessage({ type: 'swayam-reminder-opened' }); return }
  }
  await self.clients.openWindow(url || '/')
}

self.addEventListener('notificationclick', event => {
  const n = event.notification
  const d = n.data || {}
  n.close()
  const chosen = (d.actions || []).find(a => a.action === event.action)
  if (!event.action || !chosen || !d.actionUrl) {
    event.waitUntil(openSwayam(d.url))
    return
  }
  event.waitUntil((async () => {
    let message = 'Could not save. Open Swayam to check.'
    try {
      const r = await fetch(d.actionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: chosen.token }) })
      const j = await r.json()
      if (j && j.message) message = j.message
    } catch (e) { /* offline: keep the message above */ }
    await self.registration.showNotification(n.title, { body: message, tag: (d.tag || n.tag || 'swayam') + ':result', icon: '/icon-192.png', data: { url: '/' } })
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    all.forEach(c => c.postMessage({ type: 'swayam-reminder-changed' }))
  })())
})
