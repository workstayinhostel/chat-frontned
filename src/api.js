const env = import.meta.env || {};
export const API_BASE_URL = (env.VITE_API_URL || env.VITE_API || 'https://chat-backend-m43q.onrender.com').replace(/\/+$/, '');
const AUTH_TOKEN_KEY = 't';
export const tok = () => {
  try {
    const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (sessionToken) return sessionToken;
  } catch (error) {
    console.warn('Could not read the current-session login:', error);
  }
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('Could not read the persisted login:', error);
    return null;
  }
};
export function saveAuthToken(token) {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.warn('Could not save the current-session login:', error);
  }
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.warn('Could not persist the login between app launches:', error);
  }
}
export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('Could not clear the current-session login:', error);
  }
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('Could not clear the persisted login:', error);
  }
}
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
  const { body, headers = {}, ...options } = o;
  const fd = body instanceof FormData;
  const token = tok();
  const r = await fetch(API_BASE_URL + '/api' + p, {
    ...options,
    credentials: 'include',
    headers: {
      ...(fd ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body && !fd ? JSON.stringify(body) : body
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && tok()) window.dispatchEvent(new Event('auth-expired'));
    throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  }
  return j;
}
export async function loadMedia(id) {
  const token = tok();
  const r = await fetch(`${API_BASE_URL}/api/media/${encodeURIComponent(id)}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!r.ok) {
    const result = await r.json().catch(() => ({}));
    throw new Error(result.error || 'Unable to load media');
  }
  return r.blob();
}
export function connect() {
  let ws, dead = false, opening = false, generation = 0, reconnectTimer, openTimeout, reconnectDelay = 1000;
  const subs = new Set(), queuedMessages = [];
  const connectionTimeout = 15_000;
  const queueableTypes = new Set([
    'SEND_MESSAGE', 'msg', 'call-invite', 'call-join', 'call-leave', 'call-decline',
    'WEBRTC_SIGNAL', 'sig'
  ]);
  const canQueue = event => queueableTypes.has(event.type || event.t);
  const queue = event => {
    if (queuedMessages.length >= 100) {
      if (event.type === 'SEND_MESSAGE' || event.t === 'msg') return false;
      const replaceIndex = queuedMessages.findIndex(item =>
        item.event.type === 'WEBRTC_SIGNAL' || item.event.t === 'sig'
      );
      if (replaceIndex < 0) return false;
      queuedMessages.splice(replaceIndex, 1);
    }
    queuedMessages.push({ event, expiresAt: Date.now() + 30_000 });
    return true;
  };
  const scheduleReconnect = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(open, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };
  const open = async () => {
    if (dead || opening) return;
    clearTimeout(reconnectTimer);
    clearTimeout(openTimeout);
    opening = true;
    const currentGeneration = ++generation;
    let ticket;
    try {
      const result = await api('/ws-ticket', { method: 'POST' });
      if (typeof result.ticket !== 'string' || !result.ticket) {
        throw new Error('The server returned an invalid chat connection ticket.');
      }
      ticket = result.ticket;
    } catch (error) {
      if (dead || currentGeneration !== generation) return;
      opening = false;
      const message = error.status === 401
        ? 'Your session has expired. Sign in again to connect to chat.'
        : `Could not authorize the chat connection: ${error.message}`;
      subs.forEach(listener => listener({ t: 'error', error: message }));
      if (error.status !== 401) scheduleReconnect();
      return;
    }
    if (dead || currentGeneration !== generation) return;
    const wsUrl = new URL(`${API_BASE_URL}/ws`);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('ticket', ticket);
    let socket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      opening = false;
      console.error('Could not open the chat WebSocket:', error);
      subs.forEach(listener => listener({ t: 'error', error: 'Could not connect to chat. Check the secure API URL and network, then retry.' }));
      scheduleReconnect();
      return;
    }
    opening = false;
    ws = socket;
    openTimeout = setTimeout(() => {
      if (ws === socket && socket.readyState === WebSocket.CONNECTING) {
        subs.forEach(listener => listener({ t: 'reconnecting' }));
        socket.close();
      }
    }, connectionTimeout);
    socket.onopen = () => {
      if (ws !== socket) return;
      clearTimeout(openTimeout);
      reconnectDelay = 1000;
      while (queuedMessages.length && socket.readyState === WebSocket.OPEN) {
        const queued = queuedMessages[0];
        if (queued.expiresAt <= Date.now()) {
          queuedMessages.shift();
          continue;
        }
        try {
          socket.send(JSON.stringify(queued.event));
          queuedMessages.shift();
        } catch (error) {
          console.warn('Could not flush a queued WebSocket message:', error);
          socket.close();
          break;
        }
      }
      if (socket.readyState === WebSocket.OPEN) subs.forEach(f => f({ t: 'ready' }));
    };
    socket.onmessage = e => {
      if (ws !== socket) return;
      let event;
      try {
        event = JSON.parse(e.data);
      } catch (error) {
        console.error('Could not process a WebSocket message:', error);
        subs.forEach(f => f({ t: 'error', error: 'Received an invalid response from the chat server.' }));
        return;
      }
      subs.forEach(f => f(event));
    };
    socket.onerror = () => {
      if (ws === socket) {
        subs.forEach(listener => listener({
          t: 'error',
          error: 'The real-time chat connection failed. Verify the deployed backend WebSocket ticket endpoint and /ws upgrade logs.'
        }));
        socket.close();
      }
    };
    socket.onclose = () => {
      clearTimeout(openTimeout);
      if (dead || ws !== socket) return;
      subs.forEach(listener => listener({ t: 'reconnecting' }));
      scheduleReconnect();
    };
  };
  open();
  return {
    send: o => {
      if (dead) return false;
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(o));
          return true;
        } catch (error) {
          if (!canQueue(o) || !queue(o)) {
            console.warn('Could not send a WebSocket event:', error);
            ws.close();
            return false;
          }
          ws.close();
          return true;
        }
      }
      if (canQueue(o)) {
        if (!queue(o)) return false;
        if (!ws || ws.readyState === WebSocket.CLOSED) open();
        return true;
      }
      return false;
    },
    reconnect: () => {
      if (dead) return false;
      clearTimeout(reconnectTimer);
      clearTimeout(openTimeout);
      generation += 1;
      opening = false;
      subs.forEach(listener => listener({ t: 'reconnecting' }));
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        const previous = ws;
        ws = null;
        previous.onclose = null;
        previous.onerror = null;
        previous.onmessage = null;
        previous.onopen = null;
        previous.close();
      }
      reconnectDelay = 1000;
      open();
      return true;
    },
    isOpen: () => ws?.readyState === WebSocket.OPEN,
    sub: f => (subs.add(f), () => subs.delete(f)),
    close: () => {
      dead = true;
      generation += 1;
      opening = false;
      clearTimeout(reconnectTimer);
      clearTimeout(openTimeout);
      queuedMessages.length = 0;
      ws?.close();
    }
  };
}
