import { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from '../api.js';
import { eventType } from '../chatEvents.js';

export function routeWebSocketEvent(event, handlers) {
  if (!event || typeof event !== 'object') return;
  const type = eventType(event);
  const routes = {
    MESSAGE: 'onMessage',
    MESSAGE_RECEIVED: 'onMessage',
    SEND_MESSAGE_ACK: 'onMessageAck',
    msg: 'onMessage',
    stored: 'onMessageAck',
    'upd': 'onMessageUpdate',
    PRESENCE: 'onPresence',
    PRESENCE_UPDATE: 'onPresence',
    presence: 'onPresence',
    MESSAGES_READ: 'onReadReceipt',
    READ_RECEIPT: 'onReadReceipt',
    seen: 'onReadReceipt',
    'typing': 'onTyping',
    TYPING_INDICATOR: 'onTyping',
    'call-invite': 'onCallInvite',
    'call-joined': 'onCallJoined',
    'call-ended': 'onCallEnded',
    WEBRTC_SIGNAL: 'onWebRTCSignal',
    sig: 'onWebRTCSignal',
    ready: 'onReady',
    online: 'onOnline',
    error: 'onError'
  };
  handlers[routes[type] || 'onEvent']?.(event);
}

export function useWebSocket(handlers = {}) {
  const handlersRef = useRef(handlers);
  const connectionRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  handlersRef.current = handlers;

  useEffect(() => {
    const connection = connect();
    connectionRef.current = connection;
    let lastResumeReconnect = 0;
    const unsubscribe = connection.sub(event => {
      if (event.t === 'ready') setStatus('connected');
      else if (event.t === 'reconnecting') setStatus('reconnecting');
      else if (event.type === 'error' || event.t === 'error') setStatus('error');
      routeWebSocketEvent(event, handlersRef.current);
    });
    const reconnectOnResume = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastResumeReconnect >= 1500) {
        lastResumeReconnect = now;
        connection.reconnect();
      }
    };
    const reconnectFromPageShow = event => {
      if (event.persisted) reconnectOnResume();
    };
    document.addEventListener('visibilitychange', reconnectOnResume);
    window.addEventListener('pageshow', reconnectFromPageShow);
    return () => {
      document.removeEventListener('visibilitychange', reconnectOnResume);
      window.removeEventListener('pageshow', reconnectFromPageShow);
      unsubscribe();
      connectionRef.current = null;
      connection.close();
    };
  }, []);

  const send = useCallback(event => connectionRef.current?.send(event) || false, []);
  const subscribe = useCallback(handler => {
    if (!connectionRef.current) return () => {};
    return connectionRef.current.sub(handler);
  }, []);

  return { connectionRef, send, subscribe, status };
}
