import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAuthToken, connect, saveAuthToken, tok } from './api.js';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    MockWebSocket.instances.push(this);
  }

  send(message) {
    if (this.failSend) throw new Error('Simulated socket failure');
    if (this.readyState !== MockWebSocket.OPEN) throw new Error('Socket is not open');
    this.sent.push(JSON.parse(message));
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

function mockWebSocketTicketFetch() {
  const previousFetch = globalThis.fetch;
  const previousSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = {
    getItem: key => key === 't' ? 'jwt-token' : null,
    setItem() {},
    removeItem() {}
  };
  let ticketNumber = 0;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url).endsWith('/api/ws-ticket'), true);
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers.Authorization, 'Bearer jwt-token');
    return { ok: true, json: async () => ({ ticket: `one-use-ticket-${++ticketNumber}` }) };
  };
  return () => {
    globalThis.fetch = previousFetch;
    if (previousSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', previousSessionStorage);
    else delete globalThis.sessionStorage;
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete globalThis.localStorage;
  };
}

async function waitForSocket(count) {
  for (let attempt = 0; attempt < 20 && MockWebSocket.instances.length < count; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(MockWebSocket.instances.length, count);
}

test('persists the auth token across app launches and clears both storage copies', () => {
  const previousSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const createStorage = () => {
    const values = new Map();
    return {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    };
  };
  const session = createStorage();
  const persistent = createStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: persistent });

  try {
    saveAuthToken('jwt-token');
    assert.equal(tok(), 'jwt-token');
    session.removeItem('t');
    assert.equal(tok(), 'jwt-token');
    clearAuthToken();
    assert.equal(tok(), null);
  } finally {
    if (previousSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', previousSessionStorage);
    else delete globalThis.sessionStorage;
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete globalThis.localStorage;
  }
});

test('queues call signaling until a reconnecting WebSocket opens', async () => {
  const previousWebSocket = globalThis.WebSocket;
  const restoreFetch = mockWebSocketTicketFetch();
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  const connection = connect();
  const events = [];
  const unsubscribe = connection.sub(event => events.push(event));
  const invite = { t: 'call-invite', room: 'room-a' };

  assert.equal(connection.send(invite), true);
  await waitForSocket(1);
  assert.deepEqual(MockWebSocket.instances[0].sent, []);
  assert.equal(new URL(MockWebSocket.instances[0].url).searchParams.get('ticket'), 'one-use-ticket-1');
  MockWebSocket.instances[0].open();
  assert.deepEqual(MockWebSocket.instances[0].sent, [invite]);
  assert.equal(events.some(event => event.t === 'ready'), true);

  unsubscribe();
  connection.close();
  globalThis.WebSocket = previousWebSocket;
  restoreFetch();
});

test('reconnect replaces a suspended socket and reports connection transitions', async () => {
  const previousWebSocket = globalThis.WebSocket;
  const restoreFetch = mockWebSocketTicketFetch();
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  const connection = connect();
  const events = [];
  const unsubscribe = connection.sub(event => events.push(event));

  await waitForSocket(1);
  assert.equal(connection.reconnect(), true);
  await waitForSocket(2);
  assert.equal(MockWebSocket.instances.length, 2);
  assert.equal(MockWebSocket.instances[0].readyState, MockWebSocket.CLOSED);
  assert.equal(events.some(event => event.t === 'reconnecting'), true);
  MockWebSocket.instances[1].open();
  assert.equal(events.some(event => event.t === 'ready'), true);

  unsubscribe();
  connection.close();
  globalThis.WebSocket = previousWebSocket;
  restoreFetch();
});

test('does not queue typing events when a socket send fails', async () => {
  const previousWebSocket = globalThis.WebSocket;
  const restoreFetch = mockWebSocketTicketFetch();
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  const connection = connect();
  await waitForSocket(1);
  MockWebSocket.instances[0].open();
  MockWebSocket.instances[0].failSend = true;

  assert.equal(connection.send({ t: 'typing', to: 'user-b' }), false);
  assert.equal(MockWebSocket.instances[0].readyState, MockWebSocket.CLOSED);

  connection.close();
  globalThis.WebSocket = previousWebSocket;
  restoreFetch();
});
