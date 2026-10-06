import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from './api.js';

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

test('queues call signaling until a reconnecting WebSocket opens', async () => {
  const previousWebSocket = globalThis.WebSocket;
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  const connection = connect();
  const events = [];
  const unsubscribe = connection.sub(event => events.push(event));
  const invite = { t: 'call-invite', room: 'room-a' };

  assert.equal(connection.send(invite), true);
  assert.deepEqual(MockWebSocket.instances[0].sent, []);
  MockWebSocket.instances[0].open();
  assert.deepEqual(MockWebSocket.instances[0].sent, [invite]);
  assert.equal(events.some(event => event.t === 'ready'), true);

  unsubscribe();
  connection.close();
  globalThis.WebSocket = previousWebSocket;
});

test('reconnect replaces a suspended socket and reports connection transitions', () => {
  const previousWebSocket = globalThis.WebSocket;
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  const connection = connect();
  const events = [];
  const unsubscribe = connection.sub(event => events.push(event));

  assert.equal(connection.reconnect(), true);
  assert.equal(MockWebSocket.instances.length, 2);
  assert.equal(MockWebSocket.instances[0].readyState, MockWebSocket.CLOSED);
  assert.equal(events.some(event => event.t === 'reconnecting'), true);
  MockWebSocket.instances[1].open();
  assert.equal(events.some(event => event.t === 'ready'), true);

  unsubscribe();
  connection.close();
  globalThis.WebSocket = previousWebSocket;
});

test('does not queue typing events when a socket send fails', () => {
  const previousWebSocket = globalThis.WebSocket;
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  const connection = connect();
  MockWebSocket.instances[0].open();
  MockWebSocket.instances[0].failSend = true;

  assert.equal(connection.send({ t: 'typing', to: 'user-b' }), false);
  assert.equal(MockWebSocket.instances[0].readyState, MockWebSocket.CLOSED);

  connection.close();
  globalThis.WebSocket = previousWebSocket;
});
