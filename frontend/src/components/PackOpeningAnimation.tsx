import React, { useState, useEffect } from 'react';
import '../styles/PackOpeningAnimation.css';
import config from '../config';

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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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
    <div className="pack-opening-overlay" onClick={onComplete}>
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
            <div 
              className="hero-card-back"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className={`hero-card-revealed ${phase === 'revealed' ? 'glow' : ''}`}>
                <img
                  src={`${config.IMAGE_BASE_URL}/hero-images/${hero.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '')}.png`}
                  alt={hero.name}
                  className="hero-image"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
                  }}
                />
                
                <div className="hero-card-content">
                  <div className="hero-stats">
                    <div className="hero-name">{hero.name}</div>
                    <div className="hero-stats-row">
                      <span className="stat-icon">❤️</span>
                      <span>HP: {hero.HP}</span>
                    </div>
                    <div className="hero-stats-row">
                      <span className="stat-icon">🛡️</span>
                      <span>Defense: {hero.Defense}</span>
                    </div>
                    <div className="hero-stats-row">
                      <span className="stat-icon">🎯</span>
                      <span>Accuracy: {hero.Accuracy}</span>
                    </div>
                    <div className="hero-stats-row">
                      <span className="stat-icon">⚔️</span>
                      <span>Attack: {hero.BasicAttack}</span>
                    </div>
                  </div>
                </div>

                {/* Tooltip on hover - matches HeroCard tooltip */}
                {hoveredIndex === index && phase === 'revealed' && (
                  <div className="pack-hero-tooltip">
                    <div className="tooltip-section">
                      <h4>Abilities</h4>
                      {hero.Ability.map((ability, abilityIndex) => (
                        <div key={abilityIndex} className="tooltip-ability">
                          <div className="tooltip-ability-name">{ability.name}</div>
                          <div className="tooltip-ability-description">{ability.description}</div>
                        </div>
                      ))}
                    </div>
                    
                    {hero.Special && (
                      <div className="tooltip-section">
                        <h4>Special</h4>
                        {Array.isArray(hero.Special) ? (
                          hero.Special.map((special, specialIndex) => (
                            <div key={specialIndex} className="tooltip-special">
                              <div className="tooltip-special-name">{hero.name === 'Bomber' ? 'Explosion' : special.name}</div>
                              <div className="tooltip-special-description">{special.description}</div>
                            </div>
                          ))
                        ) : (
                          <div className="tooltip-special">
                            <div className="tooltip-special-name">{hero.name === 'Bomber' ? 'Explosion' : (hero.Special.name || "Special Ability")}</div>
                            <div className="tooltip-special-description">{hero.Special.description || "Special ability details not available"}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PackOpeningAnimation;
