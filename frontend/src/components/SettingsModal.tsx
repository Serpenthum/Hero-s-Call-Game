import React, { useEffect, useState } from 'react';
import { socketService } from '../socketService';
import CloseButton from './CloseButton';
import {
  AnimSpeed,
  getAnimSpeed,
  setAnimSpeed,
  getSfxEnabled,
  setSfxEnabled,
  getSfxVolume,
  setSfxVolume,
  getAutoEndTurnEnabled,
  setAutoEndTurnEnabled,
  sfx
} from '../battleAnimations';

interface SettingsModalProps {
  onClose: () => void;
}

const SPEED_OPTIONS: Array<{ value: AnimSpeed; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' }
];

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [speed, setSpeed] = useState<AnimSpeed>(getAnimSpeed);
  const [sfxOn, setSfxOn] = useState(getSfxEnabled);
  const [volume, setVolume] = useState(() => Math.round(getSfxVolume() * 100));
  const [autoEnd, setAutoEnd] = useState(getAutoEndTurnEnabled);
  // undefined = measuring, null = no answer
  const [ping, setPing] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const measure = async () => {
      const result = await socketService.ping();
      if (active) setPing(result);
    };
    measure();
    const timer = window.setInterval(measure, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const pingLevel = ping === undefined ? '' : ping === null ? 'bad' : ping < 100 ? 'good' : ping < 250 ? 'ok' : 'bad';
  const pingHint = ping === null
    ? 'No response from the server'
    : ping === undefined
      ? 'Measuring...'
      : ping < 100 ? 'Connection is fast' : ping < 250 ? 'Some delay on clicks is expected' : 'Slow connection: clicks will feel laggy';

  const changeSpeed = (value: AnimSpeed) => {
    setAnimSpeed(value);
    setSpeed(value);
  };

  const toggleSfx = () => {
    setSfxEnabled(!sfxOn);
    setSfxOn(!sfxOn);
  };

  const changeVolume = (value: number) => {
    setSfxVolume(value / 100);
    setVolume(value);
  };

  const toggleAutoEnd = () => {
    setAutoEndTurnEnabled(!autoEnd);
    setAutoEnd(!autoEnd);
    socketService.setAutoEndTurn(!autoEnd);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="rules-modal-header">
          <h3>⚙️ Settings</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="settings-content">
          <div className="settings-row">
            <div className="settings-label">
              <span>Connection</span>
              <small>{pingHint}</small>
            </div>
            <span className={`settings-ping ${pingLevel}`}>
              {ping === undefined ? '...' : ping === null ? 'No signal' : `${ping} ms`}
            </span>
          </div>
          <div className="settings-row">
            <div className="settings-label">
              <span>Battle animations</span>
              <small>Speed of attack and ability effects</small>
            </div>
            <div className="settings-segmented" role="group" aria-label="Animation speed">
              {SPEED_OPTIONS.map(option => (
                <button
                  key={option.value}
                  className={speed === option.value ? 'active' : ''}
                  onClick={() => changeSpeed(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span>Auto end turn</span>
              <small>End your turn when no attack, ability or special is left</small>
            </div>
            <button
              className={`settings-switch${autoEnd ? ' on' : ''}`}
              role="switch"
              aria-checked={autoEnd}
              aria-label="Auto end turn"
              onClick={toggleAutoEnd}
            >
              <span className="settings-switch-knob" />
            </button>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span>Sound effects</span>
              <small>Attack, hit, heal and victory sounds</small>
            </div>
            <button
              className={`settings-switch${sfxOn ? ' on' : ''}`}
              role="switch"
              aria-checked={sfxOn}
              aria-label="Sound effects"
              onClick={toggleSfx}
            >
              <span className="settings-switch-knob" />
            </button>
          </div>

          <div className={`settings-row${sfxOn ? '' : ' disabled'}`}>
            <div className="settings-label">
              <span>Volume</span>
              <small>{volume}%</small>
            </div>
            <input
              className="settings-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              disabled={!sfxOn}
              aria-label="Sound effects volume"
              onChange={e => changeVolume(Number(e.target.value))}
              onPointerUp={() => sfx.hit(false)}
              onKeyUp={() => sfx.hit(false)}
              style={{ background: `linear-gradient(90deg, #4ade80 ${volume}%, rgba(255,255,255,0.15) ${volume}%)` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
