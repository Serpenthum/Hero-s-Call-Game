import React, { useState, useEffect } from 'react';
import XPBar from './XPBar';
import '../styles/RewardsDisplay.css';

interface RewardsDisplayProps {
  oldXP: number;
  newXP: number;
  xpGained: number;
  oldLevel: number;
  newLevel: number;
  oldVictoryPoints: number;
  newVictoryPoints: number;
  victoryPointsGained: number;
  leveledUp: boolean;
}

const RewardsDisplay: React.FC<RewardsDisplayProps> = ({
  oldXP,
  newXP,
  xpGained,
  oldLevel,
  newLevel,
  oldVictoryPoints,
  newVictoryPoints,
  victoryPointsGained,
  leveledUp
}) => {
  const [displayVP, setDisplayVP] = useState(oldVictoryPoints);
  const [isVPAnimating, setIsVPAnimating] = useState(false);
  const [showContent, setShowContent] = useState(false);

  // Delay showing content by 1 second
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Animate Victory Points counter after content is shown
  useEffect(() => {
    if (victoryPointsGained > 0 && showContent) {
      setIsVPAnimating(true);
      
      const duration = 2500; // 2.5 seconds for slower animation
      const startTime = Date.now();
      const startVP = oldVictoryPoints;
      const endVP = newVictoryPoints;

      const animateVP = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out animation
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const currentVP = startVP + (endVP - startVP) * easedProgress;
        
        setDisplayVP(Math.floor(currentVP));

        if (progress < 1) {
          requestAnimationFrame(animateVP);
        } else {
          setIsVPAnimating(false);
        }
      };

      requestAnimationFrame(animateVP);
    }
  }, [oldVictoryPoints, newVictoryPoints, victoryPointsGained, showContent]);

  return (
    <div className="rewards-display">
      <h3 className="rewards-title">Battle Rewards</h3>
      
      {showContent && (
        <div className="rewards-content">
          {/* XP Section */}
          <div className="reward-section xp-section">
            <div className="reward-label">
              <span className="label-text">Experience Points</span>
              {xpGained > 0 && (
                <span className="reward-gain xp-gain">+{xpGained} XP</span>
              )}
            </div>
            <div className="xp-bar-wrapper">
              <div className="level-indicator">
                Level {newLevel}
                {leveledUp && <span className="level-up-badge">LEVEL UP!</span>}
              </div>
              <XPBar 
                currentXP={newXP} 
                level={newLevel} 
                animated={true}
                xpGained={xpGained}
              />
            </div>
          </div>

          {/* Victory Points Section */}
          <div className="reward-section vp-section">
            <div className="reward-label">
              <span className="label-text">Victory Points</span>
              {victoryPointsGained > 0 && (
                <span className="reward-gain vp-gain">+{victoryPointsGained}</span>
              )}
            </div>
            <div className="vp-display">
              <div className={`vp-counter ${isVPAnimating ? 'animating' : ''}`}>
                <span className="vp-icon">🏆</span>
                <span className="vp-number">{displayVP}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RewardsDisplay;
