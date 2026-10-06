import test from 'node:test';
import assert from 'node:assert/strict';
import { getCameraSwitchConstraints, isCallSignalingError, shouldRetryCallJoin } from './useWebRTC.js';

test('prefers switching facing mode on phones with multiple cameras', () => {
  assert.deepEqual(getCameraSwitchConstraints([
    { deviceId: 'front' },
    { deviceId: 'rear' }
  ], { deviceId: 'front', facingMode: 'user' }), [
    { facingMode: { exact: 'environment' } },
    { deviceId: { exact: 'rear' } }
  ]);
});

test('falls back to another camera ID if the requested front/back mode is unavailable', () => {
  assert.deepEqual(getCameraSwitchConstraints([
    { deviceId: 'front' },
    { deviceId: 'rear' }
  ], { deviceId: 'front' }), [
    { facingMode: { exact: 'environment' } },
    { deviceId: { exact: 'rear' } }
  ]);
});

test('falls back to facing mode when camera IDs are unavailable', () => {
  assert.deepEqual(getCameraSwitchConstraints([], { facingMode: 'environment' }), [
    { facingMode: { exact: 'user' } }
  ]);
});

test('retries transient call invitation ordering errors for the active room', () => {
  assert.equal(shouldRetryCallJoin({
    t: 'error',
    eventType: 'call-join',
    room: 'room-a',
    error: 'Call invite required'
  }, 'room-a'), true);
  assert.equal(shouldRetryCallJoin({
    t: 'error',
    error: 'Call invite required'
  }, 'room-a'), true);
  assert.equal(shouldRetryCallJoin({
    t: 'error',
    eventType: 'call-join',
    room: 'room-b',
    error: 'Call invite required'
  }, 'room-a'), false);
  assert.equal(shouldRetryCallJoin({
    t: 'error',
    eventType: 'call-join',
    room: 'room-a',
    error: 'Not authorized'
  }, 'room-a'), false);
});

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
