import React, { useState } from 'react';
import HeroCard from './HeroCard';
import type { GauntletRunState } from '../types';
import type { Hero } from '../types';
import config from '../config';
import '../styles/GauntletContent.css';

interface GauntletContentProps {
  runState: GauntletRunState;
  onStateUpdate: (state: GauntletRunState) => void;
  isSearching: boolean;
  onCancelSearch: () => void;
  pendingShopAction: 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial' | null;
  onSetPendingShopAction: (action: 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial' | null) => void;
  shopOffer: any[] | null;
  onSetShopOffer: (offer: any[] | null) => void;
}

const GauntletContent: React.FC<GauntletContentProps> = ({
  runState,
  onStateUpdate,
  isSearching,
  onCancelSearch,
  pendingShopAction,
  onSetPendingShopAction,
  shopOffer,
  onSetShopOffer
}) => {
  const [selectedTeam, setSelectedTeam] = useState<number[]>(runState.battle_team_indices || []);
  const [draggedHero, setDraggedHero] = useState<number | null>(null);

  const handleHeroClick = async (index: number) => {
    if (!pendingShopAction) return;

    const { socketService } = await import('../socketService');
    const socket = socketService.getSocket();
    if (!socket) return;

    if (pendingShopAction === 'heal') {
      socket.emit('gauntlet-shop-action', {
        type: 'heal',
        data: { heroIndex: index }
      });

      socket.once('gauntlet-shop-action-result', (data: any) => {
        if (data.success && data.runState) {
          onStateUpdate(data.runState);
          onSetPendingShopAction(null);
        }
      });
    } else if (pendingShopAction === 'temp_res') {
      const heroId = runState.roster[index].hero_id;
      socket.emit('gauntlet-shop-action', {
        type: 'temp_res',
        data: { heroId }
      });

      socket.once('gauntlet-shop-action-result', (data: any) => {
        if (data.success && data.runState) {
          onStateUpdate(data.runState);
          onSetPendingShopAction(null);
        }
      });
    }
  };

  const handleDragStart = (index: number) => {
    const hero = runState.roster[index];
    if (!hero.alive && !hero.temporary_resurrection_active) return;
    setDraggedHero(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnTeam = (teamSlot: number) => {
    if (draggedHero === null) return;

    const newTeam = [...selectedTeam];
    
    // Remove dragged hero from any existing position
    const draggedIndex = newTeam.indexOf(draggedHero);
    if (draggedIndex !== -1) {
      newTeam.splice(draggedIndex, 1);
    }
    
    // Insert at new position
    if (teamSlot < newTeam.length) {
      newTeam[teamSlot] = draggedHero;
    } else {
      newTeam.push(draggedHero);
    }
    
    // Keep only 3
    const filteredTeam = newTeam.slice(0, 3);
    setSelectedTeam(filteredTeam);
    setDraggedHero(null);
  };

  const handleDropOnRoster = () => {
    if (draggedHero === null) return;
    
    // Remove from team
    const newTeam = selectedTeam.filter(i => i !== draggedHero);
    setSelectedTeam(newTeam);
    setDraggedHero(null);
  };

  const handleSetBattleTeam = async () => {
    if (selectedTeam.length !== 3) return;

    const { socketService } = await import('../socketService');
    const socket = socketService.getSocket();
    if (!socket) return;

    socket.emit('set-gauntlet-battle-team', { teamIndices: selectedTeam });

    socket.once('gauntlet-battle-team-set', (data: any) => {
      if (data.success) {
        socket.emit('queue-for-gauntlet-trial');
      }
    });
  };

  return (
    <div className="gauntlet-content-container">
      {/* Hero Roster - Single row at top */}
      <div className="roster-section" onDrop={handleDropOnRoster} onDragOver={handleDragOver}>
        <h3>Hero Roster ({runState.roster.length}/6)</h3>
        <div className="roster-row">
          {runState.roster.map((hero, index) => {
            const isInTeam = selectedTeam.includes(index);
            const isDead = !hero.alive && !hero.temporary_resurrection_active;
            const isTemp = hero.temporary_resurrection_active;
            const isSelectable = pendingShopAction === 'heal' && hero.alive;
            const isResurrectable = pendingShopAction === 'temp_res' && isDead;
            
            // Use the actual hero data from the HeroInstance
            const heroData: Hero = {
              ...hero.hero,
              currentHP: hero.current_hp,
              maxHP: hero.max_hp
            };
            
            return (
              <div
                key={index}
                draggable={!isDead}
                onDragStart={() => handleDragStart(index)}
                onClick={() => (isSelectable || isResurrectable) ? handleHeroClick(index) : null}
                className={`gauntlet-hero-wrapper ${isDead ? 'dead' : ''} ${isTemp ? 'temp-res' : ''} ${isInTeam ? 'in-team' : ''} ${isSelectable || isResurrectable ? 'selectable' : ''}`}
              >
                <HeroCard
                  hero={heroData}
                  showFullInfo={false}
                  disableHPAnimations={true}
                  hideAbilities={true}
                />
                {isTemp && <div className="temp-badge">👻 TEMP</div>}
                {isDead && <div className="dead-overlay">💀</div>}
              </div>
            );
          })}
        </div>
        {pendingShopAction && (
          <div className="action-hint">
            {pendingShopAction === 'heal' && '💚 Click a hero to heal'}
            {pendingShopAction === 'temp_res' && '👻 Click a dead hero to resurrect'}
            <button onClick={() => onSetPendingShopAction(null)} className="cancel-action-btn">Cancel</button>
          </div>
        )}
      </div>

      {/* Trial Team - Single row below roster */}
      <div className="battle-team-section">
        <h3>Trial Team (3 Heroes)</h3>
        <div className="team-row">
          {[0, 1, 2].map((slot) => {
            const heroIndex = selectedTeam[slot];
            const hero = heroIndex !== undefined ? runState.roster[heroIndex] : null;
            
            return (
              <div
                key={slot}
                className={`team-slot ${hero ? 'filled' : 'empty'}`}
                onDrop={() => handleDropOnTeam(slot)}
                onDragOver={handleDragOver}
              >
                {hero ? (
                  <>
                    <div className="slot-number">{slot + 1}</div>
                    <HeroCard
                      hero={{
                        ...hero.hero,
                        currentHP: hero.current_hp,
                        maxHP: hero.max_hp
                      }}
                      showFullInfo={false}
                      disableHPAnimations={true}
                      hideAbilities={true}
                    />
                    {hero.temporary_resurrection_active && <div className="temp-badge">👻</div>}
                  </>
                ) : (
                  <div className="empty-slot-text">
                    <div className="slot-number">{slot + 1}</div>
                    <div>Drag hero here</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="team-actions">
          {selectedTeam.length === 3 && !isSearching && (
            <button className="start-trial-btn" onClick={handleSetBattleTeam}>
              ⚔️ Start Trial {runState.current_trial}
            </button>
          )}

          {isSearching && (
            <div className="searching-container">
              <div className="searching-text">🔍 Finding Opponent...</div>
              <button className="cancel-search-btn" onClick={onCancelSearch}>
                Cancel Search
              </button>
            </div>
          )}

          {selectedTeam.length < 3 && !isSearching && (
            <div className="team-hint">
              Select {3 - selectedTeam.length} more hero{3 - selectedTeam.length > 1 ? 'es' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Shop Offer Modal */}
      {shopOffer && (
        <div className="modal-overlay" onClick={() => onSetShopOffer(null)}>
          <div className="shop-offer-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Choose a Hero</h2>
            <div className="offer-heroes">
              {shopOffer.map((offer, index) => (
                <div key={index} className="offer-hero-card">
                  <img src={`${config.IMAGE_BASE_URL}/hero-images/${offer.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`} alt={offer.name} />
                  <h3>{offer.name}</h3>
                  <div className="offer-stats">
                    <div>❤️ HP: {offer.data.HP}</div>
                    <div>🛡️ Def: {offer.data.Defense}</div>
                    <div>⚔️ Atk: {offer.data.BasicAttack}</div>
                  </div>
                  <button className="select-hero-btn">Select</button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              {runState.rerolls_remaining > 0 && (
                <button className="reroll-btn">
                  🔄 Reroll ({runState.rerolls_remaining} left)
                </button>
              )}
              <button className="close-modal-btn" onClick={() => onSetShopOffer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GauntletContent;
