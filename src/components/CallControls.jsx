import { useState } from 'react';
import {
  Camera, CameraOff, MessageCircle, Mic, MicOff, MonitorUp, MoreHorizontal,
  PhoneOff, PictureInPicture2, Settings2, SwitchCamera
} from 'lucide-react';

function DeviceMenu({ video, devices, selectedDevices, onSelectDevice }) {
  return <div className="call-device-menu">
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
  </div>;
}

export default function CallControls({
  muted,
  cameraOff,
  sharingScreen,
  video,
  audioLevel,
  devices,
  selectedDevices,
  canShareScreen,
  onMute,
  onCamera,
  onScreenShare,
  onSwitchCamera,
  onChat,
  chatOpen,
  onSelectDevice,
  onMinimize,
  onEnd
}) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const deviceMenu = <DeviceMenu video={video} devices={devices} selectedDevices={selectedDevices} onSelectDevice={onSelectDevice} />;
  return <div className="call-control-dock" role="toolbar" aria-label="Call controls">
    <button type="button" className={`call-dock-button ${muted ? 'call-dock-muted' : ''}`}
      onClick={onMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'}>
      <span className="call-dock-icon">{muted ? <MicOff /> : <Mic />}</span>
      <small>{muted ? 'Unmute' : 'Mute'}</small>
      <span className="call-meter"><i style={{ transform: `scaleY(${Math.max(.08, audioLevel)})` }} /></span>
    </button>
    {video && <>
      <button type="button" className={`call-dock-button ${cameraOff ? 'call-dock-muted' : ''}`}
        onClick={onCamera} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>
        <span className="call-dock-icon">{cameraOff ? <CameraOff /> : <Camera />}</span><small>{cameraOff ? 'Camera on' : 'Camera off'}</small>
      </button>
      <button type="button" className={`call-dock-button ${sharingScreen ? 'call-dock-selected' : ''}`}
        onClick={onScreenShare} disabled={!canShareScreen && !sharingScreen}
        aria-label={sharingScreen ? 'Stop screen sharing' : 'Share screen'}
        title={canShareScreen ? sharingScreen ? 'Stop screen sharing' : 'Share screen' : 'Screen sharing is not available in this browser'}>
        <span className="call-dock-icon"><MonitorUp /></span><small>{sharingScreen ? 'Stop share' : 'Share'}</small>
      </button>
      <button type="button" className="call-dock-button call-dock-switch-camera" onClick={onSwitchCamera}
        aria-label="Switch front or rear camera" title="Switch front or rear camera">
        <span className="call-dock-icon"><SwitchCamera /></span><small>Flip camera</small>
      </button>
    </>}
    <div className="call-extra-controls">
      <button type="button" className={`call-dock-button ${chatOpen ? 'call-dock-selected' : ''}`}
        onClick={onChat} aria-label={chatOpen ? 'Close in-call chat' : 'Open in-call chat'}
        title={chatOpen ? 'Close in-call chat' : 'Open in-call chat'}>
        <span className="call-dock-icon"><MessageCircle /></span><small>Chat</small>
      </button>
      <div className="call-device-control">
        <button type="button" className={`call-dock-button ${devicesOpen ? 'call-dock-selected' : ''}`}
          onClick={() => setDevicesOpen(open => !open)} aria-expanded={devicesOpen}
          aria-label="Select call devices" title="Select call devices">
          <span className="call-dock-icon"><Settings2 /></span><small>Devices</small>
        </button>
        {devicesOpen && deviceMenu}
      </div>
    </div>
    <div className="call-mobile-more">
      <button type="button" className={`call-dock-button ${moreOpen ? 'call-dock-selected' : ''}`}
        onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen}
        aria-label="More call options" title="More call options">
        <span className="call-dock-icon"><MoreHorizontal /></span><small>More</small>
      </button>
      {moreOpen && <div className="call-mobile-more-menu">
        {video && <button type="button" className="call-dock-button" onClick={() => { onSwitchCamera(); setMoreOpen(false); }}
          aria-label="Switch front or rear camera">
          <span className="call-dock-icon"><SwitchCamera /></span><small>Switch camera</small>
        </button>}
        <button type="button" className={`call-dock-button ${chatOpen ? 'call-dock-selected' : ''}`}
          onClick={() => { onChat(); setMoreOpen(false); }} aria-label={chatOpen ? 'Close in-call chat' : 'Open in-call chat'}>
          <span className="call-dock-icon"><MessageCircle /></span><small>Chat</small>
        </button>
        <div className="call-device-control">
          <button type="button" className={`call-dock-button ${devicesOpen ? 'call-dock-selected' : ''}`}
            onClick={() => setDevicesOpen(open => !open)} aria-expanded={devicesOpen} aria-label="Select call devices">
            <span className="call-dock-icon"><Settings2 /></span><small>Devices</small>
          </button>
          {devicesOpen && deviceMenu}
        </div>
      </div>}
    </div>
    <button type="button" className="call-dock-button" onClick={onMinimize} aria-label="Minimize call" title="Minimize call">
      <span className="call-dock-icon"><PictureInPicture2 /></span><small>Minimize</small>
    </button>
    <button type="button" className="call-dock-end" onClick={onEnd} aria-label="End call" title="End call">
      <span className="call-dock-icon"><PhoneOff /></span><small>End</small>
    </button>
  </div>;
}
