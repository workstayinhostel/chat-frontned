import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearUnreadCount,
  conversationKey,
  createSendMessageEvent,
  eventType,
  markOutgoingMessagesRead,
  mergeMessage,
  restoreConversation
} from './chatEvents.js';

test('normalizes long-form and legacy event names', () => {
  assert.equal(eventType({ type: 'MESSAGE' }), 'MESSAGE');
  assert.equal(eventType({ t: 'msg' }), 'msg');
});

test('creates backend message events for text and image payloads', () => {
  assert.deepEqual(createSendMessageEvent({
    chatId: 'chat-id',
    clientId: 'client-id',
    content: 'hello'
  }), {
    type: 'SEND_MESSAGE',
    chatId: 'chat-id',
    clientId: 'client-id',
    kind: 'text',
    content: 'hello'
  });
  assert.deepEqual(createSendMessageEvent({
    chatId: 'chat-id',
    clientId: 'image-client-id',
    kind: 'image',
    content: 'ignored',
    mediaUrl: 'https://storage.example/photo.webp'
  }), {
    type: 'SEND_MESSAGE',
    chatId: 'chat-id',
    clientId: 'image-client-id',
    kind: 'image',
    content: '',
    mediaUrl: 'https://storage.example/photo.webp'
  });
});

test('reconciles optimistic messages by clientId and deduplicates by message id', () => {
  const pending = { id: 'pending:client-1', clientId: 'client-1', from: 'me', kind: 'text', text: 'hello', at: '2026-01-01T00:00:00Z' };
  const acknowledged = { id: 'saved-1', clientId: 'client-1', from: 'me', kind: 'text', content: 'hello', at: '2026-01-01T00:00:01Z' };
  let messages = mergeMessage([pending], acknowledged);
  messages = mergeMessage(messages, { ...acknowledged, content: 'updated' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 'saved-1');
  assert.equal(messages[0].text, 'updated');
});

test('uses group and peer identities as UI conversation keys', () => {
  assert.equal(conversationKey({ group: 'group-1', from: 'other' }, 'me'), 'group-1');
  assert.equal(conversationKey({ from: 'me', to: 'other' }, 'me'), 'other');
  assert.equal(conversationKey({ from: 'other', to: 'me' }, 'me'), 'other');
});

test('read receipts mark only the current user messages as seen', () => {
  const result = markOutgoingMessagesRead([
    { from: 'me', status: 'sent', at: '2026-01-01T00:00:00Z' },
    { from: 'me', status: 'sent', at: '2026-01-02T00:00:00Z' },
    { from: 'other', status: 'sent', at: '2026-01-01T00:00:00Z' }
  ], 'me', '2026-01-01T12:00:00Z');
  assert.deepEqual(result.map(message => message.status), ['seen', 'sent', 'sent']);
});

test('opening a conversation clears its backend chat unread counter', () => {
  const chats = [
    { chatId: 'chat-1', unreadCount: 3 },
    { chatId: 'chat-2', unreadCount: 5 }
  ];
  assert.deepEqual(clearUnreadCount(chats, 'chat-1'), [
    { chatId: 'chat-1', unreadCount: 0 },
    { chatId: 'chat-2', unreadCount: 5 }
  ]);
});

test('restores the selected conversation with its backend chat document id', () => {
  const selected = restoreConversation(
    [{ id: 'peer-1', displayName: 'Jamie' }],
    [{ id: 'peer-1', chatId: 'chat-document-1' }],
    'peer-1'
  );
  assert.deepEqual(selected, {
    id: 'peer-1',
    displayName: 'Jamie',
    chatId: 'chat-document-1'
  });
  assert.equal(restoreConversation([], [], 'removed-peer'), null);
});
