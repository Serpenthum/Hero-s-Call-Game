import React, { useEffect, useState } from 'react';
import { socketService } from '../socketService';
import CloseButton from './CloseButton';
import '../styles/SettingsModal.css';
import '../styles/RulesModal.css';
import {
  AnimSpeed,
  getAnimSpeed,
  setAnimSpeed,
  getAutoEndTurnEnabled,
  setAutoEndTurnEnabled,
  sfx
} from '../battleAnimations';
import { getHoloEffects, setHoloEffects } from '../holoSetting';
import {
  getSfxEnabled,
  setSfxEnabled,
  getSfxVolume,
  setSfxVolume,
  getMusicEnabled,
  setMusicEnabled,
  getMusicVolume,
  setMusicVolume
} from '../sound/settings';
import { CREDITS_TEXT } from '../sound/credits';

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
  const [musicOn, setMusicOn] = useState(getMusicEnabled);
  const [musicVolume, setMusicVolumeState] = useState(() => Math.round(getMusicVolume() * 100));
  const [autoEnd, setAutoEnd] = useState(getAutoEndTurnEnabled);
  const [holoOn, setHoloOn] = useState(getHoloEffects);
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

  const toggleMusic = () => {
    setMusicEnabled(!musicOn);
    setMusicOn(!musicOn);
  };

  const changeMusicVolume = (value: number) => {
    setMusicVolume(value / 100);
    setMusicVolumeState(value);
  };

  const toggleHolo = () => {
    setHoloEffects(!holoOn);
    setHoloOn(!holoOn);
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
          <h3>Settings</h3>
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
              <span>Show holographic effects</span>
              <small>Rainbow shine on holographic cards</small>
            </div>
            <button
              className={`settings-switch${holoOn ? ' on' : ''}`}
              role="switch"
              aria-checked={holoOn}
              aria-label="Show holographic effects"
              onClick={toggleHolo}
            >
              <span className="settings-switch-knob" />
            </button>
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
              <small>Battle and menu sounds</small>
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
              style={{ background: `linear-gradient(90deg, var(--verdigris) ${volume}%, color-mix(in srgb, var(--bone) 15%, transparent) ${volume}%)` }}
            />
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span>Music</span>
              <small>Background music in menus and battles</small>
            </div>
            <button
              className={`settings-switch${musicOn ? ' on' : ''}`}
              role="switch"
              aria-checked={musicOn}
              aria-label="Music"
              onClick={toggleMusic}
            >
              <span className="settings-switch-knob" />
            </button>
          </div>

          <div className={`settings-row${musicOn ? '' : ' disabled'}`}>
            <div className="settings-label">
              <span>Music volume</span>
              <small>{musicVolume}%</small>
            </div>
            <input
              className="settings-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={musicVolume}
              disabled={!musicOn}
              aria-label="Music volume"
              onChange={e => changeMusicVolume(Number(e.target.value))}
              style={{ background: `linear-gradient(90deg, var(--verdigris) ${musicVolume}%, color-mix(in srgb, var(--bone) 15%, transparent) ${musicVolume}%)` }}
            />
          </div>

          <div className="settings-credits">
            <h4>Credits</h4>
            <p>{CREDITS_TEXT}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
