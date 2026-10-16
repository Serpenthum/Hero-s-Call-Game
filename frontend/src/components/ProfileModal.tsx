import React, { useState, useEffect } from 'react';
import HeroCard from './HeroCard';
import XPBar from './XPBar';
import CloseButton from './CloseButton';
import { Hero } from '../types';
import config from '../config';
import { authHeaders } from '../authSession';
import useCardGrid from '../hooks/useCardGrid';
import '../styles/ProfileModal.css';

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
}

interface PlayerStats {
  id: number;
  user_id: number;
  level: number;
  xp: number;
  total_wins: number;
  total_losses: number;
  favorite_hero: string | null;
  hero_usage_count: { [heroName: string]: number };
  highest_survival_run: number;
  profile_icon: string;
}

interface ProfileModalProps {
  user: User;
  allHeroes: Hero[];
  isOpen: boolean;
  onClose: () => void;
  onIconChange?: (heroName: string) => void;
  onOpenHowToPlay?: () => void;
  onOpenSettings?: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, allHeroes, isOpen, onClose, onIconChange, onOpenHowToPlay, onOpenSettings }) => {
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string>('Sorcerer');
  const favoriteGrid = useCardGrid({ fixedColumns: 1, gap: 0, frameSpace: 4 });
  const [iconGridEl, setIconGridEl] = useState<HTMLDivElement | null>(null);
  const [iconLayout, setIconLayout] = useState<{ cols: number; size: number; names: boolean } | null>(null);
  const iconCount = allHeroes.length;

  // Pick the column count that lets every icon fit at the largest size (no scrolling unless it gets tiny).
  useEffect(() => {
    if (!iconGridEl || iconCount === 0) return;
    const GAP = 8;
    const CELL_EXTRA_W = 16;
    const CELL_EXTRA_H = 46;
    const CELL_EXTRA_H_NO_NAME = 26;
    const NAMES_MIN_SIZE = 48;
    const MIN_SIZE = 36;
    const MAX_SIZE = 110;
    const update = () => {
      const width = iconGridEl.clientWidth - 8;
      const height = iconGridEl.clientHeight - 8;
      if (width <= 0 || height <= 0) return;
      const fit = (extraH: number) => {
        let best = { cols: 1, size: 0 };
        for (let cols = 1; cols <= iconCount; cols++) {
          const rows = Math.ceil(iconCount / cols);
          const sizeW = (width - (cols - 1) * GAP) / cols - CELL_EXTRA_W;
          const sizeH = (height - (rows - 1) * GAP) / rows - extraH;
          const size = Math.min(sizeW, sizeH, MAX_SIZE);
          if (size > best.size) best = { cols, size };
        }
        return best;
      };
      // Names are dropped (still in the tooltip) when icons would otherwise get too small to label
      const withNames = fit(CELL_EXTRA_H);
      const showNames = withNames.size >= NAMES_MIN_SIZE;
      const best = showNames ? withNames : fit(CELL_EXTRA_H_NO_NAME);
      const next = { cols: best.cols, size: Math.max(MIN_SIZE, Math.floor(best.size)), names: showNames };
      setIconLayout(prev => prev && prev.cols === next.cols && prev.size === next.size && prev.names === next.names ? prev : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(iconGridEl);
    return () => observer.disconnect();
  }, [iconGridEl, iconCount]);

  useEffect(() => {
    if (isOpen) {
      fetchPlayerStats();
    }
  }, [isOpen, user.id]);

  const fetchPlayerStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.API_BASE_URL}/api/player-stats/${user.id}`);
      const data = await response.json();
      
      if (data.success) {
        setPlayerStats(data.stats);
        setSelectedIcon(data.stats.profile_icon);
      }
    } catch (error) {
      console.error('Failed to fetch player stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleIconChange = async (heroName: string) => {
    if (!isOwned(heroName)) return;
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/update-profile-icon`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userId: user.id,
          heroName: heroName
        })
      });

      const data = await response.json();
      if (data.success) {
        setSelectedIcon(heroName);
        onIconChange?.(heroName);
        setPlayerStats(prev => prev ? { ...prev, profile_icon: heroName } : null);
        setShowIconSelector(false);
      }
    } catch (error) {
      console.error('Failed to update profile icon:', error);
    }
  };

  const isOwned = (heroName: string) => user.available_heroes.includes(heroName);

  // Owned heroes first; the rest are shown locked
  const getIconHeroes = () => {
    return [...allHeroes].sort((a, b) =>
      Number(isOwned(b.name)) - Number(isOwned(a.name)) || a.name.localeCompare(b.name));
  };

  const getFavoriteHero = () => {
    if (!playerStats?.favorite_hero) return null;
    return allHeroes.find(hero => hero.name === playerStats.favorite_hero);
  };

  const getProfileIcon = () => {
    return allHeroes.find(hero => hero.name === selectedIcon) || 
           allHeroes.find(hero => hero.name === 'Sorcerer');
  };

  if (!isOpen) return null;

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="profile-header">
          <div className="profile-header-tools">
            {onOpenHowToPlay && (
              <button className="profile-tool-btn" onClick={onOpenHowToPlay} aria-label="How to Play" title="How to Play">
                ?
              </button>
            )}
            {onOpenSettings && (
              <button className="profile-tool-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.07.63-.07.94s.03.63.07.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
                  />
                </svg>
              </button>
            )}
          </div>
          <h2>{user.username}</h2>
          <CloseButton className="profile-close-btn" onClick={onClose} />
        </div>

        {loading ? (
          <div className="profile-loading">
            <div className="loading-spinner"></div>
            <p>Loading profile...</p>
          </div>
        ) : (
          <>
            <div className="profile-main">
              <div className="profile-left">
              <div className="profile-identity">
                <div className="profile-icon-section">
                  <div className="profile-icon-container">
                    {getProfileIcon() && (
                      <img 
                        src={`${config.IMAGE_BASE_URL}/hero-images/${getProfileIcon()!.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`}
                        alt={selectedIcon}
                        className="profile-icon"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `data:image/svg+xml;base64,${btoa(`
                            <svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
                              <rect width="100%" height="100%" fill="#333"/>
                              <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="8" fill="#999" text-anchor="middle" dy=".3em">No Image</text>
                            </svg>
                          `)}`;
                        }}
                      />
                    )}
                  </div>
                  <button 
                    className="change-icon-btn"
                    onClick={() => setShowIconSelector(true)}
                  >
                    Change Icon
                  </button>
                </div>

                <div className="profile-info">
                  <div className="level-section">
                    <div className="level-display">
                      <span className="level-label">Level</span>
                      <span className="level-number">{playerStats?.level || 1}</span>
                    </div>
                    {playerStats && (
                      <XPBar 
                        currentXP={playerStats.xp}
                        level={playerStats.level}
                        animated={false}
                      />
                    )}
                  </div>
                </div>
              </div>

                <div className="profile-stats">
                  <h4>Quick Stats</h4>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Total Wins</span>
                      <span className="stat-value">{playerStats?.total_wins || 0}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Total Losses</span>
                      <span className="stat-value">{playerStats?.total_losses || 0}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Win Rate</span>
                      <span className="stat-value">
                        {playerStats && (playerStats.total_wins + playerStats.total_losses) > 0
                          ? `${Math.round((playerStats.total_wins / (playerStats.total_wins + playerStats.total_losses)) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Highest Survival Run</span>
                      <span className="stat-value">{playerStats?.highest_survival_run || 0} wins</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="favorite-hero-section">
                <h4>Favorite Hero</h4>
                {getFavoriteHero() ? (
                  <div className="favorite-hero-display">
                    <div className="responsive-card-viewport" ref={favoriteGrid.ref} style={favoriteGrid.style}>
                      <HeroCard hero={getFavoriteHero()!} />
                    </div>
                    <div className="favorite-hero-stats">
                      <p>Used {playerStats?.hero_usage_count[playerStats.favorite_hero!] || 0} times</p>
                    </div>
                  </div>
                ) : (
                  <div className="no-favorite-hero">
                    <p>Play some ranked games to discover your favorite hero!</p>
                  </div>
                )}
              </div>
            </div>

            {showIconSelector && (
              <div className="icon-selector-overlay">
                <div className="icon-selector">
                  <div className="icon-selector-header">
                    <h3>Choose Profile Icon</h3>
                    <CloseButton onClick={() => setShowIconSelector(false)} />
                  </div>
                  <div
                    className={`available-icons${iconLayout && !iconLayout.names ? ' no-names' : ''}`}
                    ref={setIconGridEl}
                    style={iconLayout ? {
                      ['--icon-size' as string]: `${iconLayout.size}px`,
                      gridTemplateColumns: `repeat(${iconLayout.cols}, minmax(0, 1fr))`
                    } : undefined}
                  >
                    {getIconHeroes().map(hero => {
                      const owned = isOwned(hero.name);
                      return (
                      <div 
                        key={hero.name} 
                        className={`icon-option ${selectedIcon === hero.name ? 'selected' : ''} ${owned ? '' : 'locked'}`}
                        onClick={owned ? () => handleIconChange(hero.name) : undefined}
                        title={owned ? hero.name : `${hero.name} (not owned)`}
                        aria-disabled={!owned}
                      >
                        <div className="icon-option-image">
                          <img 
                            src={`${config.IMAGE_BASE_URL}/hero-images/${hero.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`}
                            decoding="async"
                            loading="lazy"
                            alt={hero.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `data:image/svg+xml;base64,${btoa(`
                                <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
                                  <rect width="100%" height="100%" fill="#333"/>
                                  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="6" fill="#999" text-anchor="middle" dy=".3em">No Image</text>
                                </svg>
                              `)}`;
                            }}
                          />
                          {!owned && <span className="icon-lock" aria-hidden="true">🔒</span>}
                        </div>
                        <span className="icon-option-name">{hero.name}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
