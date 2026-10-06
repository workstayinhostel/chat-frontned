import { useEffect, useRef, useState } from 'react';
import { Headphones, Minimize2, Video, X } from 'lucide-react';
import CallControls from './CallControls.jsx';
import VideoGrid from './VideoGrid.jsx';

function InCallChat({ ws, chatId, user, room }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const end = useRef(null);
  useEffect(() => {
    if (!ws?.sub || !chatId) return undefined;
    return ws.sub(event => {
      if (event.type === 'MESSAGE' && event.message?.chatId === chatId) {
        setMessages(current => [...current, event.message]);
      }
    });
  }, [chatId, ws]);
  const send = event => {
    event.preventDefault();
    if (!text.trim() || !chatId) return;
    const clientId = `${room}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    ws.send({
      type: 'SEND_MESSAGE',
      chatId,
      clientId,
      kind: 'text',
      content: text.trim()
    });
    setMessages(current => [...current, { from: user?.id, clientId, text: text.trim(), at: new Date().toISOString() }]);
    setText('');
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
  };
  return <aside className="call-inchat">
    <b>In-call chat</b>
    <div className="call-inchat-messages">{messages.map((message, index) =>
      <p key={message.id || message.clientId || index} className={message.from === user?.id ? 'call-inchat-mine' : ''}>{message.text || message.content}</p>
    )}<div ref={end} /></div>
    <form onSubmit={send}><input value={text} onChange={event => setText(event.target.value)} placeholder={chatId ? 'Message…' : 'Chat is unavailable'} disabled={!chatId} /><button disabled={!chatId || !text.trim()}>Send</button></form>
  </aside>;
}

export default function CallWindow({ call, user, ws, onEnd, onEnableSound }) {
  const [minimized, setMinimized] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hiddenSelf, setHiddenSelf] = useState(false);
  const [flipSelf, setFlipSelf] = useState(false);
  const [bubblePosition, setBubblePosition] = useState(null);
  const [dragOrigin, setDragOrigin] = useState(null);
  const [playbackError, setPlaybackError] = useState('');
  const bubbleMoved = useRef(false);
  const controls = call.media;
  const remoteCount = Object.keys(controls.streams).length;
  const onPointerDown = event => {
    event.currentTarget.setPointerCapture(event.pointerId);
    bubbleMoved.current = false;
    setDragOrigin({ x: event.clientX, y: event.clientY, position: bubblePosition || { x: window.innerWidth - 112, y: window.innerHeight - 112 } });
  };
  const onPointerMove = event => {
    if (!dragOrigin) return;
    if (Math.abs(event.clientX - dragOrigin.x) + Math.abs(event.clientY - dragOrigin.y) > 5) bubbleMoved.current = true;
    setBubblePosition({
      x: Math.max(12, Math.min(window.innerWidth - 92, dragOrigin.position.x + event.clientX - dragOrigin.x)),
      y: Math.max(12, Math.min(window.innerHeight - 92, dragOrigin.position.y + event.clientY - dragOrigin.y))
    });
  };

  if (minimized) return <button type="button" className="call-pip-bubble" style={bubblePosition
    ? { left: bubblePosition.x, top: bubblePosition.y, right: 'auto', bottom: 'auto' }
    : undefined} onClick={() => { if (!bubbleMoved.current) setMinimized(false); }} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={() => setDragOrigin(null)} aria-label="Restore call window">
    <span>{call.video ? '▣' : '☎'}</span><small>{controls.callStatus}</small><Minimize2 size={14} />
  </button>;

  return <div className="call-overlay call-window-glass">
    <header className="call-header">
      <span className="call-live-dot" />
      <div className="call-heading">
        <b>{call.name || (call.video ? 'Video call' : 'Voice call')}</b>
        <small>{controls.callStatus} · {remoteCount + 1} participant{remoteCount ? 's' : ''}</small>
      </div>
      <span className="call-type-pill">{call.video ? <Video size={13} /> : <Headphones size={13} />}{call.video ? 'VIDEO CALL' : 'VOICE CALL'}</span>
      <button type="button" className="call-header-icon" onClick={() => setMinimized(true)} aria-label="Minimize call"><Minimize2 /></button>
      <button type="button" className="call-close" onClick={onEnd} aria-label="End call"><X /></button>
    </header>
    {(controls.callError || controls.deviceError || playbackError) && <p className="call-error" role="alert">{controls.callError || controls.deviceError || playbackError}</p>}
    <VideoGrid streams={controls.streams} localStream={controls.localPreviewStream} video={call.video}
      cameraOff={controls.cameraOff} participants={call.participants} speaking={controls.speaking}
      levels={controls.levels} hiddenSelf={hiddenSelf} flipSelf={flipSelf}
      onFlipSelf={() => setFlipSelf(value => !value)} onPlaybackError={setPlaybackError}
      outputDevice={controls.selectedDevices.audiooutput} />
    <button type="button" className="call-self-toggle" onClick={() => setHiddenSelf(value => !value)}>
      {hiddenSelf ? 'Show self view' : 'Hide self view'}
    </button>
    {chatOpen && <InCallChat ws={ws} chatId={call.chatId} user={user} room={call.room} />}
    <CallControls muted={controls.muted} cameraOff={controls.cameraOff} sharingScreen={controls.sharingScreen}
      video={call.video} audioLevel={controls.levels.local || 0} devices={controls.devices}
      canShareScreen={controls.canShareScreen}
      selectedDevices={controls.selectedDevices} onMute={controls.toggleMute} onCamera={controls.toggleCamera}
      onScreenShare={controls.toggleScreenShare} onSwitchCamera={controls.switchCamera}
      onChat={() => setChatOpen(open => !open)} chatOpen={chatOpen}
      onSelectDevice={controls.selectDevice} onMinimize={() => setMinimized(true)} onEnd={onEnd} />
  </div>;
}
