import React, { useState, useEffect } from 'react';
import GauntletContent from './GauntletContent';
import GauntletBattleTransition from './GauntletBattleTransition';
import BattlePhase from './BattlePhase';
import '../styles/GauntletMode.css';
import type { GauntletRunState, GauntletHeroOffer, GauntletRewards } from '../types';

interface User {
  id: number;
  username: string;
  victory_points: number;
  available_heroes: string[];
  best_gauntlet_trial: number;
}

interface GauntletModeProps {
  onReturnToLobby: () => void;
  user?: User;
}

type GauntletPhase = 'preparation' | 'queueing' | 'battle' | 'hero_offer' | 'completed';
type ShopAction = 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial';

const GauntletMode: React.FC<GauntletModeProps> = ({ onReturnToLobby, user }) => {
  const [runState, setRunState] = useState<GauntletRunState | null>(null);
  const [phase, setPhase] = useState<GauntletPhase>('preparation');
  const [isSearching, setIsSearching] = useState(false);
  const [battleState, setBattleState] = useState<any>(null);
  const [heroOffer, setHeroOffer] = useState<GauntletHeroOffer[] | null>(null);
  const [battleWon, setBattleWon] = useState(false);
  const [finalTrial, setFinalTrial] = useState(0);
  const [rewards, setRewards] = useState<GauntletRewards | null>(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [pendingShopAction, setPendingShopAction] = useState<ShopAction | null>(null);
  const [shopOffer, setShopOffer] = useState<any[] | null>(null);
  const [runEnded, setRunEnded] = useState(false);

  useEffect(() => {
    let cleanupFunctions: (() => void)[] = [];

    const setupSocketListeners = async () => {
      const { socketService } = await import('../socketService');
      const socket = socketService.getSocket() || socketService.connect();

      if (socket) {
        // Run started
        const handleRunStarted = (data: any) => {
          console.log('🎮 Gauntlet run started:', data);
          if (data.success && data.runState) {
            setRunState(data.runState);
            setPhase('preparation');
          }
        };

        // Match found
        const handleMatchFound = () => {
          console.log('⚔️ Gauntlet match found!');
          setIsSearching(false);
          setPhase('battle');
        };

        // Queue waiting
        const handleQueueWaiting = () => {
          setIsSearching(true);
        };

        // Battle complete
        const handleBattleComplete = (data: any) => {
          console.log('🏆 Gauntlet battle complete:', data);
          setBattleWon(data.won);
          
          if (data.runEnded) {
            setRunEnded(true);
            setFinalTrial(data.finalTrial);
            setPhase('completed');
          } else {
            setRunState(data.runState);
            setHeroOffer(data.heroOffer);
            setPhase('hero_offer');
          }
        };

        // Run abandoned
        const handleRunAbandoned = (data: any) => {
          console.log('🚪 Gauntlet run abandoned:', data);
          if (data.success) {
            setRewards(data.rewards);
            setFinalTrial(data.finalTrial);
            setRunEnded(true);
            setPhase('completed');
          }
        };

        // Game start
        const handleGameStart = (data: any) => {
          console.log('🎮 Gauntlet game starting:', data);
          setBattleState(data.gameState);
        };

        socket.on('gauntlet-run-started', handleRunStarted);
        socket.on('gauntlet-match-found', handleMatchFound);
        socket.on('gauntlet-queue-waiting', handleQueueWaiting);
        socket.on('gauntlet-battle-complete', handleBattleComplete);
        socket.on('gauntlet-run-abandoned', handleRunAbandoned);
        socket.on('game-start', handleGameStart);

        cleanupFunctions.push(() => {
          socket.off('gauntlet-run-started', handleRunStarted);
          socket.off('gauntlet-match-found', handleMatchFound);
          socket.off('gauntlet-queue-waiting', handleQueueWaiting);
          socket.off('gauntlet-battle-complete', handleBattleComplete);
          socket.off('gauntlet-run-abandoned', handleRunAbandoned);
          socket.off('game-start', handleGameStart);
        });

        // Start the run
        if (!runState) {
          socket.emit('start-gauntlet-run', { name: user?.username || 'Player' });
        }
      }
    };

    setupSocketListeners();

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [user, runState]);

  const handleAbandonRun = async () => {
    const { socketService } = await import('../socketService');
    const socket = socketService.getSocket();
    
    if (socket) {
      socket.emit('abandon-gauntlet-run');
      setShowAbandonConfirm(false);
      // Reset state and return to lobby
      setRunState(null);
      setPhase('preparation');
      onReturnToLobby();
    }
  };

  const handleHeroOfferComplete = () => {
    setPhase('preparation');
    setHeroOffer(null);
  };

  const handleReturnToLobby = () => {
    onReturnToLobby();
  };

  // Render different phases
  if (phase === 'completed') {
    return (
      <div className="gauntlet-mode">
        <div className="gauntlet-complete-screen">
          <h1>🏁 Gauntlet Run Complete!</h1>
          <div className="final-stats">
            <h2>Final Trial Reached: {finalTrial}</h2>
            {rewards && (
              <div className="rewards-summary">
                <p>🎁 XP Earned: {rewards.xp}</p>
                <p>🏆 Victory Points: {rewards.victoryPoints}</p>
              </div>
            )}
            {user?.best_gauntlet_trial && (
              <p className="best-trial">Personal Best: Trial {user.best_gauntlet_trial}</p>
            )}
          </div>
          <div className="complete-buttons">
            <button onClick={handleReturnToLobby} className="return-button">
              Return to Game Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'hero_offer' && heroOffer) {
    return (
      <div className="gauntlet-mode">
        <GauntletBattleTransition
          won={battleWon}
          heroOffer={heroOffer}
          runState={runState}
          onComplete={handleHeroOfferComplete}
        />
      </div>
    );
  }

  if (phase === 'battle' && battleState) {
    return (
      <div className="gauntlet-mode">
        <BattlePhase
          gameState={battleState}
          playerId={battleState.players?.[0]?.id || ''}
          onReturnToLobby={handleReturnToLobby}
          isSurvivalMode={false}
        />
      </div>
    );
  }

  const handleShopAction = async (action: ShopAction) => {
    const { socketService } = await import('../socketService');
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
          setRunState(data.runState);
        }
      });
      return;
    }

    // For skip trial, execute immediately
    if (action === 'skip_trial') {
      socket.emit('gauntlet-shop-action', { type: 'skip_trial' });
      
      socket.once('gauntlet-shop-action-result', (data: any) => {
        if (data.success && data.runState) {
          setRunState(data.runState);
          setPendingShopAction(null);
        }
      });
    }
  };

  const usableHeroes = runState ? runState.roster.filter(h => h.alive || h.temporary_resurrection_active) : [];
  const deadHeroes = runState ? runState.roster.filter(h => !h.alive && !h.temporary_resurrection_active) : [];
  const canSkipTrial = runState ? runState.current_trial <= 10 : false;

  return (
    <div className="gauntlet-mode">
      {showAbandonConfirm && (
        <div className="modal-overlay">
          <div className="abandon-modal">
            <h2>Abandon Gauntlet Run?</h2>
            <p>You will receive rewards based on Trial {runState?.current_trial || 1}</p>
            <div className="modal-buttons">
              <button onClick={handleAbandonRun} className="confirm-button">
                Yes, Abandon
              </button>
              <button onClick={() => setShowAbandonConfirm(false)} className="cancel-button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {runState && (
        <>
          {/* Left Sidebar - Gauntlet Info */}
          <div className="game-sidebar gauntlet-sidebar">
            <div className="sidebar-header">
              <h2>⚔️ GAUNTLET MODE</h2>
              <div className="mode-subtitle">Trial {runState.current_trial} of 13</div>
            </div>

            <div className="stats-section">
              <div className="stat-item">
                <span className="stat-label">Current Trial:</span>
                <span className="stat-value">{runState.current_trial}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Rerolls:</span>
                <span className="stat-value">{runState.rerolls_remaining}</span>
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
              
              <button className="return-to-lobby-btn" onClick={async () => {
                const { socketService } = await import('../socketService');
                const socket = socketService.getSocket();
                if (socket && runState) {
                  socket.emit('save-and-return-to-lobby', { runState });
                  onReturnToLobby();
                }
              }}>
                🏠 Return to Lobby
              </button>
              
              <button className="abandon-run-btn" onClick={() => setShowAbandonConfirm(true)}>
                🚪 Abandon Run
              </button>
            </div>
          </div>

          {/* Center Content - Hero Selection */}
          <div className="game-content">
            <GauntletContent
              runState={runState}
              onStateUpdate={setRunState}
              isSearching={isSearching}
              onCancelSearch={async () => {
                const { socketService } = await import('../socketService');
                const socket = socketService.getSocket();
                if (socket) {
                  socket.emit('cancel-gauntlet-queue');
                  setIsSearching(false);
                }
              }}
              pendingShopAction={pendingShopAction}
              onSetPendingShopAction={setPendingShopAction}
              shopOffer={shopOffer}
              onSetShopOffer={setShopOffer}
            />
          </div>

          {/* Right Sidebar - Shop Actions */}
          <div className="action-bar gauntlet-actions">
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
        </>
      )}
    </div>
  );
};

export default GauntletMode;
