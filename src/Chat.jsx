import { useEffect, useRef, useState } from 'react'; import { api, connect, loadMedia, makeId } from './api'; import Call from './Call';
import { createPortal } from 'react-dom';
import messageSentSound from './assets/messagesent.mp3';
import messageReceivedSound from './assets/messagecome.mp3';
import callReceivedSound from './assets/callreceived.mp3';
import callOutgoingSound from './assets/calloutgoing.mp3';
import callIncomingSound from './assets/callincomming.mp3';
import callEndedSound from './assets/calldecline.mp3';
const tick = status => status === 'sending'
  ? <span className="message-send-spinner" title="Sending" aria-label="Sending" />
  : status === 'sent'
    ? <span className="message-status-tick" title="Sent" aria-label="Sent">✓</span>
    : <span className={`message-status-tick ${status === 'seen' ? 'message-status-seen' : ''}`}
      title={status === 'seen' ? 'Seen' : 'Delivered'} aria-label={status === 'seen' ? 'Seen' : 'Delivered'}>✓✓</span>;
const Modal = ({ children }) => <div className="fixed inset-0 z-40 grid place-items-center bg-black/60"><div className="w-80 space-y-3 rounded-2xl bg-slate-900 p-5 text-slate-100">{children}</div></div>;
const inp = 'w-full rounded-lg bg-slate-800 px-3 py-2 outline-none';

