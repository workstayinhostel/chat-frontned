import test from 'node:test';
import assert from 'node:assert/strict';
import { routeWebSocketEvent } from './useWebSocket.js';

test('routes backend and compatible message/presence/read events', () => {
  const received = [];
  const handlers = {
    onMessage: event => received.push(['message', event]),
    onMessageAck: event => received.push(['ack', event]),
    onPresence: event => received.push(['presence', event]),
    onReadReceipt: event => received.push(['read', event])
  };
  const events = [
    { type: 'MESSAGE', message: { id: 'm1' } },
    { type: 'MESSAGE_RECEIVED', message: { id: 'm2' } },
    { type: 'SEND_MESSAGE_ACK', clientId: 'c1' },
    { type: 'PRESENCE', userId: 'u1' },
    { type: 'PRESENCE_UPDATE', userId: 'u2' },
    { type: 'MESSAGES_READ', chatId: 'chat1' },
    { type: 'READ_RECEIPT', chatId: 'chat2' }
  ];
  events.forEach(event => routeWebSocketEvent(event, handlers));
  assert.deepEqual(received.map(([name]) => name), [
    'message', 'message', 'ack', 'presence', 'presence', 'read', 'read'
  ]);
});

test('routes existing short-form message and call signaling events', () => {
  const received = [];
  const handlers = {
    onMessage: event => received.push(['message', event]),
    onMessageAck: event => received.push(['ack', event]),
    onWebRTCSignal: event => received.push(['signal', event])
  };
  routeWebSocketEvent({ t: 'msg', m: { id: 'legacy' } }, handlers);
  routeWebSocketEvent({ t: 'stored', clientId: 'legacy-client' }, handlers);
  routeWebSocketEvent({ type: 'WEBRTC_SIGNAL', room: 'r1' }, handlers);
  routeWebSocketEvent({ t: 'sig', room: 'r1' }, handlers);
  assert.deepEqual(received.map(([name]) => name), ['message', 'ack', 'signal', 'signal']);
});
