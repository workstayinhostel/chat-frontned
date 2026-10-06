import { useEffect, useRef } from 'react';
import { Mic, MicOff, VideoOff } from 'lucide-react';

function VideoTile({ id, stream, label, local, cameraOff, speaking, audioLevel, flipSelf, onFlipSelf, onPlaybackError, outputDevice }) {
  const video = useRef(null);
  useEffect(() => {
    const element = video.current;
    if (!element || !stream) return;
    element.srcObject = stream;
    if (outputDevice && typeof element.setSinkId === 'function') {
      element.setSinkId(outputDevice).catch(error => onPlaybackError(`Could not select speaker: ${error.message}`));
    }
    element.play().catch(error => onPlaybackError(`Video playback needs permission: ${error.message}`));
  }, [onPlaybackError, outputDevice, stream]);

  return <article className={`call-video-tile ${local ? 'call-video-self' : 'call-video-remote'} ${speaking ? 'call-speaker-active' : ''}`}>
    {!cameraOff && <video ref={video} autoPlay playsInline muted={local} className={flipSelf && local ? 'call-video-flipped' : ''} />}
    {(cameraOff || !stream?.getVideoTracks().some(track => track.readyState === 'live')) &&
      <div className="call-video-placeholder"><span>{label?.[0]?.toUpperCase() || '?'}</span><small>{cameraOff ? 'Camera off' : label}</small></div>}
    {local && <button className="call-self-flip" type="button" onClick={onFlipSelf} aria-label={flipSelf ? 'Unflip self view' : 'Flip self view'}>↔</button>}
    <div className="call-video-label">
      <span>{local ? 'You' : label || 'Participant'}</span>
      {local && <span className="call-audio-level" aria-label={`Microphone level ${Math.round(audioLevel * 100)} percent`}>
        <i style={{ transform: `scaleY(${Math.max(.08, audioLevel)})` }} />
        {audioLevel > .05 ? <Mic size={13} /> : <MicOff size={13} />}
      </span>}
      {!local && !stream?.getVideoTracks().some(track => track.readyState === 'live') && <VideoOff size={13} />}
    </div>
  </article>;
}

export default function VideoGrid({
  streams,
  localStream,
  video,
  cameraOff,
  participants = {},
  speaking = {},
  levels = {},
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
    {remote.map(([id, stream]) => <VideoTile key={id} id={id} stream={stream} label={participants[id]}
      local={false} cameraOff={false} speaking={Date.now() - (speaking[id] || 0) < 1200}
      onPlaybackError={onPlaybackError} outputDevice={outputDevice} />)}
    {!hiddenSelf && localStream && <VideoTile key="local" id="local" stream={localStream} label="You"
      local cameraOff={cameraOff} speaking={Date.now() - (speaking.local || 0) < 1200}
      audioLevel={levels.local || 0} flipSelf={flipSelf} onFlipSelf={onFlipSelf}
      onPlaybackError={onPlaybackError} outputDevice={outputDevice} />}
    {!people.length && <div className="call-empty-stage">Waiting for participants to join…</div>}
  </div>;
}
