import test from 'node:test';
import assert from 'node:assert/strict';
import { isCallSignalingError } from './useWebRTC.js';

test('routes a matching call join rejection to the call UI', () => {
  assert.equal(isCallSignalingError({
    t: 'error',
    eventType: 'call-join',
    room: 'room-a',
    error: 'Call invite required'
  }, 'room-a'), true);
});

test('does not show unrelated or other-room errors in the active call', () => {
  assert.equal(isCallSignalingError({
    t: 'error',
    eventType: 'SEND_MESSAGE',
    room: 'room-a'
  }, 'room-a'), false);
  assert.equal(isCallSignalingError({
    t: 'error',
    eventType: 'call-join',
    room: 'room-b'
  }, 'room-a'), false);
});
