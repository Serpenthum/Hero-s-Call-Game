import React, { useState, useEffect } from 'react';
import SurvivalTeamBuilder from './SurvivalTeamBuilder';
import SurvivalProgress from './SurvivalProgress';
import SurvivalUsedHeroes from './SurvivalUsedHeroes';
import RewardsDisplay from './RewardsDisplay';
import '../styles/SurvivalMode.css';

interface Hero {
  name: string;
  HP: number;
  Defense: number;
  Accuracy: string;
  BasicAttack: string;
  Ability: any[];
  Special: any;
  disabled?: boolean;
}

interface SurvivalState {
  wins: number;
  losses: number;
  usedHeroes: string[];
  currentTeam: Hero[];
  isActive: boolean;
}

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
  favorite_heroes: string[];
}

interface SurvivalModeProps {
  onReturnToLobby: () => void;
  onStartBattle: (team: Hero[]) => void;
  onCancelSearch?: () => void;
  isSearchingForMatch?: boolean;
  user?: User;
  rewardsData?: {
    oldXP: number;
    newXP: number;
    xpGained: number;
    oldLevel: number;
    newLevel: number;
    oldVictoryPoints: number;
    newVictoryPoints: number;
    victoryPointsGained: number;
    leveledUp: boolean;
  };
}

