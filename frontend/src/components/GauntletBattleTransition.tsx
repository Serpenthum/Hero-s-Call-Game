import React, { useState } from 'react';
import type { GauntletRunState, GauntletHeroOffer } from '../types';
import '../styles/GauntletBattleTransition.css';

interface GauntletBattleTransitionProps {
  won: boolean;
  heroOffer: GauntletHeroOffer[];
  runState: GauntletRunState | null;
  onComplete: () => void;
}

const GauntletBattleTransition: React.FC<GauntletBattleTransitionProps> = ({
  won,
  heroOffer,
  runState,
  onComplete
}) => {
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [needsSacrifice, setNeedsSacrifice] = useState(false);
  const [currentOffer, setCurrentOffer] = useState(heroOffer);

  const handleHeroSelect = async (heroId: string) => {
    const { socketService } = await import('../socketService');
    const socket = socketService.getSocket();

    if (!socket) return;

    // Check if roster is full
    if (runState && runState.roster.length >= 6) {
      setSelectedHero(heroId);
      setNeedsSacrifice(true);
      return;
    }

    // Add hero directly
    socket.emit('complete-gauntlet-hero-offer', { selectedHeroId: heroId });

    socket.once('gauntlet-hero-offer-result', (data: any) => {
      if (data.success) {
        onComplete();
      }
    });
  };

  const handleSacrifice = async (sacrificeIndex: number) => {
    const { socketService } = await import('../socketService');
    const socket = socketService.getSocket();

    if (!socket || !selectedHero) return;

    socket.emit('complete-gauntlet-hero-offer', {
      selectedHeroId: selectedHero,
      sacrificeIndex
    });

    socket.once('gauntlet-hero-offer-result', (data: any) => {
      if (data.success) {
        onComplete();
      }
    });
  };

  const handleReroll = async () => {
    const { socketService } = await import('../socketService');
    const socket = socketService.getSocket();

    if (!socket || !runState || runState.rerolls_remaining <= 0) return;

    socket.emit('complete-gauntlet-hero-offer', { useReroll: true });

    socket.once('gauntlet-hero-offer-result', (data: any) => {
      if (data.success && data.offer) {
        setCurrentOffer(data.offer);
      }
    });
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="gauntlet-battle-transition">
      <div className="battle-result">
        <h1>{won ? '🏆 Victory!' : '💔 Defeat'}</h1>
        <p>{won ? 'You won the battle!' : 'You lost the battle.'}</p>
      </div>

      {needsSacrifice && runState ? (
        <div className="sacrifice-selection">
          <h2>Roster Full - Choose a Hero to Sacrifice</h2>
          <div className="roster-grid">
            {runState.roster.map((instance, index) => (
              <div
                key={index}
                className={`roster-hero-card ${!instance.alive ? 'dead' : ''}`}
                onClick={() => instance.alive ? handleSacrifice(index) : null}
              >
                <img src={`/hero-images/${instance.hero_id}.jpg`} alt={instance.hero_id} />
                <h4>{instance.hero_id}</h4>
                <div className="hero-hp">
                  HP: {instance.current_hp}/{instance.max_hp}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setNeedsSacrifice(false)} className="cancel-button">
            Cancel
          </button>
        </div>
      ) : (
        <div className="hero-offer-section">
          <h2>Choose a New Hero</h2>
          <div className="hero-offer-grid">
            {currentOffer.map((offer, index) => (
              <div
                key={index}
                className="hero-offer-card"
                onClick={() => handleHeroSelect(offer.name)}
              >
                <img src={`/hero-images/${offer.name}.jpg`} alt={offer.name} />
                <h3>{offer.name}</h3>
                <div className="hero-stats">
                  <p>❤️ HP: {offer.data.HP}</p>
                  <p>🛡️ Defense: {offer.data.Defense}</p>
                  <p>🎯 Accuracy: {offer.data.Accuracy}</p>
                  <p>⚔️ Attack: {offer.data.BasicAttack}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="offer-actions">
            {runState && runState.rerolls_remaining > 0 && (
              <button onClick={handleReroll} className="reroll-button">
                🔄 Reroll ({runState.rerolls_remaining} left)
              </button>
            )}
            <button onClick={handleSkip} className="skip-button">
              Skip (No Hero)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GauntletBattleTransition;
