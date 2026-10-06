import { useState } from 'react';
import {
  Camera, CameraOff, MessageCircle, Mic, MicOff, MonitorUp, PhoneOff, Settings2, PictureInPicture2
} from 'lucide-react';

export default function CallControls({
  muted,
  cameraOff,
  sharingScreen,
  video,
  audioLevel,
  devices,
  selectedDevices,
  onMute,
  onCamera,
  onScreenShare,
  onChat,
  chatOpen,
  onSelectDevice,
  onMinimize,
  onEnd
}) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  return <div className="call-control-dock" role="toolbar" aria-label="Call controls">
    <button type="button" className={`call-dock-button ${muted ? 'call-dock-muted' : ''}`}
      onClick={onMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
      {muted ? <MicOff /> : <Mic />}
      <small>{muted ? 'Unmute' : 'Mute'}</small>
      <span className="call-meter"><i style={{ transform: `scaleY(${Math.max(.08, audioLevel)})` }} /></span>
    </button>
    {video && <button type="button" className={`call-dock-button ${cameraOff ? 'call-dock-muted' : ''}`}
      onClick={onCamera} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}>
      {cameraOff ? <CameraOff /> : <Camera />}<small>{cameraOff ? 'Camera on' : 'Camera'}</small>
    </button>}
    {video && <button type="button" className={`call-dock-button ${sharingScreen ? 'call-dock-selected' : ''}`}
      onClick={onScreenShare} aria-label={sharingScreen ? 'Stop screen sharing' : 'Share screen'}>
      <MonitorUp /><small>{sharingScreen ? 'Stop share' : 'Share'}</small>
    </button>}
    <button type="button" className={`call-dock-button ${chatOpen ? 'call-dock-selected' : ''}`}
      onClick={onChat} aria-label={chatOpen ? 'Close in-call chat' : 'Open in-call chat'}>
      <MessageCircle /><small>Chat</small>
    </button>
    <div className="call-device-control">
      <button type="button" className={`call-dock-button ${devicesOpen ? 'call-dock-selected' : ''}`}
        onClick={() => setDevicesOpen(open => !open)} aria-expanded={devicesOpen} aria-label="Select call devices">
        <Settings2 /><small>Devices</small>
      </button>
      {devicesOpen && <div className="call-device-menu">
        {[
          ['audioinput', 'Microphone'],
          ...(video ? [['videoinput', 'Camera']] : []),
          ['audiooutput', 'Speaker']
        ].map(([kind, label]) => <label key={kind}>{label}
          <select value={selectedDevices[kind]} onChange={event => onSelectDevice(kind, event.target.value)}>
            <option value="">System default</option>
            {(devices[kind] || []).map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>
              {device.label || `${label} ${index + 1}`}
            </option>)}
          </select>
        </label>)}
      </div>}
    </div>
    <button type="button" className="call-dock-button" onClick={onMinimize} aria-label="Minimize call">
      <PictureInPicture2 /><small>Minimize</small>
    </button>
    <button type="button" className="call-dock-end" onClick={onEnd} aria-label="End call">
      <PhoneOff /><small>End</small>
    </button>
  </div>;
}
