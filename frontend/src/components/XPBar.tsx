import React, { useState, useEffect } from 'react';
import '../styles/XPBar.css';

interface XPBarProps {
  currentXP: number;
  level: number;
  animated?: boolean;
  xpGained?: number;
  leveledUp?: boolean;
}

const XPBar: React.FC<XPBarProps> = ({ currentXP, level, animated = true, xpGained = 0, leveledUp = false }) => {
  const [displayXP, setDisplayXP] = useState(animated ? currentXP - xpGained : currentXP);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);

  // Calculate XP target for current level (XP resets to 0 on level up)
  // Level 1 needs 50, Level 2 needs 100, Level 3 needs 150, etc.
  const getXPNeededForCurrentLevel = (lvl: number) => {
    if (lvl >= 10) return 500; // Max level
    return lvl * 50;
  };

  const xpNeededForNext = getXPNeededForCurrentLevel(level);
  const progressPercent = Math.min(100, (displayXP / xpNeededForNext) * 100);

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

  // Level up animation effect
  useEffect(() => {
    if (leveledUp) {
      setShowLevelUp(true);
      const timer = setTimeout(() => {
        setShowLevelUp(false);
      }, 2000); // Match the levelUpGlow animation duration
      return () => clearTimeout(timer);
    }
  }, [leveledUp]);

  return (
    <div className="xp-bar-container">
      <div className={`xp-bar ${showLevelUp ? 'level-up' : ''}`}>
        <div 
          className={`xp-fill ${isAnimating ? 'animating' : ''}`}
          style={{ width: `${progressPercent}%` }}
        >
          <div className="xp-shine"></div>
        </div>
        <div className="xp-text">
          <span className="xp-current">{Math.floor(displayXP)}</span>
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