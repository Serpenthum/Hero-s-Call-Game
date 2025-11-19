import React, { useState } from 'react';
import type { GauntletRunState } from '../types';
import config from '../config';
import '../styles/GauntletPreparation.css';

interface GauntletPreparationProps {
  runState: GauntletRunState;
  onStateUpdate: (state: GauntletRunState) => void;
  isSearching: boolean;
  onCancelSearch: () => void;
  onAbandonRun: () => void;
  user?: {
    id: number;
    username: string;
    best_gauntlet_trial: number;
  };
}

type ShopAction = 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial';

const GauntletPreparation: React.FC<GauntletPreparationProps> = ({
  runState,
  onStateUpdate,
  isSearching,
  onCancelSearch,
  onAbandonRun,
  user
}) => {
  const [selectedTeam, setSelectedTeam] = useState<number[]>(runState.battle_team_indices || []);
  const [pendingShopAction, setPendingShopAction] = useState<ShopAction | null>(null);
  const [shopOffer, setShopOffer] = useState<any[] | null>(null);
  const [draggedHero, setDraggedHero] = useState<number | null>(null);

  const handleShopAction = async (action: ShopAction) => {
    const { socketService} = await import('../socketService');
    const socket = socketService.getSocket();

    if (!socket) return;

    setPendingShopAction(action);

    // For heal and temp res, wait for hero selection
    if (action === 'heal' || action === 'temp_res') {
      return;
    }

    // For buy pack, request the offer
    if (action === 'buy_pack') {
      socket.emit('gauntlet-shop-action', { 
        type: 'buy_pack',
        data: { useReroll: false }
      });
      
      socket.once('gauntlet-shop-action-result', (data: any) => {
        if (data.success && data.action === 'show_offer') {
          setShopOffer(data.offer);
        }
        if (data.runState) {
          onStateUpdate(data.runState);
        }
      });
      return;
    }

    // For skip trial, execute immediately
    if (action === 'skip_trial') {
      socket.emit('gauntlet-shop-action', { type: 'skip_trial' });
      
      socket.once('gauntlet-shop-action-result', (data: any) => {
        if (data.success && data.runState) {
          onStateUpdate(data.runState);
          setPendingShopAction(null);
        }
      });
    }
  };

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
          setPendingShopAction(null);
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
          setPendingShopAction(null);
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

  const usableHeroes = runState.roster.filter(h => h.alive || h.temporary_resurrection_active);
  const deadHeroes = runState.roster.filter(h => !h.alive && !h.temporary_resurrection_active);
  const canSkipTrial = runState.current_trial <= 10;

  return (
    <div className="gauntlet-preparation-container">
      {/* Left Sidebar - Info Panel */}
      <div className="gauntlet-info-panel">
        <div className="mode-title">
          <h2>⚔️ GAUNTLET MODE</h2>
          <div className="mode-subtitle">Trial {runState.current_trial} of 13</div>
        </div>

        <div className="stats-section">
          <div className="stat-item">
            <span className="stat-label">Current Trial:</span>
            <span className="stat-value">#{runState.current_trial}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Usable Heroes:</span>
            <span className="stat-value">{usableHeroes.length}/{runState.roster.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Rerolls:</span>
            <span className="stat-value">{runState.rerolls_remaining}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Shop Actions:</span>
            <span className="stat-value">{runState.shop_actions_remaining}</span>
          </div>
          {user?.best_gauntlet_trial && user.best_gauntlet_trial > 0 && (
            <div className="stat-item best-trial">
              <span className="stat-label">Personal Best:</span>
              <span className="stat-value">Trial {user.best_gauntlet_trial}</span>
            </div>
          )}
        </div>

        <div className="dead-heroes-section">
          <h3>💀 Fallen Heroes ({deadHeroes.length})</h3>
          <div className="dead-heroes-list">
            {deadHeroes.map((hero, index) => (
              <div key={index} className="dead-hero-item">
                {hero.hero_id}
              </div>
            ))}
            {deadHeroes.length === 0 && (
              <div className="no-dead-heroes">No casualties yet</div>
            )}
          </div>
        </div>

        <button className="abandon-run-btn" onClick={onAbandonRun}>
          🚪 Abandon Run
        </button>
      </div>

      {/* Center - Roster and Team Selection */}
      <div className="gauntlet-main-content">
        <div className="roster-and-team">
          {/* Roster Grid - 3 rows of 2 */}
          <div className="roster-section" onDrop={handleDropOnRoster} onDragOver={handleDragOver}>
            <h3>Hero Roster ({runState.roster.length}/6)</h3>
            <div className="roster-grid">
              {runState.roster.map((hero, index) => {
                const isInTeam = selectedTeam.includes(index);
                const isDead = !hero.alive && !hero.temporary_resurrection_active;
                const isTemp = hero.temporary_resurrection_active;
                const isSelectable = pendingShopAction === 'heal' && hero.alive;
                const isResurrectable = pendingShopAction === 'temp_res' && isDead;
                
                return (
                  <div
                    key={index}
                    draggable={!isDead}
                    onDragStart={() => handleDragStart(index)}
                    onClick={() => (isSelectable || isResurrectable) ? handleHeroClick(index) : null}
                    className={`roster-hero-card ${isDead ? 'dead' : ''} ${isTemp ? 'temp-res' : ''} ${isInTeam ? 'in-team' : ''} ${isSelectable || isResurrectable ? 'selectable' : ''}`}
                  >
                    <img src={`${config.IMAGE_BASE_URL}/hero-images/${hero.hero_id.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`} alt={hero.hero_id} />
                    <div className="hero-name">{hero.hero_id}</div>
                    <div className="hero-hp">
                      {hero.current_hp}/{hero.max_hp} HP
                    </div>
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
                <button onClick={() => setPendingShopAction(null)} className="cancel-action-btn">Cancel</button>
              </div>
            )}
          </div>

          {/* Battle Team - 3 slots */}
          <div className="battle-team-section">
            <h3>Trial Team (3 Heroes)</h3>
            <div className="team-slots">
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
                        <img src={`${config.IMAGE_BASE_URL}/hero-images/${hero.hero_id.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`} alt={hero.hero_id} />
                        <div className="slot-number">{slot + 1}</div>
                        <div className="hero-name">{hero.hero_id}</div>
                        <div className="hero-hp">{hero.current_hp}/{hero.max_hp} HP</div>
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
      </div>

      {/* Right Sidebar - Shop Actions */}
      <div className="gauntlet-actions-panel">
        <h3>Shop Actions</h3>
        <div className="actions-remaining">
          {runState.shop_actions_remaining > 0 ? (
            <span className="actions-available">{runState.shop_actions_remaining} action available</span>
          ) : (
            <span className="actions-depleted">No actions remaining</span>
          )}
        </div>

        <div className="shop-actions">
          <button
            className="shop-action-btn heal"
            onClick={() => handleShopAction('heal')}
            disabled={runState.shop_actions_remaining === 0 || !!pendingShopAction}
          >
            <div className="action-icon">💚</div>
            <div className="action-name">Heal Hero</div>
            <div className="action-desc">Restore to full HP</div>
          </button>

          <button
            className="shop-action-btn resurrect"
            onClick={() => handleShopAction('temp_res')}
            disabled={runState.shop_actions_remaining === 0 || deadHeroes.length === 0 || !!pendingShopAction}
          >
            <div className="action-icon">👻</div>
            <div className="action-name">Temp Resurrect</div>
            <div className="action-desc">Revive for 1 battle</div>
          </button>

          <button
            className="shop-action-btn buy-pack"
            onClick={() => handleShopAction('buy_pack')}
            disabled={runState.shop_actions_remaining === 0 || !!pendingShopAction}
          >
            <div className="action-icon">📦</div>
            <div className="action-name">Buy Hero Pack</div>
            <div className="action-desc">Get 2 random heroes</div>
          </button>

          <button
            className="shop-action-btn skip"
            onClick={() => handleShopAction('skip_trial')}
            disabled={runState.shop_actions_remaining === 0 || !canSkipTrial || !!pendingShopAction}
          >
            <div className="action-icon">⏭️</div>
            <div className="action-name">Skip Trial</div>
            <div className="action-desc">{canSkipTrial ? 'Available until Trial 10' : 'Not available'}</div>
          </button>
        </div>
      </div>

      {/* Shop Offer Modal */}
      {shopOffer && (
        <div className="modal-overlay" onClick={() => setShopOffer(null)}>
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
              <button className="close-modal-btn" onClick={() => setShopOffer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GauntletPreparation;