const SurvivalMode: React.FC<SurvivalModeProps> = ({ onReturnToLobby, onStartBattle, onCancelSearch, isSearchingForMatch = false, user, rewardsData }) => {
  const [survivalState, setSurvivalState] = useState<SurvivalState>({
    wins: user?.survival_wins || 0,
    losses: user?.survival_losses || 0,
    usedHeroes: user?.survival_used_heroes || [],
    currentTeam: [],
    isActive: true
  });

  const [showEndModal, setShowEndModal] = useState(false);
  const [endMessage, setEndMessage] = useState('');
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  // Update survival state when user data changes
  useEffect(() => {
    if (user) {
      console.log('🔄 SurvivalMode: Updating state from user data:', {
        wins: user.survival_wins,
        losses: user.survival_losses,
        usedHeroes: user.survival_used_heroes
      });
      
      setSurvivalState(prev => ({
        ...prev,
        wins: user.survival_wins || 0,
        losses: user.survival_losses || 0,
        usedHeroes: user.survival_used_heroes || []
      }));
    }
  }, [user]);

  // Load survival state from server on component mount
  useEffect(() => {
    console.log('🔄 SurvivalMode: Setting up survival state listeners...');
    
    let cleanupFunctions: (() => void)[] = [];
    
    const setupSocketListeners = async () => {
      const { socketService } = await import('../socketService');
      
      // Ensure socket is connected
      const socket = socketService.getSocket() || socketService.connect();
      
      if (socket) {
        // Wait for connection if needed
        if (!socket.connected) {
          await new Promise<void>((resolve) => {
            if (socket.connected) {
              resolve();
            } else {
              socket.once('connect', () => resolve());
            }
          });
        }
        
        console.log('🔄 SurvivalMode: Requesting survival state from server...');
        // Request current survival state
        socketService.getSurvivalState();
        
        // Listen for survival state response
        const handleStateResponse = (data: { state: { wins: number; losses: number; usedHeroes: string[]; isActive: boolean } }) => {
          console.log('🔄 SurvivalMode: Received state from server:', data.state);
          setSurvivalState(prev => ({
            ...prev,
            wins: data.state.wins,
            losses: data.state.losses,
            usedHeroes: data.state.usedHeroes,
            isActive: data.state.isActive
          }));
        };

        // Listen for survival state updates (win/loss/reset)
        const handleStateUpdate = (data: { type: 'win' | 'loss' | 'reset'; state: { wins: number; losses: number; usedHeroes: string[]; isActive: boolean }; runEnded?: boolean; message: string; victoryPoints?: number }) => {
          console.log('🏆 SurvivalMode: Received state update:', data.type, data.state, 'runEnded:', data.runEnded);
          
          // For resets (abandoned runs) with victory points, show the end modal with rewards
          if (data.type === 'reset' && data.victoryPoints && data.victoryPoints > 0) {
            // Show end modal for abandoned run
            setEndMessage(`Survival run abandoned! You earned ${data.victoryPoints} victory point${data.victoryPoints !== 1 ? 's' : ''} for your wins.`);
            setShowEndModal(true);
          }
          
          setSurvivalState(prev => ({
            ...prev,
            wins: data.state.wins,
            losses: data.state.losses,
            usedHeroes: data.state.usedHeroes,
            isActive: data.state.isActive
          }));
          
          // Check for end conditions based on the runEnded flag from server
          if (data.runEnded) {
            if (data.type === 'loss') {
              setEndMessage(`Your survival run has ended with ${data.state.wins} wins. Better luck next time!`);
              setShowEndModal(true);
            } else if (data.type === 'win') {
              setEndMessage(`Congratulations! You achieved 7 wins in Survival mode!`);
              setShowEndModal(true);
            }
          }
        };

        socket.on('survival-state-response', handleStateResponse);
        socket.on('survival-state-update', handleStateUpdate);

        // Store cleanup functions
        cleanupFunctions.push(() => {
          socket.off('survival-state-response', handleStateResponse);
          socket.off('survival-state-update', handleStateUpdate);
        });
      }
    };

    setupSocketListeners();

    // Cleanup on unmount
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, []);

  // End condition checks are now handled in the handleStateUpdate callback above
  // to ensure they only trigger on actual win/loss updates, not on every state change

  const handleTeamSelected = (team: Hero[]) => {
    setSurvivalState(prev => ({
      ...prev,
      currentTeam: team
    }));
    onStartBattle(team);
  };

  const handleCancelSearch = () => {
    if (onCancelSearch) {
      onCancelSearch();
    }
  };



  const handleAbandonRun = () => {
    setShowAbandonConfirm(true);
  };

  const handleConfirmAbandon = () => {
    console.log('🔄 Abandoning survival run - requesting reset from server');
    setShowAbandonConfirm(false);
    import('../socketService').then(({ socketService }) => {
      socketService.resetSurvivalState();
    });
  };

  const handleCancelAbandon = () => {
    setShowAbandonConfirm(false);
  };

  const handleEndModalClose = () => {
    // Request server to reset survival state
    console.log('🔄 Closing end modal - requesting server to reset survival state');
    import('../socketService').then(({ socketService }) => {
      socketService.resetSurvivalState();
    });
    
    // Close the modal
    setShowEndModal(false);
  };

  if (showAbandonConfirm) {
    return (
      <div className="survival-end-modal">
        <div className="survival-end-content">
          <h2>Abandon Survival Run?</h2>
          <p>Are you sure you want to abandon your current survival run? This will reset your wins ({survivalState.wins}), losses ({survivalState.losses}), and used heroes.</p>
          {survivalState.wins > 0 && (
            <p className="survival-victory-points-info">
              <strong>You will receive {survivalState.wins} victory point{survivalState.wins !== 1 ? 's' : ''} for your current wins!</strong>
            </p>
          )}
          <div className="survival-end-buttons">
            <button className="survival-btn danger" onClick={handleConfirmAbandon}>
              Yes, Abandon Run
            </button>
            <button className="survival-btn secondary" onClick={handleCancelAbandon}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showEndModal) {
    return (
      <div className="survival-end-modal">
        <div className="survival-end-content">
          <h2>Survival Run Complete</h2>
          <p>{endMessage}</p>
          
          {/* Rewards Display */}
          {rewardsData && (
            <RewardsDisplay
              oldXP={rewardsData.oldXP}
              newXP={rewardsData.newXP}
              xpGained={rewardsData.xpGained}
              oldLevel={rewardsData.oldLevel}
              newLevel={rewardsData.newLevel}
              oldVictoryPoints={rewardsData.oldVictoryPoints}
              newVictoryPoints={rewardsData.newVictoryPoints}
              victoryPointsGained={rewardsData.victoryPointsGained}
              leveledUp={rewardsData.leveledUp}
            />
          )}
          
          <div className="survival-end-buttons">
            <button className="survival-btn primary" onClick={handleEndModalClose}>
              Start New Run
            </button>
            <button className="survival-btn secondary" onClick={onReturnToLobby}>
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="survival-mode-container">
      <div className="survival-header">
        <h1>Survival Mode</h1>
        <div className="survival-header-buttons">
          <button className="survival-btn danger" onClick={handleAbandonRun}>
            Abandon Run
          </button>
          <button className="survival-btn secondary" onClick={onReturnToLobby}>
            Return to Lobby
          </button>
        </div>
      </div>

      <div className="survival-content">
        <div className="survival-sidebar">
          <SurvivalProgress wins={survivalState.wins} losses={survivalState.losses} />
          <SurvivalUsedHeroes usedHeroes={survivalState.usedHeroes} />
        </div>

        <div className="survival-main">
          <SurvivalTeamBuilder
            usedHeroes={survivalState.usedHeroes}
            onTeamSelected={handleTeamSelected}
            currentTeam={survivalState.currentTeam}
            onCancelSearch={handleCancelSearch}
            isSearching={isSearchingForMatch}
            user={user}
          />
        </div>
      </div>
    </div>
  );
};

export default SurvivalMode;