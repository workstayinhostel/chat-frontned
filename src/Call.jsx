import { useWebRTC } from './hooks/useWebRTC.js';
import CallWindow from './components/CallWindow.jsx';

export default function Call({ ws, room, video, localStream, user, name, chatId, participants, participantAvatars, onEnd, onCallJoinFailure }) {
  const media = useWebRTC({ ws, room, localStream, onEnd, onCallJoinFailure });
  return <CallWindow
    call={{ room, video, localStream, media, user, name, chatId, participants, participantAvatars }}
    user={user}
    ws={ws}
    onEnd={onEnd}
  />;
}
