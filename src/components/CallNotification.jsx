import { Phone, PhoneOff, Video } from 'lucide-react';

export default function CallNotification({ caller, video, error, soundError, onAccept, onDecline, onEnableSound }) {
  return <div className="incoming-call-backdrop">
    <section className="incoming-call-card call-notification-glass" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
      <div className="call-pulse-ring"><span className="incoming-call-avatar">{caller?.avatarUrl
        ? <img src={caller.avatarUrl} alt="" />
        : caller?.fromName?.[0]?.toUpperCase() || '?'}</span></div>
      <span className="incoming-call-kicker">INCOMING {video ? 'VIDEO' : 'VOICE'} CALL</span>
      <h2 id="incoming-call-title">{caller?.fromName || 'Metufy contact'}</h2>
      <p>{video ? 'Video call · microphone and camera access' : 'Voice call · microphone access'}</p>
      {soundError && <p className="incoming-call-error" role="alert">{soundError}</p>}
      {error && <p className="incoming-call-error" role="alert">{error}</p>}
      {onEnableSound && <button className="incoming-sound-enable" type="button" onClick={onEnableSound}>Enable call sounds</button>}
      <div className="incoming-call-actions">
        <button className="incoming-decline" type="button" onClick={onDecline}><span><PhoneOff /></span><small>Decline</small></button>
        <button className="incoming-accept" type="button" onClick={onAccept}><span>{video ? <Video /> : <Phone />}</span><small>Accept</small></button>
      </div>
    </section>
  </div>;
}
