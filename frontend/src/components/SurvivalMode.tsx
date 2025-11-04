import React, { useState, useEffect } from 'react';
import SurvivalTeamBuilder from './SurvivalTeamBuilder';
import SurvivalProgress from './SurvivalProgress';
import SurvivalUsedHeroes from './SurvivalUsedHeroes';
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
}

interface SurvivalModeProps {
  onReturnToLobby: () => void;
  onStartBattle: (team: Hero[]) => void;
  onCancelSearch?: () => void;
  isSearchingForMatch?: boolean;
  user?: User;
}

const SurvivalMode: React.FC<SurvivalModeProps> = ({ onReturnToLobby, onStartBattle, onCancelSearch, isSearchingForMatch = false, user }) => {
  const [survivalState, setSurvivalState] = useState<SurvivalState>({
    wins: 0,
    losses: 0,
    usedHeroes: [],
    currentTeam: [],
    isActive: true
  });

  const [showEndModal, setShowEndModal] = useState(false);
  const [endMessage, setEndMessage] = useState('');
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

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
        const handleStateUpdate = (data: { type: 'win' | 'loss' | 'reset'; state: { wins: number; losses: number; usedHeroes: string[]; isActive: boolean }; message: string }) => {
          console.log('🏆 SurvivalMode: Received state update:', data.type, data.state);
          setSurvivalState(prev => ({
            ...prev,
            wins: data.state.wins,
            losses: data.state.losses,
            usedHeroes: data.state.usedHeroes,
            isActive: data.state.isActive
          }));
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

  // No longer needed - state is managed by server via WebSocket

  // Check for end conditions
  useEffect(() => {
    if (survivalState.wins >= 7) {
      setEndMessage(`Congratulations! You achieved 7 wins in Survival mode!`);
      setShowEndModal(true);
    } else if (survivalState.losses >= 3) {
      setEndMessage(`Your survival run has ended with ${survivalState.wins} wins. Better luck next time!`);
      setShowEndModal(true);
    }
  }, [survivalState.wins, survivalState.losses]);

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
    // Reset survival data when closing end modal
    setSurvivalState({
      wins: 0,
      losses: 0,
      usedHeroes: [],
      currentTeam: [],
      isActive: true
    });
    setShowEndModal(false);
  };

  if (showAbandonConfirm) {
    return (
      <div className="survival-end-modal">
        <div className="survival-end-content">
          <h2>Abandon Survival Run?</h2>
          <p>Are you sure you want to abandon your current survival run? This will reset your wins ({survivalState.wins}), losses ({survivalState.losses}), and used heroes.</p>
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