function MediaAttachment({ id, kind }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    let live = true, objectUrl;
    loadMedia(id).then(blob => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  if (error) return <span role="alert" className="text-sm text-red-300">{error}</span>;
  if (!url) return <span className="text-sm opacity-60">Loading attachment…</span>;
  return kind === 'image'
    ? <div className="media-image">
      <img src={url} alt="Shared attachment" className="h-auto max-h-80 max-w-full rounded-lg object-contain" />
      <button className="media-menu-trigger" aria-label="Photo options" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>•••</button>
      {menuOpen && <div className="media-menu">
        <a href={url} download={`metufy-photo-${id}`}>↓ <span>Download photo</span></a>
      </div>}
    </div>
    : <VoiceMessage url={url} />;
}

function VoiceMessage({ url }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const format = value => {
    if (!Number.isFinite(value)) return '0:00';
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  };
  const toggle = async () => {
    if (!audio.current) return;
    if (audio.current.paused) {
      try {
        await audio.current.play();
        setPlaying(true);
      } catch (error) {
        console.error('Voice message playback failed:', error);
      }
    } else {
      audio.current.pause();
      setPlaying(false);
    }
  };
  return <div className="voice-message">
    <audio ref={audio} src={url} preload="metadata"
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
      onTimeUpdate={event => setProgress(event.currentTarget.currentTime)}
      onEnded={() => setPlaying(false)} />
    <button className="voice-play" type="button" aria-label={playing ? 'Pause voice message' : 'Play voice message'} onClick={toggle}>{playing ? 'Ⅱ' : '▶'}</button>
    <div className="voice-track">
      <button className="voice-waveform" type="button" aria-label="Seek voice message"
        onClick={event => {
          if (!audio.current || !duration) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          audio.current.currentTime = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * duration;
        }}>
        {Array.from({ length: 32 }, (_, index) => {
          const point = ((index + 1) / 32) * duration;
          return <i key={index} className={point <= progress ? 'voice-wave-played' : ''} style={{ height: `${18 + ((index * 19 + 7) % 25)}px` }} />;
        })}
      </button>
      <small>{playing ? format(progress) : format(duration)}</small>
    </div>
  </div>;
}

function MessageActions({ message, position, canEdit, dark, onEdit, onDelete, onClose }) {
  if (!position || !message) return null;
  return createPortal(<>
    {position.mode === 'sheet' && <button className="message-sheet-backdrop" aria-label="Close message actions" onClick={onClose} />}
    <div className={`message-action-menu ${dark ? 'message-action-dark' : ''} ${position.mode === 'sheet' ? 'message-action-sheet' : ''}`}
      style={position.mode === 'menu' ? { left: position.x, top: position.y } : undefined}
      role="menu" aria-label="Message actions">
      <time className="message-action-time" dateTime={new Date(message.at).toISOString()}>
        {new Date(message.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
      </time>
      {canEdit && <button role="menuitem" onClick={onEdit}>Edit message</button>}
      {message.from === message.currentUserId && <button role="menuitem" className="message-delete-option" onClick={onDelete}>Delete message</button>}
    </div>
  </>, document.body);
}

function MessageItem({ message, previous, next, currentUserId, senderLabel, dark, accent, onOpenMenu }) {
  const longPress = useRef(null);
  const mine = message.from === currentUserId;
  const groupedBefore = previous?.from === message.from;
  const groupedAfter = next?.from === message.from;
  const canEdit = mine && message.kind === 'text' && !message.deleted && Date.now() - new Date(message.at) < 3e5;
  const clearLongPress = () => {
    clearTimeout(longPress.current);
    longPress.current = null;
  };
  useEffect(() => clearLongPress, []);
  return <div className={`message-row ${mine ? 'message-row-mine' : 'message-row-theirs'} ${groupedBefore ? 'message-grouped-before' : ''} ${groupedAfter ? 'message-grouped-after' : ''}`}>
    <div className={`message-bubble ${mine ? 'message-mine' : 'message-theirs'} ${dark ? 'message-dark' : ''} ${groupedBefore ? 'bubble-grouped-before' : ''} ${groupedAfter ? 'bubble-grouped-after' : ''}`}
      style={{ '--message-accent': accent }}
      onContextMenu={event => {
        if (message.deleted || message.clientId) return;
        event.preventDefault();
        onOpenMenu(message, event.clientX, event.clientY, matchMedia('(pointer: coarse)').matches ? 'sheet' : 'menu');
      }}
      onTouchStart={event => {
        if (message.deleted || message.clientId) return;
        const touch = event.touches[0];
        longPress.current = setTimeout(() => {
          longPress.current = null;
          onOpenMenu(message, touch.clientX, touch.clientY, 'sheet');
        }, 500);
      }}
      onTouchMove={clearLongPress}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}>
      {!message.deleted && !message.clientId && <button className="message-menu-trigger" type="button" aria-label="Message actions"
        onClick={event => {
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          onOpenMenu(message, bounds.right, bounds.bottom, matchMedia('(pointer: coarse)').matches ? 'sheet' : 'menu');
        }}><span className="message-menu-dots">•••</span></button>}
      {!groupedBefore && senderLabel && <small className="message-author">{senderLabel}</small>}
      {message.deleted ? <i className="opacity-60">{message.text}</i>
        : message.kind === 'image' || message.kind === 'audio' ? <MediaAttachment id={message.text} kind={message.kind} />
          : <><span className="whitespace-pre-wrap break-words">{message.text}</span>
            {mine && <span className="message-inline-status">
              {message.edited && <small>(edited)</small>}
              {tick(message.status)}
            </span>}
          </>}
      {(message.kind === 'image' || message.kind === 'audio') && mine && !message.deleted &&
        <div className="message-meta">{tick(message.status)}</div>}
    </div>
  </div>;
}

function CallLogItem({ call, currentUserId, group }) {
  const direction = call.createdBy === currentUserId ? 'Outgoing' : 'Incoming';
  const result = call.endReason === 'declined'
    ? 'Declined'
    : call.answeredAt
      ? 'Completed'
      : direction === 'Incoming' ? 'Missed' : 'Cancelled';
  const others = call.members.filter(member => member.id !== currentUserId);
  return <div className="call-log-row">
    <div className={`call-log-icon ${call.endReason === 'declined' || result === 'Missed' ? 'call-log-missed' : ''}`}>{call.video ? '▣' : '☎'}</div>
    <div className="call-log-details">
      <b>{call.video ? 'Video call' : 'Voice call'} · {result}</b>
      <small>{direction}{group && others.length ? ` · ${others.map(member => `@${member.username || member.displayName}`).join(', ')}` : ''}</small>
    </div>
    <time dateTime={new Date(call.at).toISOString()}>{new Date(call.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
  </div>;
}

function AccountPage({ user, setUser, logout, close }) {
  const [f, setF] = useState({ displayName: user.displayName, activeStatus: user.activeStatus, theme: user.theme });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      setUser(await api('/me', { method: 'PATCH', body: f }));
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return <main className="account-page">
    <header className="account-header"><button onClick={close} aria-label="Back to chats">←</button><div><b>Account</b><small>Manage your profile and preferences</small></div></header>
    <section className="account-content">
      <div className="account-profile-card">
        <span className="account-avatar" style={{ background: f.theme.accent }}>{f.displayName?.[0]?.toUpperCase() || '?'}</span>
        <div><h1>{f.displayName}</h1><p>@{user.username}</p><small><i /> Metufy account</small></div>
      </div>
      <section className="account-section">
        <div className="account-section-heading"><b>Profile</b><small>How people see you</small></div>
        <label className="account-input"><span>Display name</span><input value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} maxLength={40} /></label>
        <div className="account-input account-username"><span>Username <small>can’t be changed</small></span><b>@{user.username}</b></div>
      </section>
      <section className="account-section">
        <div className="account-section-heading"><b>Privacy & appearance</b><small>Set your availability and look</small></div>
        <label className="account-setting-row"><span><b>Active status</b><small>Let your contacts know when you’re online</small></span><input type="checkbox" checked={f.activeStatus} onChange={e => setF({ ...f, activeStatus: e.target.checked })} /></label>
        <label className="account-setting-row"><span><b>Theme</b><small>Choose your chat appearance</small></span><select value={f.theme.wallpaper} onChange={e => setF({ ...f, theme: { ...f.theme, wallpaper: e.target.value } })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label className="account-setting-row"><span><b>Accent color</b><small>Personalize your chat controls</small></span><input type="color" value={f.theme.accent} onChange={e => setF({ ...f, theme: { ...f.theme, accent: e.target.value } })} /></label>
      </section>
      {error && <p role="alert" className="account-error">{error}</p>}
      <button className="account-save" onClick={save} disabled={saving}>{saving ? 'Saving changes…' : 'Save changes'}</button>
      <button className="account-logout" onClick={logout}>Log out of Metufy</button>
    </section>
  </main>;
}
function NewGroup({ close, done }) {
  const [n, setN] = useState(''), [u, setU] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async event => {
    event.preventDefault();
    const usernames = u.split(/[ ,]+/).map(username => username.replace(/^@/, '')).filter(Boolean);
    if (!n.trim() || !usernames.length) {
      setError('Add a group name and at least one username.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/groups', { method: 'POST', body: { name: n.trim(), usernames } });
      await done();
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="group-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <form className="group-dialog" onSubmit={make} role="dialog" aria-modal="true" aria-labelledby="group-dialog-title">
      <div className="group-dialog-heading"><span className="group-dialog-icon">＋</span><button type="button" onClick={close} aria-label="Close new group">×</button></div>
      <h2 id="group-dialog-title">Create a group</h2>
      <p>Bring your hostel friends together in one conversation.</p>
      <label className="group-dialog-field"><span>Group name</span><input autoFocus placeholder="e.g. Floor 3 roommates" value={n} onChange={event => setN(event.target.value)} maxLength={80} /></label>
      <label className="group-dialog-field"><span>Add people</span><input placeholder="@username, @username" value={u} onChange={event => setU(event.target.value)} /></label>
      <small className="group-dialog-hint">Separate usernames with commas or spaces.</small>
      {error && <p className="group-dialog-error" role="alert">{error}</p>}
      <div className="group-dialog-actions"><button type="button" className="group-cancel" onClick={close}>Cancel</button><button type="submit" className="group-create" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button></div>
    </form>
  </div>;
}

function Room({ act, user, list, callLogs, ws, online, typing, dark, ac, onCall, onBack, onPending, onSendFailure, error }) {
  const [t, setT] = useState(''), [edit, setEdit] = useState(null), [rec, setRec] = useState(null), [uploads, setUploads] = useState(0), [mediaError, setMediaError] = useState(''), [messageMenu, setMessageMenu] = useState(null), [deleteMessage, setDeleteMessage] = useState(null), end = useRef(), lt = useRef(0), seenSent = useRef(new Set());
  const sendSeen = () => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const unread = list.filter(message => message.from !== user.id && message.status !== 'seen' && !seenSent.current.has(message.id));
    if (!unread.length) return;
    if (ws.send(g ? { t: 'seen', group: act.id } : { t: 'seen', chat: act.id })) {
      unread.forEach(message => seenSent.current.add(message.id));
    }
  };
  useEffect(() => {
    end.current?.scrollIntoView();
    sendSeen();
  }, [list, act.id]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') sendSeen(); };
    const onFocus = () => sendSeen();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [list, act.id]);
  useEffect(() => {
    if (!messageMenu) return;
    const closeMenu = event => {
      if (!event.target.closest?.('.message-action-menu, .message-menu-trigger')) setMessageMenu(null);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') setMessageMenu(null); };
    const closeOnScroll = () => setMessageMenu(null);
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [messageMenu]);
  const openMessageMenu = (message, x, y, mode) => {
    const width = 190, height = message.from === user.id ? 145 : 60;
    setMessageMenu({
      id: message.id,
      mode,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8))
    });
  };
  const activeMenuMessage = list.find(message => message.id === messageMenu?.id);
  const activeMenuCanEdit = activeMenuMessage?.from === user.id && activeMenuMessage.kind === 'text' &&
    !activeMenuMessage.deleted && Date.now() - new Date(activeMenuMessage.at) < 3e5;
  const editMenuMessage = () => {
    setEdit(activeMenuMessage.id);
    setT(activeMenuMessage.text);
    setMessageMenu(null);
  };
  const deleteMenuMessage = () => {
    setDeleteMessage(activeMenuMessage);
    setMessageMenu(null);
  };
  const confirmDeleteMessage = () => {
    if (!ws.send({ t: 'delete', id: deleteMessage.id })) {
      setMediaError('Could not delete the message while offline. Please reconnect and try again.');
    }
    setDeleteMessage(null);
  };
  const g = !!act.members, name = g ? act.name : act.displayName, tgt = g ? { group: act.id } : { to: act.id };
  const who = id => act.members?.find(m => m.id === id)?.displayName;
  const usernameOf = id => id === user.id
    ? user.username
    : g
      ? act.members?.find(member => member.id === id)?.username
      : act.username;
  const send = (text, kind = 'text') => {
    const clientId = makeId();
    onPending({
      id: `pending:${clientId}`,
      clientId,
      from: user.id,
      ...tgt,
      kind,
      text,
      at: new Date().toISOString(),
      status: 'sending'
    });
    if (!ws.send({ t: 'msg', clientId, kind, text, ...tgt })) {
      onSendFailure(clientId, 'Message not sent. Check your connection and try again.');
    }
  };
  const submit = e => {
    e?.preventDefault();
    if (!t.trim()) return;
    if (edit) {
      if (!ws.send({ t: 'edit', id: edit, text: t })) setMediaError('You are offline. Reconnect before editing this message.');
    } else {
      send(t);
    }
    setEdit(null);
    setT('');
  };
  const upload = async (blob, kind) => {
    if (blob.size > 15 * 1024 * 1024) {
      alert('Attachments must be 15 MB or smaller.');
      return;
    }
    setUploads(n => n + 1);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'f');
      send((await api('/upload', { method: 'POST', body: fd })).id, kind);
    } catch (e) {
      alert(e.message);
    } finally {
      setUploads(n => n - 1);
    }
  };
  const record = async () => {
    if (rec) return rec.stop();
    setMediaError('');
    let stream;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires HTTPS. Open Metufy using a secure connection and allow microphone access.');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!window.MediaRecorder) throw new Error('Voice recording is not supported by this browser.');
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : undefined);
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setMediaError('The voice message could not be recorded. Please try again.');
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        setRec(null);
        if (chunks.length) upload(new Blob(chunks, { type: recorder.mimeType || chunks[0].type }), 'audio');
      };
      recorder.start();
      setRec(recorder);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      setMediaError(error.message || 'Microphone access was not granted.');
    }
  };
  const type = e => { setT(e.target.value); if (Date.now() - lt.current > 1200) { lt.current = Date.now(); ws.send({ t: 'typing', ...tgt }); } };
  return <section className="chat-room">
    <header className="chat-header">
      <button className="chat-back-button" type="button" onClick={onBack} aria-label="Back to chats">
        <span aria-hidden="true">←</span>
      </button>
      <span className="chat-contact-avatar" style={{ background: ac }}>{name?.[0]?.toUpperCase() || '?'}</span>
      <div className="chat-contact"><b>{name}</b><small>{g ? `${act.members.length} members` : `@${act.username}${online[act.id] ? ' · Active now' : ''}`}</small></div>
      <div className="chat-actions">
        <button onClick={() => onCall(false)} aria-label="Start voice call" title="Voice call"><span>☎</span><small>Call</small></button>
        <button onClick={() => onCall(true)} aria-label="Start video call" title="Video call"><span>▣</span><small>Video</small></button>
      </div>
    </header>
    <div className="chat-messages">
      {error && <p role="alert" className="chat-error">{error}</p>}
      {!list.length && !callLogs.length && <div className="empty-conversation"><span>✦</span><b>This is the beginning</b><small>Send a message to start your conversation.</small></div>}
      {[...list.map(message => ({ type: 'message', at: message.at, message })),
        ...callLogs.map(call => ({ type: 'call', at: call.at, call }))]
        .sort((first, second) => new Date(first.at) - new Date(second.at))
        .map((item, index, timeline) => item.type === 'call'
          ? <CallLogItem key={`call:${item.call.id}`} call={item.call} currentUserId={user.id} group={g} />
          : <MessageItem key={item.message.id} message={item.message}
            previous={timeline[index - 1]?.type === 'message' ? timeline[index - 1].message : null}
            next={timeline[index + 1]?.type === 'message' ? timeline[index + 1].message : null}
            currentUserId={user.id}
            senderLabel={`${item.message.from === user.id ? 'You' : who(item.message.from) || name} · @${usernameOf(item.message.from) || 'user'}`}
            dark={dark} accent={ac} onOpenMenu={openMessageMenu} />)}
      <div ref={end} />
    </div>
    <MessageActions message={activeMenuMessage ? { ...activeMenuMessage, currentUserId: user.id } : null}
      position={messageMenu} canEdit={activeMenuCanEdit} dark={dark}
      onEdit={editMenuMessage} onDelete={deleteMenuMessage} onClose={() => setMessageMenu(null)} />
    {deleteMessage && createPortal(<div className={`delete-dialog-backdrop ${dark ? 'delete-dialog-dark' : ''}`}>
      <section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
        <span className="delete-dialog-icon">!</span>
        <h2 id="delete-dialog-title">Delete this message?</h2>
        <p id="delete-dialog-description">This message will be removed for everyone in this chat. This action can’t be undone.</p>
        <div className="delete-dialog-actions">
          <button className="delete-cancel" onClick={() => setDeleteMessage(null)}>Keep message</button>
          <button className="delete-confirm" onClick={confirmDeleteMessage}>Delete message</button>
        </div>
      </section>
    </div>, document.body)}
    <form className="composer-wrap" onSubmit={submit}>
      {typing[act.id] && <div className="typing-status"><i /><span>{g ? who(typing[act.id]) : name} is typing</span><b>···</b></div>}
      <div className="composer">
        <label className="composer-tool" title="Attach a photo" aria-label="Attach a photo">＋<input type="file" accept="image/*" hidden onChange={e => e.target.files[0] && upload(e.target.files[0], 'image')} /></label>
        <input value={t} onChange={type} placeholder={edit ? 'Edit message…' : 'Write a message…'} aria-label="Message" enterKeyHint="send" autoComplete="off" />
        {!!uploads && <span role="status" className="uploading"><i />Uploading…</span>}
        <button type="button" onClick={record} className={`composer-tool ${rec ? 'recording' : ''}`} aria-label={rec ? 'Stop recording' : 'Record voice message'} title={rec ? 'Stop recording' : 'Record voice message'}>{rec ? '■' : '♬'}</button>
        <button type="submit" className="send-button" style={{ background: ac }} aria-label={edit ? 'Save message' : 'Send message'}>{edit ? '✓' : '↑'}</button>
      </div>
      {mediaError && <p role="alert" className="media-error">{mediaError}</p>}
      <small className="composer-hint">Enter to send <span>·</span> Photos up to 15 MB <span>·</span> Private chat</small>
    </form></section>;
}

