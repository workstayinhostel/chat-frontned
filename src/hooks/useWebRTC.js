import { useCallback, useEffect, useRef, useState } from 'react';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CALL_EVENTS = new Set(['call-invite', 'call-join', 'call-leave', 'call-decline', 'WEBRTC_SIGNAL', 'sig']);
const MAX_CALL_JOIN_RETRIES = 4;

export function isCallSignalingError(event, room) {
  return event?.t === 'error' &&
    (!event.room || event.room === room) &&
    (!event.eventType || CALL_EVENTS.has(event.eventType));
}

export function shouldRetryCallJoin(event, room) {
  return event?.t === 'error' &&
    event.error === 'Call invite required' &&
    (!event.room || event.room === room) &&
    (!event.eventType || event.eventType === 'call-join');
}

export function useWebRTC({ ws, room, localStream, onEnd }) {
  const peers = useRef(new Map());
  const pendingIce = useRef(new Map());
  const disconnectTimers = useRef(new Map());
  const joinRetryTimer = useRef(null);
  const joinAttempts = useRef(0);
  const displayStream = useRef(null);
  const videoSenders = useRef(new Map());
  const onEndRef = useRef(onEnd);
  const audioContext = useRef(null);
  const meterFrames = useRef(new Map());
  const [streams, setStreams] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [displayPreview, setDisplayPreview] = useState(null);
  const [callStatus, setCallStatus] = useState('Connecting securely…');
  const [callError, setCallError] = useState('');
  const [levels, setLevels] = useState({});
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  const [selectedDevices, setSelectedDevices] = useState({ audioinput: '', videoinput: '', audiooutput: '' });
  const [canShareScreen] = useState(() => Boolean(navigator.mediaDevices?.getDisplayMedia));
  const [deviceError, setDeviceError] = useState('');
  onEndRef.current = onEnd;

  const sendSignal = useCallback((peerId, signal) => {
    if (!ws.send({ type: 'WEBRTC_SIGNAL', to: peerId, room, signal })) {
      setCallError('Call signaling was interrupted. Reconnect and try again.');
    }
  }, [room, ws]);

  const createPeer = useCallback(peerId => {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    for (const track of localStream?.getTracks() || []) {
      const sender = connection.addTrack(track, localStream);
      if (track.kind === 'video') videoSenders.current.set(peerId, sender);
    }
    connection.onicecandidate = event => {
      if (event.candidate) sendSignal(peerId, { ice: event.candidate });
    };
    connection.ontrack = event => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setStreams(current => ({ ...current, [peerId]: stream }));
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        clearTimeout(disconnectTimers.current.get(peerId));
        disconnectTimers.current.delete(peerId);
        setCallStatus('Connected');
        setCallError('');
      } else if (connection.connectionState === 'connecting') {
        setCallStatus('Connecting…');
      } else if (connection.connectionState === 'failed') {
        setCallStatus('Reconnecting…');
        try {
          connection.restartIce();
          connection.createOffer({ iceRestart: true })
            .then(offer => connection.setLocalDescription(offer))
            .then(() => sendSignal(peerId, { sdp: connection.localDescription }))
            .catch(error => setCallError(`Could not reconnect the call: ${error.message}`));
        } catch (error) {
          setCallError(`Could not reconnect the call: ${error.message}`);
        }
      } else if (connection.connectionState === 'disconnected') {
        setCallStatus('Reconnecting…');
        clearTimeout(disconnectTimers.current.get(peerId));
        disconnectTimers.current.set(peerId, setTimeout(() => {
          if (connection.connectionState === 'disconnected') {
            try { connection.restartIce(); } catch (error) {
              setCallError(`Could not restart the call connection: ${error.message}`);
            }
          }
        }, 5000));
      }
    };
    peers.current.set(peerId, connection);
    pendingIce.current.set(peerId, []);
    return connection;
  }, [localStream, sendSignal]);

  const closePeer = useCallback(peerId => {
    clearTimeout(disconnectTimers.current.get(peerId));
    disconnectTimers.current.delete(peerId);
    peers.current.get(peerId)?.close();
    peers.current.delete(peerId);
    pendingIce.current.delete(peerId);
    videoSenders.current.delete(peerId);
    setStreams(current => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
    setLevels(current => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ws || !room || !localStream) {
      setCallError('Microphone or camera permission is required to join.');
      return undefined;
    }
    let live = true;
    const handleEvent = async event => {
      if (event.t === 'error') {
        if (shouldRetryCallJoin(event, room)) {
          if (joinAttempts.current >= MAX_CALL_JOIN_RETRIES) {
            setCallStatus('Call could not connect');
            setCallError('Could not join the call. Please end the call and try again.');
            return;
          }
          const delay = 200 * (2 ** joinAttempts.current);
          joinAttempts.current += 1;
          setCallStatus('Joining call…');
          clearTimeout(joinRetryTimer.current);
          joinRetryTimer.current = setTimeout(() => {
            if (live && !ws.send({ t: 'call-join', room })) {
              setCallStatus('Call could not connect');
              setCallError('Reconnecting to Metufy. Please try the call again.');
            }
          }, delay);
          return;
        }
        if (isCallSignalingError(event, room)) {
          setCallStatus('Call could not connect');
          setCallError(event.error || 'The call could not be connected. Please try again.');
        }
        return;
      }
      if (event.room !== room) return;
      try {
        if (event.t === 'call-peers') {
          clearTimeout(joinRetryTimer.current);
          joinRetryTimer.current = null;
          joinAttempts.current = 0;
          setCallError('');
          for (const peerId of event.ids || []) {
            const peer = peers.current.get(peerId) || createPeer(peerId);
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            sendSignal(peerId, { sdp: peer.localDescription });
          }
        } else if (event.type === 'WEBRTC_SIGNAL' || event.t === 'sig') {
          const peerId = event.from;
          if (!peerId) return;
          const peer = peers.current.get(peerId) || createPeer(peerId);
          const signal = event.type === 'WEBRTC_SIGNAL' ? event.signal : event.d;
          if (signal?.sdp) {
            await peer.setRemoteDescription(signal.sdp);
            const candidates = pendingIce.current.get(peerId) || [];
            pendingIce.current.set(peerId, []);
            for (const candidate of candidates) await peer.addIceCandidate(candidate);
            if (signal.sdp.type === 'offer') {
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              sendSignal(peerId, { sdp: peer.localDescription });
            }
          } else if (signal?.ice) {
            if (peer.remoteDescription) await peer.addIceCandidate(signal.ice);
            else pendingIce.current.get(peerId)?.push(signal.ice);
          }
        } else if (event.t === 'call-joined') {
          setCallStatus('Connecting…');
        } else if (event.t === 'call-left') {
          closePeer(event.id);
        } else if (event.t === 'call-ended') {
          onEndRef.current();
        }
      } catch (error) {
        if (live) setCallError(`Could not establish the call: ${error.message}`);
      }
    };
    const unsubscribe = ws.sub(handleEvent);
    if (!ws.send({ t: 'call-join', room })) setCallError('Reconnecting to Metufy. Please try the call again.');
    return () => {
      live = false;
      clearTimeout(joinRetryTimer.current);
      joinRetryTimer.current = null;
      unsubscribe();
      ws.send({ t: 'call-leave', room });
      for (const peerId of peers.current.keys()) closePeer(peerId);
      displayStream.current?.getTracks().forEach(track => track.stop());
      displayStream.current = null;
      localStream.getTracks().forEach(track => track.stop());
    };
  }, [closePeer, createPeer, localStream, room, sendSignal, ws]);

  useEffect(() => {
    const refreshDevices = () => navigator.mediaDevices?.enumerateDevices()
      .then(all => setDevices({
        audioinput: all.filter(device => device.kind === 'audioinput'),
        videoinput: all.filter(device => device.kind === 'videoinput'),
        audiooutput: all.filter(device => device.kind === 'audiooutput')
      }))
      .catch(error => setDeviceError(`Could not list devices: ${error.message}`));
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, []);

  useEffect(() => {
    const sources = [...Object.entries(streams), ['local', localStream]];
    const activeMeters = new Set();
    for (const [id, stream] of sources) {
      if (!stream || meterFrames.current.has(id)) continue;
      try {
        const context = audioContext.current || new AudioContext();
        audioContext.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const measure = () => {
          analyser.getByteFrequencyData(samples);
          const level = samples.reduce((sum, sample) => sum + sample, 0) / samples.length / 255;
          const meter = meterFrames.current.get(id);
          const now = performance.now();
          if (!meter.lastPublished || now - meter.lastPublished >= 100) {
            setLevels(current => ({ ...current, [id]: level }));
            if (level > 0.12) setSpeaking(current => ({ ...current, [id]: Date.now() }));
            meter.lastPublished = now;
          }
          const frame = requestAnimationFrame(measure);
          meter.frame = frame;
        };
        const frame = requestAnimationFrame(measure);
        meterFrames.current.set(id, { frame, source, lastPublished: 0 });
      } catch (error) {
        setCallError(`Audio activity detection is unavailable: ${error.message}`);
      }
      activeMeters.add(id);
    }
    for (const [id, meter] of meterFrames.current) {
      if (!activeMeters.has(id)) {
        cancelAnimationFrame(meter.frame);
        meter.source.disconnect();
        meterFrames.current.delete(id);
        setLevels(current => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    }
  }, [localStream, streams]);

  const [speaking, setSpeaking] = useState({});
  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    localStream?.getAudioTracks().forEach(track => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }, [localStream, muted]);

  const toggleCamera = useCallback(() => {
    const nextOff = !cameraOff;
    localStream?.getVideoTracks().forEach(track => { track.enabled = !nextOff; });
    setCameraOff(nextOff);
  }, [cameraOff, localStream]);

  const replaceVideoTrack = useCallback(async track => {
    await Promise.all([...videoSenders.current.values()].map(sender => sender.replaceTrack(track)));
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (displayStream.current) {
      try {
        const cameraTrack = localStream.getVideoTracks()[0];
        if (cameraTrack) await replaceVideoTrack(cameraTrack);
        displayStream.current.getTracks().forEach(track => track.stop());
        displayStream.current = null;
        setDisplayPreview(null);
        setSharingScreen(false);
      } catch (error) {
        setDeviceError(`Could not stop screen sharing: ${error.message}`);
      }
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setDeviceError('Screen sharing is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen video track was provided.');
      displayStream.current = stream;
      setDisplayPreview(stream);
      await replaceVideoTrack(screenTrack);
      screenTrack.onended = () => {
        const cameraTrack = localStream.getVideoTracks()[0];
        if (cameraTrack) replaceVideoTrack(cameraTrack).catch(error => setDeviceError(error.message));
        displayStream.current = null;
        setDisplayPreview(null);
        setSharingScreen(false);
      };
      setSharingScreen(true);
      setCameraOff(false);
    } catch (error) {
      if (error.name !== 'NotAllowedError') setDeviceError(`Could not share the screen: ${error.message}`);
    }
  }, [localStream, replaceVideoTrack]);

  const selectDevice = useCallback(async (kind, deviceId) => {
    setDeviceError('');
    if (kind === 'audiooutput') {
      setSelectedDevices(current => ({ ...current, audiooutput: deviceId }));
      return;
    }
    try {
      const replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: kind === 'audioinput' ? deviceId ? { deviceId: { exact: deviceId } } : true : false,
        video: kind === 'videoinput' ? deviceId ? { deviceId: { exact: deviceId } } : true : false
      });
      const replacement = kind === 'audioinput'
        ? replacementStream.getAudioTracks()[0]
        : replacementStream.getVideoTracks()[0];
      if (!replacement) throw new Error('The selected device did not provide a media track.');
      const senders = [...peers.current.values()].flatMap(peer => peer.getSenders());
      await Promise.all(senders.filter(sender => sender.track?.kind === replacement.kind)
        .map(sender => sender.replaceTrack(replacement)));
      localStream.getTracks().filter(track => track.kind === replacement.kind).forEach(track => {
        localStream.removeTrack(track);
        track.stop();
      });
      localStream.addTrack(replacement);
      setSelectedDevices(current => ({ ...current, [kind]: deviceId }));
      replacementStream.getTracks().filter(track => track !== replacement).forEach(track => track.stop());
    } catch (error) {
      setDeviceError(`Could not change device: ${error.message}`);
    }
  }, [localStream]);

  const switchCamera = useCallback(async () => {
    setDeviceError('');
    try {
      const currentTrack = localStream?.getVideoTracks()[0];
      if (!currentTrack) throw new Error('No active camera is available to switch.');
      if (displayStream.current) throw new Error('Stop screen sharing before switching cameras.');
      const facingMode = currentTrack.getSettings().facingMode;
      const nextFacingMode = facingMode === 'environment' ? 'user' : 'environment';
      const replacementStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacingMode } },
        audio: false
      });
      let replacement = replacementStream.getVideoTracks()[0];
      if (!replacement) throw new Error('The other camera did not provide a video track.');
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = allDevices.filter(device => device.kind === 'videoinput');
      const currentDeviceId = currentTrack.getSettings().deviceId;
      if (currentDeviceId && replacement.getSettings().deviceId === currentDeviceId && cameras.length > 1) {
        replacement.stop();
        replacementStream.getTracks().filter(track => track !== replacement).forEach(track => track.stop());
        const currentIndex = cameras.findIndex(device => device.deviceId === currentDeviceId);
        const nextCamera = cameras[(currentIndex + 1) % cameras.length];
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextCamera.deviceId } },
          audio: false
        });
        replacement = fallbackStream.getVideoTracks()[0];
        if (!replacement) throw new Error('The selected camera did not provide a video track.');
      }
      replacement.enabled = !cameraOff;
      await replaceVideoTrack(replacement);
      localStream.removeTrack(currentTrack);
      currentTrack.stop();
      localStream.addTrack(replacement);
      const deviceId = replacement.getSettings().deviceId || '';
      setSelectedDevices(current => ({ ...current, videoinput: deviceId }));
      setDevices(current => ({
        ...current,
        videoinput: allDevices.filter(device => device.kind === 'videoinput')
      }));
    } catch (error) {
      setDeviceError(`Could not switch camera: ${error.message}`);
    }
  }, [cameraOff, localStream, replaceVideoTrack]);

  useEffect(() => () => {
    for (const meter of meterFrames.current.values()) {
      cancelAnimationFrame(meter.frame);
      meter.source.disconnect();
    }
    meterFrames.current.clear();
    audioContext.current?.close().catch(error => console.warn('Could not close audio meter:', error));
  }, []);

  return {
    streams,
    localPreviewStream: displayPreview || localStream,
    peers: [...peers.current.keys()],
    muted,
    cameraOff,
    sharingScreen,
    callStatus,
    callError,
    setCallError,
    levels,
    speaking,
    selectedDevices,
    devices,
    deviceError,
    setDeviceError,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    selectDevice,
    switchCamera,
    canShareScreen
  };
}
