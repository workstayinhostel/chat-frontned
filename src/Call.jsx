import { useEffect, useRef, useState } from 'react';

function RemoteVideo({ stream, onPlaybackError }) {
  const video = useRef(null);
  const playbackError = useRef(onPlaybackError);
  playbackError.current = onPlaybackError;
  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = stream;
    video.current.play().catch(() => playbackError.current());
  }, [stream]);
  return <video ref={video} autoPlay playsInline className="call-remote-video" />;
}

export default function Call({ ws, room, video, localStream, onEnd }) {
  const peers = useRef({});
  const pendingIce = useRef({});
  const localVideo = useRef(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [streams, setStreams] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callStatus, setCallStatus] = useState('Connecting securely…');
  const [callError, setCallError] = useState('');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const createPeer = id => {
    const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(track => connection.addTrack(track, localStream));
    connection.onicecandidate = event => {
      if (event.candidate && !ws.send({ type: 'WEBRTC_SIGNAL', to: id, room, signal: { ice: event.candidate } })) {
        setCallError('Call connection was interrupted. Please hang up and try again.');
      }
    };
    connection.ontrack = event => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setStreams(current => ({ ...current, [id]: stream }));
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        setCallStatus('Connected');
        setCallError('');
      } else if (connection.connectionState === 'connecting') {
        setCallStatus('Connecting…');
      } else if (connection.connectionState === 'failed') {
        setCallStatus('Connection failed');
        setCallError('Could not reach the other device. Check the network and try again.');
      } else if (connection.connectionState === 'disconnected') {
        setCallStatus('Reconnecting…');
      }
    };
    peers.current[id] = connection;
    pendingIce.current[id] = [];
    return connection;
  };

  useEffect(() => {
    let off;
    const run = async () => {
      if (!localStream) {
        setCallError('Microphone or camera permission is required to join.');
        return;
      }
      if (localVideo.current) localVideo.current.srcObject = localStream;
      off = ws.sub(async event => {
        if (event.room !== room) return;
        const signal = event.type === 'WEBRTC_SIGNAL' ? event.signal : event.d;
        try {
          if (event.t === 'call-peers') {
            for (const id of event.ids) {
              const peer = peers.current[id] || createPeer(id);
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              if (!ws.send({ type: 'WEBRTC_SIGNAL', to: id, room, signal: { sdp: peer.localDescription } })) {
                setCallError('Call connection was interrupted. Please hang up and try again.');
              }
            }
          } else if (event.type === 'WEBRTC_SIGNAL' || event.t === 'sig') {
            const peer = peers.current[event.from] || createPeer(event.from);
            if (signal.sdp) {
              await peer.setRemoteDescription(signal.sdp);
              for (const candidate of pendingIce.current[event.from] || []) {
                await peer.addIceCandidate(candidate);
              }
              pendingIce.current[event.from] = [];
              if (signal.sdp.type === 'offer') {
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                if (!ws.send({ type: 'WEBRTC_SIGNAL', to: event.from, room, signal: { sdp: peer.localDescription } })) {
                  setCallError('Call connection was interrupted. Please hang up and try again.');
                }
              }
            } else if (signal.ice) {
              if (peer.remoteDescription) await peer.addIceCandidate(signal.ice);
              else pendingIce.current[event.from].push(signal.ice);
            }
          } else if (event.t === 'call-joined') {
            setCallStatus('Ringing…');
          } else if (event.t === 'call-left') {
            peers.current[event.id]?.close();
            delete peers.current[event.id];
            delete pendingIce.current[event.id];
            setStreams(current => {
              const next = { ...current };
              delete next[event.id];
              return next;
            });
          } else if (event.t === 'call-ended') {
            onEndRef.current();
          }
        } catch (error) {
          setCallError(`Could not establish the call: ${error.message}`);
        }
      });
      if (!ws.send({ t: 'call-join', room })) setCallError('Reconnecting to Metufy. Please try the call again.');
    };

    run().catch(error => setCallError(error.message || 'Could not start the call.'));
    return () => {
      off?.();
      ws.send({ t: 'call-leave', room });
      Object.values(peers.current).forEach(peer => peer.close());
      peers.current = {};
      pendingIce.current = {};
      localStream?.getTracks().forEach(track => track.stop());
    };
  }, [room, ws, localStream]);

  const toggleMute = () => {
    const tracks = localStream?.getAudioTracks() || [];
    tracks.forEach(track => { track.enabled = muted; });
    setMuted(!muted);
  };
  const toggleCamera = () => {
    const tracks = localStream?.getVideoTracks() || [];
    tracks.forEach(track => { track.enabled = cameraOff; });
    setCameraOff(!cameraOff);
  };
  const remotePeers = Object.keys(streams);

  return <div className="call-overlay">
    <header className="call-header">
      <span className="call-live-dot" />
      <div><b>{video ? 'Video call' : 'Voice call'}</b><small>{callStatus} · {remotePeers.length + 1} participant{remotePeers.length ? 's' : ''}</small></div>
      <button onClick={onEnd} className="call-close" aria-label="End call">×</button>
    </header>
    {callError && <p className="call-error" role="alert">{callError}</p>}
    {playbackBlocked && <button className="call-audio-enable" onClick={() => {
      document.querySelectorAll('.call-remote-video').forEach(element => element.play().catch(() => {}));
      setPlaybackBlocked(false);
    }}>Tap to enable call audio</button>}
    <div className={`call-stage ${video ? 'call-stage-video' : 'call-stage-audio'}`} style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, remotePeers.length))}, minmax(0, 1fr))` }}>
      {remotePeers.length
        ? remotePeers.map(id => video
          ? <RemoteVideo key={id} stream={streams[id]} onPlaybackError={() => setPlaybackBlocked(true)} />
          : <div className="call-audio-participant" key={id}>
            <RemoteVideo stream={streams[id]} onPlaybackError={() => setPlaybackBlocked(true)} />
            <span className="incoming-call-avatar">☎</span><b>Voice connected</b><small>Audio is live</small>
          </div>)
        : <div className="call-ringing"><span className="incoming-call-avatar">{video ? '▣' : '☎'}</span><b>{callStatus === 'Connected' ? 'Call connected' : 'Waiting for them to join…'}</b><small>Your microphone is ready</small></div>}
    </div>
    {video && <div className="call-self-view"><video ref={localVideo} autoPlay muted playsInline /><span>You</span></div>}
    <div className="call-controls">
      <button onClick={toggleMute} className={muted ? 'call-control call-control-muted' : 'call-control'} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}><span>{muted ? '♩̸' : '♩'}</span><small>{muted ? 'Unmute' : 'Mute'}</small></button>
      {video && <button onClick={toggleCamera} className={cameraOff ? 'call-control call-control-muted' : 'call-control'} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}><span>▣</span><small>{cameraOff ? 'Camera on' : 'Camera off'}</small></button>}
      <button onClick={onEnd} className="call-end-button" aria-label="Hang up"><span>☎</span><small>Leave call</small></button>
    </div>
  </div>;
}
