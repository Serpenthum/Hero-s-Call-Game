import React from 'react';
import '../styles/SurvivalProgress.css';

interface SurvivalProgressProps {
  wins: number;
  losses: number;
}

const SurvivalProgress: React.FC<SurvivalProgressProps> = ({ wins, losses }) => {
  const maxWins = 7;
  const maxLosses = 3;
  
  const winsPercentage = (wins / maxWins) * 100;
  const lossesPercentage = (losses / maxLosses) * 100;
  
  const getWinsIntensity = () => {
    if (wins === 0) return 0.3;
    return Math.min(0.3 + (wins / maxWins) * 0.7, 1);
  };
  
  const getLossesIntensity = () => {
    if (losses === 0) return 0.3;
    return Math.min(0.3 + (losses / maxLosses) * 0.7, 1);
  };

  return (
    <div className="survival-progress">
      <h3>Progress</h3>
      
      <div className="progress-section">
        <div className="progress-label">
          <span className="progress-title">Wins</span>
          <span className="progress-count">{wins} / {maxWins}</span>
        </div>
        <div className="progress-bar-container">
          <div 
            className="progress-bar wins-bar"
            style={{
              width: `${winsPercentage}%`,
              opacity: getWinsIntensity(),
              boxShadow: `0 0 ${10 + wins * 3}px rgba(0, 123, 255, ${getWinsIntensity()})`
            }}
          />
          <div className="progress-bar-background" />
        </div>
      </div>

      <div className="progress-section">
        <div className="progress-label">
          <span className="progress-title">Losses</span>
          <span className="progress-count">{losses} / {maxLosses}</span>
        </div>
        <div className="progress-bar-container">
          <div 
            className="progress-bar losses-bar"
            style={{
              width: `${lossesPercentage}%`,
              opacity: getLossesIntensity(),
              boxShadow: `0 0 ${10 + losses * 3}px rgba(255, 0, 0, ${getLossesIntensity()})`
            }}
          />
          <div className="progress-bar-background" />
        </div>
      </div>

      {wins === maxWins && (
        <div className="progress-achievement">
          🏆 Perfect Run!
        </div>
      )}
      
      {losses === maxLosses && (
        <div className="progress-elimination">
          💀 Eliminated
        </div>
      )}
    </div>
  );
};

export default SurvivalProgress;