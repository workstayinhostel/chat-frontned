const B = import.meta.env.VITE_API || `${window.location.protocol}//${window.location.hostname}:4000`;
// JWT lives in sessionStorage only; messages are held in memory and never written to client storage.
export const tok = () => sessionStorage.getItem('t');
export function makeId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((byte, index) =>
      `${[4, 6, 8, 10].includes(index) ? '-' : ''}${byte.toString(16).padStart(2, '0')}`
    ).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export async function api(p, o = {}) {
  const fd = o.body instanceof FormData;
  const r = await fetch(B + '/api' + p, { ...o, headers: { ...(fd ? {} : { 'Content-Type': 'application/json' }), Authorization: 'Bearer ' + tok() }, body: o.body && !fd ? JSON.stringify(o.body) : o.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && tok()) window.dispatchEvent(new Event('auth-expired'));
    throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  }
  return j;
}
export async function loadMedia(id) {
  const r = await fetch(`${B}/api/media/${encodeURIComponent(id)}`, {
    headers: { Authorization: 'Bearer ' + tok() }
  });
  if (!r.ok) {
    const result = await r.json().catch(() => ({}));
    throw new Error(result.error || 'Unable to load media');
  }
  return r.blob();
}
export function connect() {
  let ws, dead = false;
  const subs = new Set(), queuedMessages = [];
  const open = () => {
    ws = new WebSocket(`${B.replace('http', 'ws')}/ws?token=${tok()}`);
    ws.onopen = () => {
      while (queuedMessages.length && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(queuedMessages.shift()));
      }
      subs.forEach(f => f({ t: 'ready' }));
    };
    ws.onmessage = e => subs.forEach(f => f(JSON.parse(e.data)));
    ws.onclose = () => !dead && setTimeout(open, 1500);
  };
  open();
  return {
    send: o => {
      if (dead) return false;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(o));
          return true;
        } catch (error) {
          if (o.t !== 'msg') throw error;
          queuedMessages.push(o);
          return true;
        }
      }
      if (o.t === 'msg') {
        queuedMessages.push(o);
        return true;
      }
      return false;
    },
    sub: f => (subs.add(f), () => subs.delete(f)),
    close: () => { dead = true; queuedMessages.length = 0; ws.close(); }
  };
}
