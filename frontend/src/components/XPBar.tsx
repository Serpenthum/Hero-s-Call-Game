import React, { useState, useEffect } from 'react';
import '../styles/XPBar.css';

interface XPBarProps {
  currentXP: number;
  level: number;
  animated?: boolean;
  xpGained?: number;
}

const XPBar: React.FC<XPBarProps> = ({ currentXP, level, animated = true, xpGained = 0 }) => {
  const [displayXP, setDisplayXP] = useState(animated ? currentXP - xpGained : currentXP);
  const [isAnimating, setIsAnimating] = useState(false);

  // Calculate XP values for current level
  const getXPForLevel = (lvl: number) => {
    if (lvl <= 1) return 0;
    return (lvl - 1) * 100;
  };

  const getXPForNextLevel = (lvl: number) => {
    if (lvl >= 10) return lvl * 100; // Max level
    return lvl * 100;
  };

  const xpForCurrentLevel = getXPForLevel(level);
  const xpForNextLevel = getXPForNextLevel(level);
  const currentLevelXP = Math.max(0, displayXP - xpForCurrentLevel);
  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
  const progressPercent = Math.min(100, (currentLevelXP / xpNeededForNext) * 100);

  // Animation effect for XP gain
  useEffect(() => {
    if (animated && xpGained > 0) {
      setIsAnimating(true);
      
      // Animate the XP increase
      const startXP = currentXP - xpGained;
      const endXP = currentXP;
      const duration = 2500; // 2.5 seconds for slower animation
      const startTime = Date.now();

      const animateXP = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out animation
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const newXP = startXP + (endXP - startXP) * easedProgress;
        
        setDisplayXP(Math.floor(newXP));

        if (progress < 1) {
          requestAnimationFrame(animateXP);
        } else {
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animateXP);
    }
  }, [currentXP, xpGained, animated]);

  return (
    <div className="xp-bar-container">
      <div className="xp-bar">
        <div 
          className={`xp-fill ${isAnimating ? 'animating' : ''}`}
          style={{ width: `${progressPercent}%` }}
        >
          <div className="xp-shine"></div>
        </div>
        <div className="xp-text">
          <span className="xp-current">{Math.floor(currentLevelXP)}</span>
          <span className="xp-separator">/</span>
          <span className="xp-max">{xpNeededForNext}</span>
          <span className="xp-label">XP</span>
        </div>
      </div>

      {xpGained > 0 && animated && (
        <div className={`xp-gain-popup ${isAnimating ? 'show' : ''}`}>
          +{xpGained} XP
        </div>
      )}
    </div>
  );
};

export default XPBar;