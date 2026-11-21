import React from 'react';
import Coin from '../Coin';
import XPBar, { xpNeededForLevel } from '../XPBar';
import Icon from '../ui/Icon';

interface LobbyTopBarProps {
  coins: number;
  coinsBumping: boolean;
  level: number;
  xp: number;
  levelFlash: boolean;
  onLogout(): void;
  friends?: React.ReactNode;
}

// The lobby's top bar: title, coins, level and XP, Friends (Task 3) and Sign out.
const LobbyTopBar: React.FC<LobbyTopBarProps> = ({ coins, coinsBumping, level, xp, levelFlash, onLogout, friends }) => {
  const lvl = level || 1;
  return (
    <header className="lobby-bar">
      <h1 className="lobby-title">
        <span className="lobby-title-gem" aria-hidden="true">◆</span>
        Hero's Call
        <span className="lobby-title-gem" aria-hidden="true">◆</span>
      </h1>
      <div className="lobby-coins">
        <Coin />
        <span className={`lobby-coins-amount${coinsBumping ? ' vp-bump' : ''}`}>{coins}</span>
      </div>
      <div className="lobby-level">
        <span className="lobby-level-text">Level {lvl} · {xp || 0} / {xpNeededForLevel(lvl)} XP</span>
        <XPBar currentXP={xp || 0} level={lvl} animated={false} leveledUp={levelFlash} />
      </div>
      {friends}
      <button type="button" className="lobby-bar-btn lobby-signout" onClick={onLogout} aria-label="Sign out" title="Sign out">
        <Icon name="logout" size={20} />
        <span className="lobby-bar-btn-label">Sign out</span>
      </button>
    </header>
  );
};

export default LobbyTopBar;
