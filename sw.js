const VERSION = 'glance-v2';
const PROXY_URL = '/api/alerts';
const TOWN = 'גבעות עדן';
const POLL_INTERVAL = 2000;

let lastState = null;
let pollTimer = null;

// ── State parsing ─────────────────────────────────────────────────────────────

function parseState(data) {
  if (!data || data.ok === false) return 'gray';
  if (!Array.isArray(data.data)) return 'green';
  const found = data.data.some(item => typeof item === 'string' && item.trim() === TOWN);
  if (!found) return 'green';
  const cat = Number(data.cat);
  // tzevaadom threat numbers: 0=rockets, 5=UAV, 6=non-conventional missile → RED
  //                           2=terrorist infiltration → YELLOW
  if (cat === 0 || cat === 5 || cat === 6) return 'red';
  if (cat === 2) return 'yellow';
  return 'green';
}

// ── Notification helpers ──────────────────────────────────────────────────────

const STATE_NOTIF = {
  green: {
    title: '🟢 גבעות עדן — All Clear',
    body: 'No active alerts. Normal activity.',
    icon: '/icons/icon-green-192.png',
    silent: true,
    vibrate: null,
    requireInteraction: true,
    badge: 0,
    actions: [],
  },
  yellow: {
    title: '🟡 גבעות עדן — Stay Near Shelter',
    body: 'Preliminary warning issued. Stay near a protected space.',
    icon: '/icons/icon-yellow-192.png',
    silent: false,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    badge: 1,
    actions: [{ action: 'open', title: '👁 Open Glance' }],
  },
  red: {
    title: '🔴 גבעות עדן — ENTER SHELTER NOW',
    body: 'ACTIVE SIREN. Enter your protected space immediately.',
    icon: '/icons/icon-red-192.png',
    silent: false,
    vibrate: [300, 100, 300, 100, 300, 100, 300],
    requireInteraction: true,
    badge: 9,
    actions: [{ action: 'open', title: '👁 Open Glance' }],
  },
  gray: {
    title: '⚫ גבעות עדן — Status Unknown',
    body: 'Cannot reach alert service. Status unknown.',
    icon: '/icons/icon-green-192.png',
    silent: true,
    vibrate: null,
    requireInteraction: true,
    badge: 1,
    actions: [{ action: 'open', title: '👁 Open Glance' }],
  },
};

async function postNotification(state) {
  const n = STATE_NOTIF[state];
  if (!n) return;

  const opts = {
    body: n.body,
    icon: n.icon,
    badge: '/icons/badge-96.png',
    tag: 'glance-status',
    renotify: state !== 'green',
    silent: n.silent,
    requireInteraction: n.requireInteraction,
    data: { state },
    actions: n.actions,
  };

  if (n.vibrate) opts.vibrate = n.vibrate;

  await self.registration.showNotification(n.title, opts).catch(() => {});
}

async function updateBadge(state) {
  const n = STATE_NOTIF[state];
  if (!n) return;
  if (n.badge === 0) {
    if (self.clearAppBadge) await self.clearAppBadge().catch(() => {});
  } else {
    if (self.setAppBadge) await self.setAppBadge(n.badge).catch(() => {});
  }
}

async function broadcastState(state) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'STATE_CHANGE', state });
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function doPoll() {
  let data = { ok: false, error: 'network_error' };
  try {
    const res = await fetch(`${PROXY_URL}?t=${Date.now()}`, { cache: 'no-store' });
    const text = await res.text();
    if (text && text.trim() && text.trim() !== '\r\n') {
      try { data = JSON.parse(text); } catch (_) { data = { ok: false, error: 'parse_error' }; }
    } else {
      data = { ok: true };
    }
  } catch (_) {
    data = { ok: false, error: 'network_error' };
  }

  const state = parseState(data);
  if (state !== lastState) {
    lastState = state;
    await postNotification(state);
    await updateBadge(state);
    await broadcastState(state);
  }
}

function startPolling() {
  if (pollTimer) return;
  doPoll();
  pollTimer = setInterval(doPoll, POLL_INTERVAL);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      lastState = 'green';
      await postNotification('green');
      startPolling();
    })
  );
});

// ── Fetch passthrough ─────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});

// ── Messages ──────────────────────────────────────────────────────────────────

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'START_POLL') {
    startPolling();
  }
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const state = (event.notification.data && event.notification.data.state) || 'green';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
      // Focus or open app window
      const appClient = clients.find(c => c.url.startsWith(self.registration.scope));
      if (appClient) {
        await appClient.focus();
      } else {
        await self.clients.openWindow('/');
      }

      // Re-post status notification after delay so it returns to shade
      await new Promise(resolve => setTimeout(resolve, 1500));
      await postNotification(state);
    })
  );
});