export default function Chat({ user, setUser, logout }) {
  const [chats, setChats] = useState({ users: [], groups: [], chats: [] }), [act, setAct] = useState(null), [msgs, setMsgs] = useState({}), [online, setOnline] = useState({}), [typing, setTyping] = useState({}), [error, setError] = useState('');
  const [callLogs, setCallLogs] = useState({});
  const [q, setQ] = useState(''), [res, setRes] = useState([]), [modal, setModal] = useState(null), [call, setCall] = useState(null), [inv, setInv] = useState(null), [, setW] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(320), [themeBusy, setThemeBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [callSetupError, setCallSetupError] = useState('');
  const soundElements = useRef(null), soundPending = useRef(null), soundReadyRef = useRef(false), incomingCallRef = useRef(inv), activeCallRef = useRef(call), answeredCallRef = useRef(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundPromptDismissed, setSoundPromptDismissed] = useState(() => {
    try { return localStorage.getItem('metufy-sounds-enabled') === 'true'; } catch { return false; }
  });
  const [soundError, setSoundError] = useState('');
  const ws = useRef(), typingTimers = useRef(new Map()), msgsR = useRef(msgs);
  const activeChatR = useRef(act);
  msgsR.current = msgs;
  activeChatR.current = act;
  incomingCallRef.current = inv;
  activeCallRef.current = call;
  soundReadyRef.current = soundReady;
  const ac = user.theme.accent, dark = user.theme.wallpaper === 'dark';
  const stopSound = name => {
    const audio = soundElements.current?.[name];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.loop = false;
  };
  const playSound = (name, loop = false) => {
    const audio = soundElements.current?.[name];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.loop = loop;
    if (!soundReadyRef.current) {
      soundPending.current = { name, loop };
      return;
    }
    audio.play().catch(error => {
      soundPending.current = { name, loop };
      soundReadyRef.current = false;
      setSoundReady(false);
      console.warn(`Could not play ${name} sound:`, error);
    });
  };
  const enableSounds = () => {
    const sounds = soundElements.current;
    if (!sounds) {
      setSoundError('Audio is still loading. Please try again in a moment.');
      return;
    }
    const pending = soundPending.current;
    const targetName = pending?.name || 'messageSent';
    const target = sounds[targetName];
    if (!target) {
      setSoundError('Audio could not be initialized. Reload Metufy and try again.');
      return;
    }
    setSoundError('');
    try {
      Object.entries(sounds).forEach(([name, audio]) => {
        if (name === targetName) return;
        audio.muted = true;
        audio.currentTime = 0;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.loop = false;
        }).catch(error => {
          audio.muted = false;
          console.warn(`Could not prepare ${name} sound:`, error);
        });
      });

      target.muted = false;
      target.volume = pending ? 1 : 0.2;
      target.loop = pending?.loop || false;
      target.currentTime = 0;
      const playback = target.play();
      playback.then(() => {
        soundReadyRef.current = true;
        setSoundReady(true);
        setSoundPromptDismissed(true);
        setSoundError('');
        if (soundPending.current?.name === targetName) soundPending.current = null;
        try { localStorage.setItem('metufy-sounds-enabled', 'true'); } catch (error) {
          console.warn('Could not save audio preference:', error);
        }
      }).catch(error => {
        soundReadyRef.current = false;
        setSoundReady(false);
        setSoundError('Playback was blocked. Check your phone’s silent mode and volume, then tap Enable sounds again.');
        console.warn('Could not enable Metufy sounds:', error);
      });
    } catch (error) {
      soundReadyRef.current = false;
      setSoundReady(false);
      setSoundError(`Audio could not start: ${error.message}`);
    }
  };
  const toggleTheme = async () => {
    setThemeBusy(true);
    try {
      const theme = { ...user.theme, wallpaper: dark ? 'light' : 'dark' };
      setUser(await api('/me', { method: 'PATCH', body: { displayName: user.displayName, activeStatus: user.activeStatus, theme } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setThemeBusy(false);
    }
  };
  const load = () => api('/chats').then(data => {
    setChats(data);
    setError('');
  }).catch(e => setError(e.message));
  const loadCallLogs = conversation => {
    if (!conversation) return;
    const path = `/calls/${conversation.id}${conversation.members ? `?g=${encodeURIComponent(conversation.id)}` : ''}`;
    api(path).then(logs => setCallLogs(current => ({ ...current, [conversation.id]: logs })))
      .catch(e => setError(e.message));
  };
  const refreshCallLogsForEvent = event => {
    const current = activeChatR.current;
    if (!current) return;
    const sameChat = event.group
      ? current.members && current.id === event.group
      : !current.members && [user.id, current.id].sort().join(':') === event.chat;
    if (sameChat) loadCallLogs(current);
  };
  const keyOf = m => m.group || (m.from === user.id ? m.to : m.from);
  useEffect(() => {
    const sources = {
      messageSent: messageSentSound,
      messageReceived: messageReceivedSound,
      callReceived: callReceivedSound,
      callOutgoing: callOutgoingSound,
      callIncoming: callIncomingSound,
      callEnded: callEndedSound
    };
    soundElements.current = Object.fromEntries(Object.entries(sources).map(([name, source]) => {
      const audio = new Audio(source);
      audio.preload = 'auto';
      audio.playsInline = true;
      return [name, audio];
    }));
    return () => {
      Object.values(soundElements.current || {}).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      soundElements.current = null;
    };
  }, []);
  useEffect(() => {
    load(); const w = ws.current = connect(); setW(1);
    const retryPending = () => {
      if (document.visibilityState !== 'visible') return;
      Object.values(msgsR.current).flat().filter(message => message.status === 'sending').forEach(message => {
        w.send({
          t: 'msg',
          clientId: message.clientId,
          kind: message.kind,
          text: message.text,
          ...(message.group ? { group: message.group } : { to: message.to })
        });
      });
      load();
      const current = activeChatR.current;
      if (current) {
        api(`/messages/${current.id}${current.members ? `?g=${encodeURIComponent(current.id)}` : ''}`)
          .then(messages => {
            setMsgs(state => {
              const merged = new Map(messages.map(message => [message.id, message]));
              (state[current.id] || []).forEach(message => {
                if (!merged.has(message.id)) merged.set(message.id, message);
              });
              return {
                ...state,
                [current.id]: [...merged.values()].sort((first, second) => new Date(first.at) - new Date(second.at))
              };
            });
          })
          .catch(e => setError(e.message));
      }
    };
    const off = w.sub(e => {
      if (e.t === 'ready') {
        Object.values(msgsR.current).flat().filter(message => message.status === 'sending').forEach(message => {
          w.send({
            t: 'msg',
            clientId: message.clientId,
            kind: message.kind,
            text: message.text,
            ...(message.group ? { group: message.group } : { to: message.to })
          });
        });
      }
      if (e.t === 'online') setOnline(Object.fromEntries(e.ids.map(i => [i, true])));
      if (e.t === 'presence') setOnline(o => ({ ...o, [e.id]: e.on }));
      if (e.t === 'msg') {
        const k = keyOf(e.m); setMsgs(s => ({ ...s, [k]: [...(s[k] || []).filter(x => x.id !== e.m.id), e.m] }));
        if (e.m.from !== user.id) {
          playSound('messageReceived');
          w.send({ t: 'delivered', id: e.m.id });
          load();
        }
      }
      if (e.t === 'stored') {
        const k = keyOf(e.m);
        setMsgs(s => ({ ...s, [k]: [...(s[k] || []).filter(x => x.clientId !== e.clientId && x.id !== e.m.id), e.m] }));
        playSound('messageSent');
        load();
      }
      if (e.t === 'upd') setMsgs(s => { const k = keyOf(e.m); return { ...s, [k]: (s[k] || []).map(x => x.id === e.m.id ? e.m : x) }; });
      if (e.t === 'seen') {
        const k = e.group || e.by;
        setMsgs(s => ({ ...s, [k]: (s[k] || []).map(m => m.from === user.id ? { ...m, status: 'seen' } : m) }));
        load();
      }
      if (e.t === 'delivered') setMsgs(s => ({ ...s, [e.to]: (s[e.to] || []).map(m => m.status === 'sent' ? { ...m, status: 'delivered' } : m) }));
      if (e.t === 'typing') {
        const k = e.group || e.from;
        setTyping(t => ({ ...t, [k]: e.from }));
        clearTimeout(typingTimers.current.get(k));
        typingTimers.current.set(k, setTimeout(() => setTyping(t => ({ ...t, [k]: null })), 2500));
      }
      if (e.t === 'call-invite') {
        incomingCallRef.current = e;
        setInv(e);
        playSound('callIncoming', true);
      }
      if (e.t === 'call-log' || e.t === 'call-ended') refreshCallLogsForEvent(e);
      if (e.t === 'call-joined') {
        stopSound('callOutgoing');
        if (activeCallRef.current?.room === e.room) answeredCallRef.current = e.room;
        playSound('callReceived');
        const current = activeChatR.current;
        if (current) loadCallLogs(current);
      }
      if (e.t === 'call-ended') {
        stopSound('callIncoming');
        stopSound('callOutgoing');
        if (incomingCallRef.current?.room === e.room) {
          incomingCallRef.current = null;
          setInv(null);
          playSound('callEnded');
        }
        if (activeCallRef.current?.room === e.room) {
          if (answeredCallRef.current !== e.room) playSound('callEnded');
          answeredCallRef.current = null;
          activeCallRef.current = null;
          setCall(null);
        }
      }
      if (e.t === 'error') {
        if (e.clientId) {
          setMsgs(s => Object.fromEntries(Object.entries(s).map(([k, items]) => [k, items.filter(m => m.clientId !== e.clientId)])));
          setError(e.error);
        } else alert(e.error);
      }
    });
    document.addEventListener('visibilitychange', retryPending);
    window.addEventListener('pageshow', retryPending);
    return () => {
      off();
      w.close();
      typingTimers.current.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', retryPending);
      window.removeEventListener('pageshow', retryPending);
    };
  }, []);
  useEffect(() => {
    if (!act) return;
    loadCallLogs(act);
    api(`/messages/${act.id}${act.members ? `?g=${encodeURIComponent(act.id)}` : ''}`).then(r => {
      setMsgs(s => {
        const merged = new Map(r.map(message => [message.id, message]));
        const rank = { sending: 0, sent: 1, delivered: 2, seen: 3 };
        (s[act.id] || []).forEach(message => {
          const loaded = merged.get(message.id);
          if (!loaded || (rank[message.status] || 0) > (rank[loaded.status] || 0)) {
            merged.set(message.id, message);
          }
        });
        return { ...s, [act.id]: [...merged.values()].sort((a, b) => new Date(a.at) - new Date(b.at)) };
      });
      setError('');
    }).catch(e => setError(e.message));
  }, [act?.id]);
  useEffect(() => {
    const normalized = q.trim().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/i.test(normalized)) {
      setRes([]);
      return;
    }
    const t = setTimeout(() => api('/users/search?q=' + encodeURIComponent(normalized))
      .then(users => setRes(users.filter(contact => contact.username.toLowerCase() === normalized.toLowerCase())))
      .catch(e => setError(e.message)), 160);
    return () => clearTimeout(t);
  }, [q]);
  const chatMeta = new Map((chats.chats || []).map(chat => [chat.id, chat]));
  const previewFor = id => {
    const message = chatMeta.get(id)?.lastMessage;
    if (!message) return 'Start a conversation';
    const content = message.kind === 'image' ? 'Photo' : message.kind === 'audio' ? 'Voice message' : message.text;
    return `${message.from === user.id ? 'You: ' : ''}${content}`;
  };
  const requestCallMedia = async video => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone and camera access require HTTPS. Open Metufy using a secure connection.');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video });
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error(`Allow ${video ? 'camera and microphone' : 'microphone'} access in your browser settings, then try again.`);
      }
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error(`No ${video ? 'camera or microphone' : 'microphone'} was found on this device.`);
      }
      throw new Error(error.message || 'Could not access your microphone or camera.');
    }
  };
  const startCall = async video => {
    setCallSetupError('');
    enableSounds();
    let stream;
    try {
      stream = await requestCallMedia(video);
      const room = makeId();
      const invite = act.members
        ? { t: 'call-invite', group: act.id, room, video, name: act.name }
        : { t: 'call-invite', to: [act.id], room, video, name: act.displayName };
      if (!ws.current.send(invite)) throw new Error('Reconnecting to Metufy. Please try the call again.');
      const activeCall = { room, video, localStream: stream };
      activeCallRef.current = activeCall;
      answeredCallRef.current = null;
      setCall(activeCall);
      playSound('callOutgoing', true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      setCallSetupError(error.message);
    }
  };
  const acceptCall = async () => {
    if (!inv) return;
    setCallSetupError('');
    enableSounds();
    try {
      const localStream = await requestCallMedia(inv.video);
      stopSound('callIncoming');
      const activeCall = { room: inv.room, video: inv.video, localStream };
      activeCallRef.current = activeCall;
      answeredCallRef.current = null;
      incomingCallRef.current = null;
      setCall(activeCall);
      setInv(null);
    } catch (error) {
      setCallSetupError(error.message);
    }
  };
  const list = [...chats.groups, ...chats.users].sort((first, second) => {
    const firstAt = chatMeta.get(first.id)?.lastMessageAt || '';
    const secondAt = chatMeta.get(second.id)?.lastMessageAt || '';
    return new Date(secondAt || 0) - new Date(firstAt || 0);
  });
  if (accountOpen) return <div className={`chat-app ${dark ? 'chat-dark' : 'chat-light'}`}>
    <AccountPage user={user} setUser={setUser} logout={logout} close={() => setAccountOpen(false)} />
  </div>;
  return <div className={`chat-app ${dark ? 'chat-dark' : 'chat-light'}`}>
    <aside className={`${act ? 'chat-sidebar sidebar-hidden-mobile' : 'chat-sidebar'}`} style={{ '--sidebar-width': `${sidebarWidth}px` }}>
      <div className={`sidebar-top ${act ? 'mobile-chatlist-hidden' : ''}`}>
        <a className="sidebar-brand" href="#" aria-label="Metufy"><span className="brand-mark">m</span><b>metufy</b></a>
        <div className="sidebar-controls">
          <button onClick={toggleTheme} disabled={themeBusy} aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} title={`Switch to ${dark ? 'light' : 'dark'} theme`}>{themeBusy ? '…' : dark ? '☼' : '☾'}</button>
          <button onClick={() => setAccountOpen(true)} aria-label="Account settings" title="Account settings">⚙</button>
        </div>
      </div>
      <div className="profile-card">
        <span className="profile-avatar" style={{ background: ac }}>{user.displayName?.[0]?.toUpperCase() || '?'}</span>
        <span><b>{user.displayName}</b><small>@{user.username}</small></span>
        <i className="profile-online" title="Your account" />
      </div>
      {error && <p role="alert" className="sidebar-error">{error}</p>}
      <div className="search-row">
        <label className="search-wrap"><span>⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search username" aria-label="Search exact username" /><kbd>/</kbd></label>
        <button className="new-group-button" onClick={() => setModal('group')} aria-label="Create new group" title="Create new group">＋</button>
      </div>
      <div className="sidebar-section-title">{q ? 'EXACT USERNAME MATCH' : 'CHATS'}<span>{!q && list.length}</span></div>
      <div className="sidebar-conversations">
        {(q ? res : list).map(c => <button key={c.id} onClick={() => { setAct(c); setQ(''); }} className={`conversation-item ${act?.id === c.id ? 'conversation-active' : ''}`}>
          <span className="conversation-avatar-wrap"><span className="conversation-avatar" style={{ background: ac }}>{(c.name || c.displayName || '?')[0].toUpperCase()}</span>{!c.members && online[c.id] && <i className="conversation-online" title="Online" />}</span>
          <span className="conversation-info"><b>{c.name || c.displayName}</b><small>{q ? '@' + c.username : previewFor(c.id)}</small></span>
          {!q && chatMeta.get(c.id)?.unreadCount > 0 && <i className="conversation-unread" title={`${chatMeta.get(c.id).unreadCount} unread message${chatMeta.get(c.id).unreadCount === 1 ? '' : 's'}`} />}
        </button>)}
        {q && !res.length && <p className="sidebar-empty">No exact username match for “{q}”. Search the complete username.</p>}
        {!q && !list.length && <p className="sidebar-empty">Search by username to start a conversation.</p>}
      </div>
      <div className="sidebar-bottom">
        <label className="sidebar-width-control"><span>Sidebar width</span><input type="range" min="260" max="420" step="10" value={sidebarWidth} onChange={e => setSidebarWidth(Number(e.target.value))} aria-label="Adjust sidebar width" /><span>{sidebarWidth}px</span></label>
        <button className="account-settings-button" onClick={() => setAccountOpen(true)}><span>⚙</span> Account <b>→</b></button>
      </div>
    </aside>
    {act ? <Room key={act.id} act={act} user={user} list={msgs[act.id] || []} callLogs={callLogs[act.id] || []} ws={ws.current} online={online} typing={typing} dark={dark} ac={ac} onCall={startCall} onBack={() => setAct(null)} onPending={pending => setMsgs(s => ({ ...s, [act.id]: [...(s[act.id] || []), pending] }))} onSendFailure={(clientId, message) => { setMsgs(s => ({ ...s, [act.id]: (s[act.id] || []).filter(item => item.clientId !== clientId) })); setError(message); }} error={error} />
      : <div className="chat-welcome"><span className="welcome-mark">m</span><b>Your conversations, all together.</b><p>Search for someone by username and say hello.</p></div>}
    {modal === 'group' && <NewGroup close={() => setModal(null)} done={load} />}
    {!soundReady && !inv && !call && <aside className={`sound-enable-prompt ${soundPromptDismissed ? 'sound-enable-compact' : ''}`} role="status">
      {!soundPromptDismissed && <div className="sound-enable-copy">
        <b>Enable Metufy sounds</b>
        <span>Tap once to allow message and call audio on this device.</span>
      </div>}
      {soundError && <span className="sound-enable-error" role="alert">{soundError}</span>}
      <button type="button" onClick={enableSounds}>Enable sounds</button>
      {!soundPromptDismissed && <button type="button" className="sound-enable-dismiss" onClick={() => setSoundPromptDismissed(true)}>Not now</button>}
    </aside>}
    {callSetupError && !call && <div className="call-setup-error" role="alert"><span>{callSetupError}</span><button onClick={() => setCallSetupError('')} aria-label="Dismiss">×</button></div>}
    {inv && !call && <div className="incoming-call-backdrop">
      <section className="incoming-call-card" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
        <span className="incoming-call-avatar">{inv.fromName?.[0]?.toUpperCase() || '?'}</span>
        <span className="incoming-call-kicker">INCOMING {inv.video ? 'VIDEO' : 'VOICE'} CALL</span>
        <h2 id="incoming-call-title">{inv.fromName || 'Metufy contact'}</h2>
        <p>{inv.video ? 'Video call · microphone and camera access' : 'Voice call · microphone access'}</p>
        {!soundReady && <button className="incoming-sound-enable" onClick={enableSounds}>Enable call sounds</button>}
        {soundError && <p className="incoming-call-error" role="alert">{soundError}</p>}
        {callSetupError && <p className="incoming-call-error" role="alert">{callSetupError}</p>}
        <div className="incoming-call-actions">
          <button className="incoming-decline" onClick={() => { ws.current.send({ t: 'call-decline', room: inv.room }); stopSound('callIncoming'); playSound('callEnded'); incomingCallRef.current = null; setInv(null); setCallSetupError(''); }}><span>×</span><small>Decline</small></button>
          <button className="incoming-accept" onClick={acceptCall}><span>✓</span><small>Accept</small></button>
        </div>
      </section>
    </div>}
    {call && <Call ws={ws.current} room={call.room} video={call.video} localStream={call.localStream} onEnd={() => {
      stopSound('callIncoming');
      stopSound('callOutgoing');
      answeredCallRef.current = null;
      activeCallRef.current = null;
      setCall(null);
    }} />}
  </div>;
}
