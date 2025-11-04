import React, { useEffect } from 'react';
import { Hero } from '../types';
import '../styles/SurvivalBattleTransition.css';

interface SurvivalBattleTransitionProps {
  selectedTeam: Hero[];
  onTransitionComplete: () => void;
}

const SurvivalBattleTransition: React.FC<SurvivalBattleTransitionProps> = ({ 
  onTransitionComplete 
}) => {
  useEffect(() => {
    // Simple fade transition - complete after 800ms
    const timer = setTimeout(() => {
      onTransitionComplete();
    }, 800);

    return () => {
      clearTimeout(timer);
    };
  }, [onTransitionComplete]);

  return (
    <div className="survival-battle-transition fade-out">
      {/* Simple fade overlay */}
      <div className="transition-overlay" />
    </div>
  );
};

export default SurvivalBattleTransition;