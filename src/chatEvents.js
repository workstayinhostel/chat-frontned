export const eventType = event => event.type || event.t;

export function expectArray(value, description) {
  if (!Array.isArray(value)) {
    throw new Error(`The server returned invalid ${description} data. Please retry.`);
  }
  return value;
}

export function normalizeChatData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The server returned invalid chat data. Please retry.');
  }
  const users = expectArray(data.users === undefined ? [] : data.users, 'contacts');
  const groups = expectArray(data.groups === undefined ? [] : data.groups, 'groups');
  const chats = expectArray(data.chats === undefined ? [] : data.chats, 'conversations');
  if (groups.some(group => !group || !Array.isArray(group.members))) {
    throw new Error('The server returned invalid group member data. Please retry.');
  }
  return { users, groups, chats };
}

export function createSendMessageEvent({ chatId, clientId, kind = 'text', content = '', mediaUrl }) {
  return {
    type: 'SEND_MESSAGE',
    chatId,
    clientId,
    kind,
    content: kind === 'text' ? content : '',
    ...(mediaUrl ? { mediaUrl } : {})
  };
}

export function normalizeMessage(message) {
  return {
    ...message,
    id: message.id || message.messageId,
    at: message.at || message.createdAt || new Date().toISOString(),
    text: message.kind === 'text'
      ? message.text ?? message.content ?? ''
      : message.text || message.mediaUrl || '',
    status: message.status || 'sent'
  };
}

export function conversationKey(message, currentUserId) {
  return message.group || (message.from === currentUserId ? message.to : message.from);
}

export function mergeMessage(messages, message) {
  const incoming = normalizeMessage(message);
  const merged = messages.filter(existing =>
    !(incoming.clientId && existing.clientId === incoming.clientId) &&
    !(incoming.id && existing.id === incoming.id)
  );
  merged.push(incoming);
  return merged.sort((first, second) => new Date(first.at) - new Date(second.at));
}

export function markOutgoingMessagesRead(messages, currentUserId, readAt) {
  const readTimestamp = readAt ? new Date(readAt).getTime() : Infinity;
  return messages.map(message => message.from === currentUserId && new Date(message.at).getTime() <= readTimestamp
    ? { ...message, status: 'seen' }
    : message);
}

export function clearUnreadCount(chats, chatId) {
  if (!chatId) return chats;
  return chats.map(chat => chat.chatId === chatId
    ? { ...chat, unreadCount: 0 }
    : chat);
}

export function restoreConversation(conversations, chats, conversationId) {
  if (!conversationId) return null;
  const conversation = conversations.find(item => item.id === conversationId);
  if (!conversation) return null;
  const metadata = chats.find(item => item.id === conversationId);
  return { ...conversation, chatId: metadata?.chatId };
}
