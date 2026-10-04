import React, { useState, useEffect } from 'react';
import '../styles/PackOpeningAnimation.css';
import HeroCard from './HeroCard';
import useCardGrid from '../hooks/useCardGrid';

interface Hero {
  name: string;
  HP: number;
  Defense: number;
  Accuracy: string;
  BasicAttack: string;
  Ability: Array<{ name: string; description: string }>;
  Special?: { name: string; description: string } | Array<{ name: string; description: string }>;
}

interface PackOpeningAnimationProps {
  heroes: Hero[];
  onComplete: () => void;
}

const PackOpeningAnimation: React.FC<PackOpeningAnimationProps> = ({ heroes, onComplete }) => {
  const [phase, setPhase] = useState<'zooming' | 'flipping' | 'revealed'>('zooming');
  const [revealedCards, setRevealedCards] = useState<boolean[]>([false, false, false]);
  const cardGrid = useCardGrid({ packCount: heroes.length });

  useEffect(() => {
    // Phase 1: Packs zoom to center (1s)
    const zoomTimer = setTimeout(() => {
      setPhase('flipping');
    }, 1000);

    return () => clearTimeout(zoomTimer);
  }, []);

  useEffect(() => {
    if (phase === 'flipping') {
      // Phase 2: Packs flip one by one with delay - increased timing for full animations
      const timers = [
        setTimeout(() => setRevealedCards([true, false, false]), 800),
        setTimeout(() => setRevealedCards([true, true, false]), 2000),
        setTimeout(() => setRevealedCards([true, true, true]), 3200),
        setTimeout(() => setPhase('revealed'), 4200),
      ];

      return () => timers.forEach(clearTimeout);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'revealed') {
      // Phase 3: Show revealed cards for 6 seconds then complete
      const completeTimer = setTimeout(() => {
        onComplete();
      }, 6000);

      return () => clearTimeout(completeTimer);
    }
  }, [phase, onComplete]);

  return (
    <div className="pack-opening-overlay" onClick={onComplete} ref={cardGrid.ref} style={cardGrid.style}>
      <div className="pack-opening-container">
        {heroes.map((hero, index) => (
          <div
            key={index}
            className={`pack-card-slot pack-${index} ${
              phase === 'zooming' ? 'zoom-in' : ''
            } ${phase === 'flipping' ? 'flip-animation' : ''} ${
              revealedCards[index] ? 'flipped' : ''
            } ${phase === 'revealed' ? 'revealed' : ''}`}
          >
            {/* Pack Front */}
            <div className="pack-front">
              <img src="/pack1.png" alt="Hero Pack" className="pack-image-full" />
            </div>

            {/* Hero Card Back */}
            <div className="hero-card-back">
              <HeroCard
                hero={hero}
                className={`hero-card-revealed ${phase === 'revealed' ? 'glow' : ''}`}
                showFullInfo={false}
                disableHPAnimations
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PackOpeningAnimation;
