import React, { useState, useEffect } from 'react';
import HeroCard from './HeroCard';
import XPBar from './XPBar';
import { Hero } from '../types';
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
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, allHeroes, isOpen, onClose }) => {
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string>('Sorcerer');

  useEffect(() => {
    if (isOpen) {
      fetchPlayerStats();
    }
  }, [isOpen, user.id]);

  const fetchPlayerStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/player-stats/${user.id}`);
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
    try {
      const response = await fetch('http://localhost:3001/api/update-profile-icon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          heroName: heroName
        })
      });

      const data = await response.json();
      if (data.success) {
        setSelectedIcon(heroName);
        setPlayerStats(prev => prev ? { ...prev, profile_icon: heroName } : null);
        setShowIconSelector(false);
      }
    } catch (error) {
      console.error('Failed to update profile icon:', error);
    }
  };

  const getAvailableHeroes = () => {
    return allHeroes
      .filter(hero => user.available_heroes.includes(hero.name))
      .sort((a, b) => a.name.localeCompare(b.name));
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
          <h2>{user.username}</h2>
          <button className="profile-close-btn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="profile-loading">
            <div className="loading-spinner"></div>
            <p>Loading profile...</p>
          </div>
        ) : (
          <>
            <div className="profile-main">
              <div className="profile-identity">
                <div className="profile-icon-section">
                  <div className="profile-icon-container">
                    {getProfileIcon() && (
                      <img 
                        src={`/hero-images/${getProfileIcon()!.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`}
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

              <div className="profile-content-section">
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

                <div className="favorite-hero-section">
                  <h4>Favorite Hero</h4>
                  {getFavoriteHero() ? (
                    <div className="favorite-hero-display">
                      <HeroCard hero={getFavoriteHero()!} />
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
            </div>

            {showIconSelector && (
              <div className="icon-selector-overlay">
                <div className="icon-selector">
                  <div className="icon-selector-header">
                    <h3>Choose Profile Icon</h3>
                    <button 
                      className="icon-selector-close"
                      onClick={() => setShowIconSelector(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="available-icons">
                    {getAvailableHeroes().map(hero => (
                      <div 
                        key={hero.name} 
                        className={`icon-option ${selectedIcon === hero.name ? 'selected' : ''}`}
                        onClick={() => handleIconChange(hero.name)}
                      >
                        <div className="icon-option-image">
                          <img 
                            src={`/hero-images/${hero.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`}
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
                        </div>
                        <span className="icon-option-name">{hero.name}</span>
                      </div>
                    ))}
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