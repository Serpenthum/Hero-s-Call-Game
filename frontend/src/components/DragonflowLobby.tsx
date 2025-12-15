import React, { useState, useEffect } from 'react';
import DragonflowGame from './DragonflowGame';
import { socketService } from '../socketService';
import '../styles/DragonflowLobby.css';

interface DragonflowLobbyProps {
  onBack: () => void;
  username: string;
  userId: number;
}

interface MatchData {
  gameId: string;
  opponent: {
    username: string;
    userId: string;
  };
  yourRole: 'player1' | 'player2';
}

const DragonflowLobby: React.FC<DragonflowLobbyProps> = ({ onBack, username, userId }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [matchData, setMatchData] = useState<MatchData | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSearching) {
      interval = setInterval(() => {
        setQueueTime(prev => prev + 1);
      }, 1000);
    } else {
      setQueueTime(0);
    }
    return () => clearInterval(interval);
  }, [isSearching]);

  useEffect(() => {
    const handleMatchFound = (data: MatchData) => {
      console.log('Match found!', data);
      setMatchData(data);
      setIsSearching(false);
      setQueueTime(0);
    };

    const handleOpponentDisconnected = () => {
      alert('Your opponent has disconnected');
      setMatchData(null);
    };

    const handleError = (error: { message: string }) => {
      console.error('Dragonflow error:', error);
      alert(error.message);
      setIsSearching(false);
    };

    // Register new listeners
    socketService.onDragonflowMatchFound(handleMatchFound);
    socketService.onDragonflowOpponentDisconnected(handleOpponentDisconnected);
    socketService.onDragonflowError(handleError);

    return () => {
      // Clean up listeners on unmount
      socketService.socket?.off('dragonflow:match-found', handleMatchFound);
      socketService.socket?.off('dragonflow:opponent-disconnected', handleOpponentDisconnected);
      socketService.socket?.off('dragonflow:error', handleError);
      
      // Leave queue if still searching when component unmounts
      socketService.leaveDragonflowQueue();
    };
  }, []);

  const handleJoinQueue = () => {
    setIsSearching(true);
    socketService.joinDragonflowQueue(username);
  };

  const handleLeaveQueue = () => {
    setIsSearching(false);
    socketService.leaveDragonflowQueue();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show game if matched
  if (matchData) {
    return (
      <DragonflowGame 
        onBack={() => setMatchData(null)} 
        username={username}
        gameId={matchData.gameId}
        opponent={matchData.opponent}
        playerRole={matchData.yourRole}
      />
    );
  }

  return (
    <div className="dragonflow-lobby">
      {/* Animated Background */}
      <div className="dragonflow-background">
        <div className="dragon-particles"></div>
        <div className="flame-waves"></div>
        <div className="elemental-orbs"></div>
      </div>

      {/* Back Button */}
      <button className="dragonflow-back-btn" onClick={onBack}>
        ← Back to Hero's Call
      </button>

      {/* Main Content */}
      <div className="dragonflow-content">
        
        {/* Title Section */}
        <div className="dragonflow-title-section">
          <div className="title-glow"></div>
          <h1 className="dragonflow-title">
            <span className="title-dragon">DRAGON</span>
            <span className="title-flow">FLOW</span>
          </h1>
          <p className="dragonflow-subtitle">Elemental Dragons Battle for Supremacy</p>
          <div className="title-divider"></div>
        </div>

        {/* Dragon Icons */}
        <div className="elemental-dragons">
          <div className="dragon-icon fire-dragon">
            <div className="dragon-symbol">🔥</div>
            <span className="dragon-name">Fire</span>
          </div>
          <div className="dragon-icon earth-dragon">
            <div className="dragon-symbol">🏔️</div>
            <span className="dragon-name">Earth</span>
          </div>
          <div className="dragon-icon metal-dragon">
            <div className="dragon-symbol">⚙️</div>
            <span className="dragon-name">Metal</span>
          </div>
          <div className="dragon-icon water-dragon">
            <div className="dragon-symbol">💧</div>
            <span className="dragon-name">Water</span>
          </div>
          <div className="dragon-icon tree-dragon">
            <div className="dragon-symbol">🌳</div>
            <span className="dragon-name">Tree</span>
          </div>
        </div>

        {/* Queue Section */}
        <div className="queue-section">
          {!isSearching ? (
            <>
              <div className="welcome-text">
                <p>Welcome, <span className="player-name">{username}</span></p>
                <p className="game-info">Match with opponents in real-time dragon battles</p>
              </div>
              <button className="dragonflow-queue-btn" onClick={handleJoinQueue}>
                <span className="btn-text">Join Battle Queue</span>
                <div className="btn-ember-effect"></div>
              </button>
            </>
          ) : (
            <>
              <div className="searching-container">
                <div className="searching-text">
                  <h3>Searching for Opponent...</h3>
                  <div className="queue-timer">{formatTime(queueTime)}</div>
                </div>
                <div className="searching-animation">
                  <div className="dragon-pulse"></div>
                  <div className="dragon-pulse delay-1"></div>
                  <div className="dragon-pulse delay-2"></div>
                </div>
              </div>
              <button className="dragonflow-cancel-btn" onClick={handleLeaveQueue}>
                Leave Queue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DragonflowLobby;
