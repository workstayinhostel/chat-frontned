import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, VideoOff } from 'lucide-react';

function VideoTile({ stream, label, avatarUrl, local, videoEnabled, cameraOff, speaking, audioLevel, flipSelf, onFlipSelf, onPlaybackError, outputDevice, videoFit, showVideoLabel }) {
  const video = useRef(null);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const videoTrack = stream?.getVideoTracks().find(track => track.readyState === 'live');
  useEffect(() => {
    const element = video.current;
    if (!element || !stream) return;
    let live = true;
    setShowTapToPlay(false);
    element.srcObject = stream;
    if (outputDevice && typeof element.setSinkId === 'function') {
      element.setSinkId(outputDevice).catch(error => onPlaybackError(`Could not select speaker: ${error.message}`));
    }
    element.play().catch(error => {
      if (!live) return;
      setShowTapToPlay(true);
      onPlaybackError(`Video playback needs permission: ${error.message}`);
    });
    return () => { live = false; };
  }, [onPlaybackError, outputDevice, stream]);

  return <article className={`call-video-tile ${local ? 'call-video-self' : 'call-video-remote'} ${speaking ? 'call-speaker-active' : ''} ${videoEnabled ? '' : 'call-audio-tile'}`}>
    {(!cameraOff || !videoEnabled) && <video ref={video} autoPlay playsInline muted={local}
      className={`${flipSelf && local ? 'call-video-flipped' : ''} ${!videoEnabled ? 'call-audio-stream' : ''}`}
      style={{ objectFit: local || videoFit === 'fill' ? 'cover' : 'contain' }} />}
    {showTapToPlay && videoEnabled && <button type="button" className="call-video-tap-to-play"
      onClick={() => {
        const element = video.current;
        if (!element) return;
        element.play().then(() => setShowTapToPlay(false)).catch(error =>
          onPlaybackError(`Video playback is still blocked: ${error.message}`)
        );
      }}>{local ? 'Tap to start camera preview' : 'Tap to play video'}</button>}
    {(!videoEnabled || cameraOff || !videoTrack) &&
      <div className={`call-video-placeholder ${!videoEnabled ? 'call-audio-placeholder' : ''}`}>
        <span className={`call-avatar-orb ${speaking ? 'call-avatar-speaking' : ''}`}
          style={{ '--voice-scale': `${1 + Math.min(audioLevel, 0.8) * 0.28}` }}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : label?.[0]?.toUpperCase() || '?'}
        </span>
        {(!videoEnabled || cameraOff || !videoTrack) && <small>{cameraOff ? 'Camera off' : label || 'Participant'}</small>}
      </div>}
    {local && <button className="call-self-flip" type="button" onClick={onFlipSelf} aria-label={flipSelf ? 'Unflip self view' : 'Flip self view'}>↔</button>}
    {videoEnabled && showVideoLabel && <div className="call-video-label">
      <span>{local ? 'You' : label || 'Participant'}</span>
      {local && <span className="call-audio-level" aria-label={`Microphone level ${Math.round(audioLevel * 100)} percent`}>
        <i style={{ transform: `scaleY(${Math.max(.08, audioLevel)})` }} />
        {audioLevel > .05 ? <Mic size={13} /> : <MicOff size={13} />}
      </span>}
      {!local && !videoTrack && <VideoOff size={13} />}
    </div>}
  </article>;
}

export default function VideoGrid({
  streams,
  localStream,
  video,
  user,
  cameraOff,
  participants = {},
  participantAvatars = {},
  speaking = {},
  levels = {},
  videoFit = 'fit',
  hiddenSelf,
  flipSelf,
  onFlipSelf,
  onPlaybackError,
  outputDevice
}) {
  const remote = Object.entries(streams);
  const people = [
    ...(!hiddenSelf && localStream ? [['local', localStream]] : []),
    ...remote
  ];
  const oneToOne = video && remote.length === 1 && localStream && !hiddenSelf;
  return <div className={`call-video-grid ${video ? 'call-video-grid-video' : 'call-video-grid-audio'} ${oneToOne ? 'call-video-grid-one-to-one' : ''}`}
    style={{ '--call-columns': people.length < 2 ? 1 : people.length < 5 ? 2 : 3 }}>
    {remote.map(([id, stream]) => <VideoTile key={id} stream={stream} label={participants[id]} avatarUrl={participantAvatars[id]}
      videoEnabled={video} videoFit={videoFit} showVideoLabel={!oneToOne} audioLevel={levels[id] || 0}
      local={false} cameraOff={false} speaking={Date.now() - (speaking[id] || 0) < 1200}
      onPlaybackError={onPlaybackError} outputDevice={outputDevice} />)}
    {!hiddenSelf && localStream && <VideoTile key="local" stream={localStream} label={user?.displayName || 'You'} avatarUrl={user?.avatarUrl}
      videoEnabled={video} videoFit={videoFit} showVideoLabel={false} local cameraOff={cameraOff} speaking={Date.now() - (speaking.local || 0) < 1200}
      audioLevel={levels.local || 0} flipSelf={flipSelf} onFlipSelf={onFlipSelf}
      onPlaybackError={onPlaybackError} outputDevice={outputDevice} />}
    {!people.length && <div className="call-empty-stage">Waiting for participants to join…</div>}
  </div>;
}
