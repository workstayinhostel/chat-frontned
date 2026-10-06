import { useEffect, useRef, useState } from 'react'; import { api, loadMedia, makeId, tok } from './api'; import Call from './Call';
import { clearUnreadCount, conversationKey, createSendMessageEvent, eventType, markOutgoingMessagesRead, mergeMessage, normalizeMessage, restoreConversation } from './chatEvents';
import { compressAndUploadImage } from './utils/media.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { glassStyle, useTheme } from './context/ThemeContext.jsx';
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
const relativeLastSeen = value => {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString();
};
const Modal = ({ children }) => <div className="fixed inset-0 z-40 grid place-items-center bg-black/60"><div className="w-80 space-y-3 rounded-2xl bg-slate-900 p-5 text-slate-100">{children}</div></div>;
const inp = 'w-full rounded-lg bg-slate-800 px-3 py-2 outline-none';

export function ChatLayout({ children, className = '', style }) {
  return <main className={`chat-app ${className}`} style={style}>{children}</main>;
}

export function ChatList({ children, className = '', style }) {
  return <aside className={className} style={style}>{children}</aside>;
}

function Avatar({ url, label, className, style }) {
  return <span className={className} style={style}>
    {url ? <img src={url} alt="" /> : label?.[0]?.toUpperCase() || '?'}
  </span>;
}

function MediaAttachment({ id, kind, mediaUrl }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  useEffect(() => {
    let live = true, objectUrl;
    if (mediaUrl) {
      setUrl(mediaUrl);
      setError('');
      return () => { live = false; };
    }
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
  }, [id, mediaUrl]);
  if (error) return <span role="alert" className="text-sm text-red-300">{error}</span>;
  if (!url) return <span className="text-sm opacity-60">Loading attachment…</span>;
  return kind === 'image'
    ? <div className="media-image">
      <button type="button" className="media-preview-button" onClick={() => setLightboxOpen(true)} aria-label="Open shared photo">
        <img src={url} alt="Shared attachment" className="h-auto max-h-80 max-w-full rounded-lg object-contain" />
      </button>
      <button className="media-menu-trigger" aria-label="Photo options" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>•••</button>
      {menuOpen && <div className="media-menu">
        <a href={url} download={`metufy-photo-${id}`}>↓ <span>Download photo</span></a>
      </div>}
      {lightboxOpen && createPortal(<div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Shared photo" onClick={() => setLightboxOpen(false)}>
        <button type="button" aria-label="Close photo" onClick={() => setLightboxOpen(false)}>×</button>
        <img src={url} alt="Shared attachment full size" />
      </div>, document.body)}
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
        : message.kind === 'image' || message.kind === 'audio' ? <MediaAttachment id={message.text} kind={message.kind} mediaUrl={message.mediaUrl} />
          : <><span className="whitespace-pre-wrap break-words">{message.text}</span>
            {mine && <span className="message-inline-status">
              {message.edited && <small>(edited)</small>}
              {tick(message.status)}
            </span>}
          </>}
      {!message.deleted && <div className="message-meta">
        <time dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
        {(message.kind === 'image' || message.kind === 'audio') && mine && tick(message.status)}
      </div>}
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

