import test from 'node:test';
import assert from 'node:assert/strict';
import { isCallSignalingError, shouldRetryCallJoin } from './useWebRTC.js';

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