export function SettingsDrawer({ user, setUser, logout, close, activeChat, messages = [], onProfileUpdate }) {
  const [f, setF] = useState({ displayName: user.displayName, activeStatus: user.activeStatus, theme: user.theme, avatarUrl: user.avatarUrl });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [photoUploading, setPhotoUploading] = useState(false), [photoProgress, setPhotoProgress] = useState('');
  const { theme, setStyle, setBlur, setOpacity } = useTheme();
  const photoInput = useRef(null);
  const uploadPhoto = async file => {
    setPhotoUploading(true);
    setError('');
    try {
      const uploaded = await compressAndUploadImage(file, undefined, 'avatars', {
        authToken: tok(),
        onProgress: setPhotoProgress
      });
      setUser(current => ({ ...current, avatarUrl: uploaded.mediaUrl }));
      setF(current => ({ ...current, avatarUrl: uploaded.mediaUrl }));
      setPhotoProgress('Profile photo updated');
      onProfileUpdate?.();
      try {
        const refreshed = await api('/me');
        setUser({ ...refreshed, avatarUrl: uploaded.mediaUrl });
      } catch (refreshError) {
        setError(`Photo uploaded, but the profile could not be refreshed: ${refreshError.message}`);
      }
    } catch (uploadError) {
      setError(uploadError.message);
      setPhotoProgress('');
    } finally {
      setPhotoUploading(false);
    }
  };
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
  return <aside className="account-page settings-drawer">
    <header className="account-header"><button onClick={close} aria-label="Back to chats">←</button><div><b>Account</b><small>Manage your profile and preferences</small></div></header>
    <section className="account-content">
      <div className="account-profile-card">
        <Avatar url={f.avatarUrl} label={f.displayName} className="account-avatar" style={{ background: f.theme.accent }} />
        <div><h1>{f.displayName}</h1><p>@{user.username}</p><small><i /> Metufy account</small></div>
      </div>
      <section className="account-section">
        <div className="account-section-heading"><b>Profile</b><small>How people see you</small></div>
        <div className="account-photo-control">
          <button type="button" onClick={() => photoInput.current?.click()} disabled={photoUploading}>
            {photoUploading ? 'Uploading…' : 'Change profile photo'}
          </button>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) uploadPhoto(file);
              event.target.value = '';
            }} />
          {photoProgress && <small role="status">{photoProgress}</small>}
        </div>
        <label className="account-input"><span>Display name</span><input value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} maxLength={40} /></label>
        <div className="account-input account-username"><span>Username <small>can’t be changed</small></span><b>@{user.username}</b></div>
      </section>
      <section className="account-section">
        <div className="account-section-heading"><b>Privacy & appearance</b><small>Set your availability and look</small></div>
        <label className="account-setting-row"><span><b>Glassmorphism</b><small>Liquid glass or standard slate</small></span><select value={theme.style} onChange={event => setStyle(event.target.value)}><option value="standard">Standard</option><option value="glass">Liquid Glass</option></select></label>
        {theme.style === 'glass' && <>
          <label className="account-setting-row"><span><b>Glass blur</b><small>{theme.blur}px</small></span><input type="range" min="0" max="24" value={theme.blur} onChange={event => setBlur(event.target.value)} /></label>
          <label className="account-setting-row"><span><b>Surface opacity</b><small>{theme.opacity}%</small></span><input type="range" min="10" max="60" value={theme.opacity} onChange={event => setOpacity(event.target.value)} /></label>
        </>}
        <label className="account-setting-row"><span><b>Active status</b><small>Let your contacts know when you’re online</small></span><input type="checkbox" checked={f.activeStatus} onChange={e => setF({ ...f, activeStatus: e.target.checked })} /></label>
        <label className="account-setting-row"><span><b>Theme</b><small>Choose your chat appearance</small></span><select value={f.theme.wallpaper} onChange={e => setF({ ...f, theme: { ...f.theme, wallpaper: e.target.value } })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label className="account-setting-row"><span><b>Accent color</b><small>Personalize your chat controls</small></span><input type="color" value={f.theme.accent} onChange={e => setF({ ...f, theme: { ...f.theme, accent: e.target.value } })} /></label>
      </section>
      {activeChat && <section className="account-section">
        <div className="account-section-heading"><b>{activeChat.name || activeChat.displayName}</b><small>Conversation details</small></div>
        {activeChat.members && <div className="details-members">{activeChat.members.map(member =>
          <span key={member.id}><Avatar url={member.avatarUrl} label={member.displayName} className="conversation-avatar" /><b>{member.displayName}</b></span>
        )}</div>}
        <div className="details-media-gallery">
          {messages.filter(message => message.kind === 'image' && !message.deleted && message.mediaUrl).map(message =>
            <img key={message.id} src={message.mediaUrl} alt="Shared photo" />
          )}
        </div>
        {!messages.some(message => message.kind === 'image' && !message.deleted) && <small className="account-photo-hint">No shared photos yet.</small>}
      </section>}
      {error && <p role="alert" className="account-error">{error}</p>}
      <button className="account-save" onClick={save} disabled={saving}>{saving ? 'Saving changes…' : 'Save changes'}</button>
      <button className="account-logout" onClick={logout}>Log out of Metufy</button>
    </section>
  </aside>;
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

export function ChatInput({ value, onChange, onSubmit, onUpload, onRecord, recording, editing, uploads, uploadStatus, mediaError, accent }) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textarea = useRef(null);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = 'auto';
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 144)}px`;
  }, [value]);
  const appendEmoji = emoji => {
    onChange(`${value}${emoji}`);
    setEmojiOpen(false);
  };
  return <form className="composer-wrap" onSubmit={onSubmit}>
    <div className="composer">
      <div className="emoji-picker-wrap">
        <button type="button" className="composer-tool" onClick={() => setEmojiOpen(open => !open)} aria-label="Open emoji picker" aria-expanded={emojiOpen}>☺</button>
        {emojiOpen && <div className="emoji-picker" role="group" aria-label="Choose an emoji">
          {['😊', '❤️', '😂', '👍', '🎉', '🙏'].map(emoji => <button key={emoji} type="button" onClick={() => appendEmoji(emoji)}>{emoji}</button>)}
        </div>}
      </div>
      <label className="composer-tool" title="Attach a photo" aria-label="Attach a photo">📎<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }} /></label>
      <textarea ref={textarea} value={value} onChange={event => onChange(event.target.value)} onInput={event => {
        event.currentTarget.style.height = 'auto';
        event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
      }} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit(event);
        }
      }} rows={1} placeholder={editing ? 'Edit message…' : 'Write a message…'} aria-label="Message" enterKeyHint="send" autoComplete="off" />
      {!!uploads && <span role="status" className="uploading"><i />{uploadStatus || 'Uploading…'}</span>}
      <button type="button" onClick={onRecord} className={`composer-tool ${recording ? 'recording' : ''}`} aria-label={recording ? 'Stop voice recording' : 'Record voice message'}>{recording ? '■' : '♬'}</button>
      <button type="submit" className="send-button" style={{ background: accent }} aria-label={editing ? 'Save message' : 'Send message'}>{editing ? '✓' : '🚀'}</button>
    </div>
    {mediaError && <p role="alert" className="media-error">{mediaError}</p>}
    <small className="composer-hint">Enter to send · Shift+Enter for a new line <span>·</span> Photos compressed to 500 KB</small>
  </form>;
}

export function MessageThread({ act, user, list, callLogs, ws, online, lastSeen, typing, dark, ac, onCall, onBack, onPending, onSendFailure, onMarkRead, onToggleDetails, error }) {
  const [t, setT] = useState(''), [edit, setEdit] = useState(null), [rec, setRec] = useState(null), [uploads, setUploads] = useState(0), [uploadStatus, setUploadStatus] = useState(''), [mediaError, setMediaError] = useState(''), [messageMenu, setMessageMenu] = useState(null), [deleteMessage, setDeleteMessage] = useState(null), [dragging, setDragging] = useState(false), end = useRef(), lt = useRef(0), seenSent = useRef(new Set());
  const sendRead = () => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return false;
    if (!ws.send({ type: 'MARK_READ', chatId: act.chatId || act.id })) return false;
    onMarkRead(act.chatId || act.id);
    return true;
  };
  const sendSeen = () => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const unread = list.filter(message => message.from !== user.id && message.status !== 'seen' && !seenSent.current.has(message.id));
    if (!unread.length) return;
    if (sendRead()) {
      unread.forEach(message => seenSent.current.add(message.id));
    }
  };
  useEffect(() => {
    end.current?.scrollIntoView();
    sendSeen();
  }, [list]);
  useEffect(() => {
    sendRead();
  }, [act.id, act.chatId]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendRead();
        sendSeen();
      }
    };
    const onFocus = () => {
      sendRead();
      sendSeen();
    };
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
  const send = (text, kind = 'text', mediaUrl) => {
    const clientId = makeId();
    onPending({
      id: `pending:${clientId}`,
      clientId,
      from: user.id,
      ...tgt,
      kind,
      text,
      mediaUrl,
      at: new Date().toISOString(),
      status: 'sending'
    });
    const event = kind === 'audio'
      ? { t: 'msg', clientId, kind, text, ...tgt }
      : createSendMessageEvent({
        chatId: act.chatId || act.id,
        clientId,
        kind,
        content: text,
        mediaUrl
      });
    if (!ws.send(event)) {
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
    setMediaError('');
    if (kind === 'audio' && blob.size > 15 * 1024 * 1024) {
      setMediaError('Voice messages must be 15 MB or smaller.');
      return;
    }
    setUploads(n => n + 1);
    try {
      if (kind === 'image') {
        const uploaded = await compressAndUploadImage(blob, undefined, 'chat-media', {
          authToken: tok(),
          onProgress: setUploadStatus
        });
        send(uploaded.mediaUrl, 'image', uploaded.mediaUrl);
      } else {
        setUploadStatus('Uploading voice message…');
        const fd = new FormData();
        fd.append('file', blob, 'voice-message');
        send((await api('/upload', { method: 'POST', body: fd })).id, kind);
      }
    } catch (uploadError) {
      setMediaError(uploadError.message);
    } finally {
      setUploads(n => n - 1);
      if (uploads <= 1) setUploadStatus('');
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
  return <section className="chat-room" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) upload(file, 'image'); }}>
    <header className="chat-header">
      <button className="chat-back-button" type="button" onClick={onBack} aria-label="Back to chats">
        <span aria-hidden="true">←</span>
      </button>
      <Avatar url={!g && act.avatarUrl} label={name} className="chat-contact-avatar" style={{ background: ac }} />
      <div className="chat-contact"><b>{name}</b><small>{g ? `${act.members.length} members` : `@${act.username}${typing[act.id] ? ' · Typing…' : online[act.id] ? ' · Online' : lastSeen[act.id] ? ` · Last seen ${relativeLastSeen(lastSeen[act.id])}` : ' · Offline'}`}</small></div>
      <div className="chat-actions">
        <button onClick={onToggleDetails} aria-label="Toggle conversation details" title="Conversation details"><span>ⓘ</span></button>
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
    {typing[act.id] && <div className="typing-status"><i /><span>{g ? who(typing[act.id]) : name} is typing</span><b>···</b></div>}
    <ChatInput value={t} onChange={value => type({ target: { value } })} onSubmit={submit} onUpload={file => upload(file, 'image')} onRecord={record} recording={!!rec} editing={edit} uploads={uploads} uploadStatus={uploadStatus} mediaError={mediaError} accent={ac} />
    {dragging && <div className="chat-drop-overlay" role="status">Drop an image to share it</div>}
  </section>;
}

export default function Chat({ user, setUser, logout }) {
  const [chats, setChats] = useState({ users: [], groups: [], chats: [] }), [act, setAct] = useState(null), [msgs, setMsgs] = useState({}), [online, setOnline] = useState({}), [lastSeen, setLastSeen] = useState({}), [typing, setTyping] = useState({}), [error, setError] = useState('');
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [callLogs, setCallLogs] = useState({});
  const [q, setQ] = useState(''), [res, setRes] = useState([]), [modal, setModal] = useState(null), [call, setCall] = useState(null), [inv, setInv] = useState(null), [, setW] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(320), [themeBusy, setThemeBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [chatFilter, setChatFilter] = useState('all');
  const [pinnedChats, setPinnedChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`metufy-pinned-${user.id}`) || '[]'); } catch { return []; }
  });
  const [callSetupError, setCallSetupError] = useState('');
  const soundElements = useRef(null), soundPending = useRef(null), soundReadyRef = useRef(false), incomingCallRef = useRef(inv), activeCallRef = useRef(call), answeredCallRef = useRef(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundPromptDismissed, setSoundPromptDismissed] = useState(() => {
    try { return localStorage.getItem('metufy-sounds-enabled') === 'true'; } catch { return false; }
  });
  const [soundError, setSoundError] = useState('');
  const ws = useRef(), socket = useWebSocket(), typingTimers = useRef(new Map()), msgsR = useRef(msgs), chatsR = useRef(chats), restoredChat = useRef(false);
  const activeChatR = useRef(act);
  msgsR.current = msgs;
  chatsR.current = chats;
  activeChatR.current = act;
  incomingCallRef.current = inv;
  activeCallRef.current = call;
  soundReadyRef.current = soundReady;
  const ac = user.theme.accent, dark = user.theme.wallpaper === 'dark';
  const { theme: glassTheme } = useTheme();
  const stopSound = name => {
    const audio = soundElements.current?.[name];
    if (soundPending.current?.name === name) soundPending.current = null;
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
  const enableSounds = (soundName, loop = false) => {
    const sounds = soundElements.current;
    if (!sounds) {
      setSoundError('Audio is still loading. Please try again in a moment.');
      return;
    }
    const pending = soundPending.current;
    const requestedSound = typeof soundName === 'string' ? soundName : undefined;
    const targetName = pending?.name || requestedSound || 'messageSent';
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
      target.volume = pending || requestedSound ? 1 : 0.2;
      target.loop = pending?.loop ?? loop;
      target.currentTime = 0;
      const playback = target.play();
      playback.then(() => {
        soundReadyRef.current = true;
        setSoundReady(true);
        setSoundPromptDismissed(true);
        setSoundError('');
        if (soundPending.current?.name === targetName) soundPending.current = null;
        else if (soundPending.current) {
          const queued = soundPending.current;
          soundPending.current = null;
          playSound(queued.name, queued.loop);
        }
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
    setChatsLoaded(true);
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
  const keyOf = m => conversationKey(m, user.id);
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
    load();
    const w = ws.current = socket.connectionRef.current;
    if (!w) return undefined;
    setW(1);
    const retryMessage = message => {
      if (message.kind === 'audio') {
        return w.send({
          t: 'msg',
          clientId: message.clientId,
          kind: message.kind,
          text: message.text,
          ...(message.group ? { group: message.group } : { to: message.to })
        });
      }
      return w.send(createSendMessageEvent({
        chatId: message.chatId || message.group || message.to,
        clientId: message.clientId,
        kind: message.kind,
        content: message.text,
        mediaUrl: message.mediaUrl
      }));
    };
    const retryPendingMessages = () => {
      Object.values(msgsR.current).flat().filter(message => message.status === 'sending')
        .forEach(retryMessage);
    };
    const retryPending = () => {
      if (document.visibilityState !== 'visible') return;
      retryPendingMessages();
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
      const type = eventType(e);
      const acceptMessage = (rawMessage, clientId) => {
        const message = normalizeMessage({
          ...rawMessage,
          ...(clientId && !rawMessage.clientId ? { clientId } : {})
        });
        const existingKey = clientId && Object.entries(msgsR.current)
          .find(([, items]) => items.some(item => item.clientId === clientId))?.[0];
        const key = keyOf(message) || existingKey;
        if (!key) return message;
        setMsgs(state => ({ ...state, [key]: mergeMessage(state[key] || [], message) }));
        return message;
      };
      if (type === 'ready') {
        retryPendingMessages();
        const current = activeChatR.current;
        if (current && document.visibilityState === 'visible' && document.hasFocus()) {
          w.send({ type: 'MARK_READ', chatId: current.chatId || current.id });
          setChats(state => clearUnreadCount(state, current.chatId || current.id));
        }
      }
      if (e.t === 'online') setOnline(Object.fromEntries(e.ids.map(i => [i, true])));
      if (type === 'PRESENCE' || e.t === 'presence') {
        const id = e.userId || e.id;
        const isOnline = e.status ? e.status === 'ONLINE' : e.on;
        setOnline(current => ({ ...current, [id]: isOnline }));
        if (e.lastSeenAt) setLastSeen(current => ({ ...current, [id]: e.lastSeenAt }));
      }
      if (type === 'MESSAGE' || e.t === 'msg') {
        const message = acceptMessage(type === 'MESSAGE' ? e.message : e.m);
        if (message.from !== user.id) {
          playSound('messageReceived');
          w.send({ t: 'delivered', id: message.id });
          load();
        }
      }
      if (type === 'SEND_MESSAGE_ACK' || e.t === 'stored') {
        const message = acceptMessage(type === 'SEND_MESSAGE_ACK' ? e.message : e.m, e.clientId);
        playSound('messageSent');
        if (e.message?.chatId) {
          const conversationId = keyOf(message);
          setChats(state => ({
            ...state,
            chats: state.chats.map(chat => chat.id === conversationId ? { ...chat, chatId: e.message.chatId } : chat)
          }));
          setAct(current => current?.id === conversationId
            ? { ...current, chatId: e.message.chatId }
            : current);
        }
        load();
      }
      if (e.t === 'upd') {
        const message = normalizeMessage(e.m);
        const key = keyOf(message);
        setMsgs(state => ({ ...state, [key]: (state[key] || []).map(item => item.id === message.id ? message : item) }));
      }
      if (type === 'MESSAGES_READ') {
        const chat = chatsR.current.chats.find(item => item.chatId === e.chatId);
        const current = activeChatR.current;
        const key = chat?.id || (current?.chatId === e.chatId ? current.id : e.userId);
        setMsgs(state => ({ ...state, [key]: markOutgoingMessagesRead(state[key] || [], user.id, e.lastReadMessageAt) }));
      }
      if (e.t === 'seen') {
        const k = e.group || e.by;
        setMsgs(s => ({ ...s, [k]: markOutgoingMessagesRead(s[k] || [], user.id) }));
        load();
      }
      if (e.t === 'delivered') setMsgs(s => ({ ...s, [e.to]: (s[e.to] || []).map(m => m.status === 'sent' ? { ...m, status: 'delivered' } : m) }));
      if (type === 'TYPING_INDICATOR' || e.t === 'typing') {
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
        if (activeCallRef.current?.room === e.room) {
          answeredCallRef.current = e.room;
          stopSound('callOutgoing');
          playSound('callReceived');
        }
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
      typingTimers.current.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', retryPending);
      window.removeEventListener('pageshow', retryPending);
    };
  }, []);
  useEffect(() => {
    if (!chatsLoaded || restoredChat.current) return;
    restoredChat.current = true;
    let savedId;
    try {
      savedId = localStorage.getItem(`metufy-active-chat-${user.id}`);
    } catch (storageError) {
      console.warn('Could not restore the selected chat:', storageError);
      return;
    }
    const conversation = restoreConversation(
      [...chats.groups, ...chats.users],
      chats.chats,
      savedId
    );
    if (conversation) setAct(conversation);
  }, [chatsLoaded, chats.groups, chats.users, chats.chats, user.id]);
  useEffect(() => {
    if (!act) return;
    try {
      localStorage.setItem(`metufy-active-chat-${user.id}`, act.id);
    } catch (storageError) {
      console.warn('Could not save the selected chat:', storageError);
    }
  }, [act, user.id]);
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
    enableSounds('callOutgoing', true);
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
      if (answeredCallRef.current !== room) playSound('callOutgoing', true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      setCallSetupError(error.message);
    }
  };
  const acceptCall = async () => {
    if (!inv) return;
    setCallSetupError('');
    enableSounds('callIncoming', true);
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
  const allChats = [...chats.groups, ...chats.users];
  const list = allChats.filter(conversation => {
    if (chatFilter === 'direct') return !conversation.members;
    if (chatFilter === 'groups') return !!conversation.members;
    if (chatFilter === 'pinned') return pinnedChats.includes(conversation.id);
    return true;
  }).sort((first, second) => {
    if (chatFilter === 'pinned') return pinnedChats.indexOf(first.id) - pinnedChats.indexOf(second.id);
    const firstAt = chatMeta.get(first.id)?.lastMessageAt || '';
    const secondAt = chatMeta.get(second.id)?.lastMessageAt || '';
    return new Date(secondAt || 0) - new Date(firstAt || 0);
  });
  const togglePinned = id => setPinnedChats(current => {
    const next = current.includes(id) ? current.filter(chatId => chatId !== id) : [...current, id];
    try { localStorage.setItem(`metufy-pinned-${user.id}`, JSON.stringify(next)); } catch (storageError) { console.warn('Could not save pinned chats:', storageError); }
    return next;
  });
  return <ChatLayout className={`${dark ? 'chat-dark' : 'chat-light'} ${glassTheme.style === 'glass' ? 'chat-liquid-glass' : ''}`} style={glassStyle(glassTheme)}>
    <ChatList className={`${act ? 'chat-sidebar sidebar-hidden-mobile' : 'chat-sidebar'}`} style={{ '--sidebar-width': `${sidebarWidth}px` }}>
      <div className={`sidebar-top ${act ? 'mobile-chatlist-hidden' : ''}`}>
        <a className="sidebar-brand" href="#" aria-label="Metufy"><span className="brand-mark">m</span><b>metufy</b></a>
        <div className="sidebar-controls">
          <button onClick={toggleTheme} disabled={themeBusy} aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} title={`Switch to ${dark ? 'light' : 'dark'} theme`}>{themeBusy ? '…' : dark ? '☼' : '☾'}</button>
          <button onClick={() => setAccountOpen(true)} aria-label="Account settings" title="Account settings">⚙</button>
        </div>
      </div>
      <button className="profile-card profile-card-button" onClick={() => setAccountOpen(open => !open)} aria-label="Open profile and appearance settings">
        <Avatar url={user.avatarUrl} label={user.displayName} className="profile-avatar" style={{ background: ac }} />
        <span><b>{user.displayName}</b><small>@{user.username}</small></span>
        <i className="profile-online" title="Your account" />
      </button>
      {error && <p role="alert" className="sidebar-error">{error}</p>}
      <div className="search-row">
        <label className="search-wrap"><span>⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search username" aria-label="Search exact username" /><kbd>/</kbd></label>
        <button className="new-group-button" onClick={() => setModal('group')} aria-label="Create new group" title="Create new group">＋</button>
      </div>
      {!q && <div className="chat-filter-tabs" role="tablist" aria-label="Filter chats">
        {[['all', 'All'], ['pinned', 'Pinned'], ['direct', 'Direct'], ['groups', 'Groups']].map(([filter, label]) =>
          <button key={filter} role="tab" aria-selected={chatFilter === filter} className={chatFilter === filter ? 'chat-filter-active' : ''} onClick={() => setChatFilter(filter)}>{label}</button>
        )}
      </div>}
      <div className="sidebar-section-title">{q ? 'EXACT USERNAME MATCH' : 'CHATS'}<span>{!q && list.length}</span></div>
      <div className="sidebar-conversations">
        {(q ? res : list).map(c => <div key={c.id} className={`conversation-item ${act?.id === c.id ? 'conversation-active' : ''}`}>
          <button type="button" className="conversation-select" onClick={() => {
            const conversation = { ...c, chatId: chatMeta.get(c.id)?.chatId };
            setAct(conversation);
            try { localStorage.setItem(`metufy-active-chat-${user.id}`, conversation.id); } catch (storageError) { console.warn('Could not save the selected chat:', storageError); }
            setQ('');
          }}>
            <span className="conversation-avatar-wrap"><Avatar url={c.avatarUrl} label={c.name || c.displayName} className="conversation-avatar" style={{ background: ac }} />{!c.members && <i className={`conversation-online ${online[c.id] ? '' : 'conversation-offline'}`} title={online[c.id] ? 'Online' : 'Offline'} />}</span>
            <span className="conversation-info"><b>{c.name || c.displayName}</b><small>{q ? '@' + c.username : previewFor(c.id)}</small></span>
          </button>
          {!q && chatMeta.get(c.id)?.lastMessageAt && <time className="conversation-time">{new Date(chatMeta.get(c.id).lastMessageAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}
          {!q && <button type="button" className="conversation-pin-button" aria-label={pinnedChats.includes(c.id) ? 'Unpin chat' : 'Pin chat'} title={pinnedChats.includes(c.id) ? 'Unpin chat' : 'Pin chat'} onClick={() => togglePinned(c.id)}>{pinnedChats.includes(c.id) ? '★' : '☆'}</button>}
          {!q && chatMeta.get(c.id)?.unreadCount > 0 && <span className="conversation-unread-badge" title={`${chatMeta.get(c.id).unreadCount} unread messages`}>{chatMeta.get(c.id).unreadCount > 99 ? '99+' : chatMeta.get(c.id).unreadCount}</span>}
        </div>)}
        {q && !res.length && <p className="sidebar-empty">No exact username match for “{q}”. Search the complete username.</p>}
        {!q && !list.length && <p className="sidebar-empty">Search by username to start a conversation.</p>}
      </div>
      <div className="sidebar-bottom">
        <label className="sidebar-width-control"><span>Sidebar width</span><input type="range" min="260" max="420" step="10" value={sidebarWidth} onChange={e => setSidebarWidth(Number(e.target.value))} aria-label="Adjust sidebar width" /><span>{sidebarWidth}px</span></label>
        <button className="account-settings-button" onClick={() => setAccountOpen(true)}><span>⚙</span> Account <b>→</b></button>
      </div>
    </ChatList>
    {act ? <MessageThread key={act.id} act={act} user={user} list={msgs[act.id] || []} callLogs={callLogs[act.id] || []} ws={ws.current} online={online} lastSeen={lastSeen} typing={typing} dark={dark} ac={ac} onCall={startCall} onBack={() => setAct(null)} onToggleDetails={() => setAccountOpen(open => !open)} onMarkRead={chatId => setChats(state => ({ ...state, chats: clearUnreadCount(state.chats, chatId) }))} onPending={pending => setMsgs(s => ({ ...s, [act.id]: [...(s[act.id] || []), { ...pending, chatId: act.chatId || act.id }] }))} onSendFailure={(clientId, message) => { setMsgs(s => ({ ...s, [act.id]: (s[act.id] || []).filter(item => item.clientId !== clientId) })); setError(message); }} error={error} />
      : <div className="chat-welcome"><span className="welcome-mark">m</span><b>Your conversations, all together.</b><p>Search for someone by username and say hello.</p></div>}
    {accountOpen && <SettingsDrawer user={user} setUser={setUser} logout={logout} close={() => setAccountOpen(false)} activeChat={act} messages={act ? msgs[act.id] || [] : []} onProfileUpdate={load} />}
    {modal === 'group' && <NewGroup close={() => setModal(null)} done={load} />}
    {!soundReady && !inv && !call && <aside className={`sound-enable-prompt ${soundPromptDismissed ? 'sound-enable-compact' : ''}`} role="status">
      {!soundPromptDismissed && <div className="sound-enable-copy">
        <b>Enable Metufy sounds</b>
        <span>Tap once to allow message and call audio on this device.</span>
      </div>}
      {soundError && <span className="sound-enable-error" role="alert">{soundError}</span>}
      <button type="button" onClick={() => enableSounds()}>Enable sounds</button>
      {!soundPromptDismissed && <button type="button" className="sound-enable-dismiss" onClick={() => setSoundPromptDismissed(true)}>Not now</button>}
    </aside>}
    {callSetupError && !call && <div className="call-setup-error" role="alert"><span>{callSetupError}</span><button onClick={() => setCallSetupError('')} aria-label="Dismiss">×</button></div>}
    {inv && !call && <div className="incoming-call-backdrop">
      <section className="incoming-call-card" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
        <span className="incoming-call-avatar">{inv.fromName?.[0]?.toUpperCase() || '?'}</span>
        <span className="incoming-call-kicker">INCOMING {inv.video ? 'VIDEO' : 'VOICE'} CALL</span>
        <h2 id="incoming-call-title">{inv.fromName || 'Metufy contact'}</h2>
        <p>{inv.video ? 'Video call · microphone and camera access' : 'Voice call · microphone access'}</p>
        {!soundReady && <button className="incoming-sound-enable" onClick={() => enableSounds('callIncoming', true)}>Enable call sounds</button>}
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
  </ChatLayout>;
}
