import React, { useState, useEffect } from 'react';
import { OnlinePlayer, FriendRequest } from '../types';
import { socketService } from '../socketService';
import CloseButton from './CloseButton';

interface FriendsOverlayProps {
  onClose: () => void;
  onOpenMessage: (playerId: number, playerName: string) => void;
  onSpectatePlayer: (playerId: string) => void;
  currentUserId: number;
}

// Last data seen, shown instantly when the overlay reopens while a fresh copy loads
let friendsDataCache: {
  onlinePlayers: OnlinePlayer[];
  friendIds: number[];
  friendRequests: FriendRequest[];
} | null = null;

const POLL_INTERVAL_MS = 5000;

const FriendsOverlay: React.FC<FriendsOverlayProps> = ({ 
  onClose, 
  onOpenMessage,
  onSpectatePlayer: _,
  currentUserId: __ 
}) => {
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [friendIds, setFriendIds] = useState<number[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<OnlinePlayer | null>(null);
  const [showAddFriendInput, setShowAddFriendInput] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_checkingSpectatable, setCheckingSpectatable] = useState<number | null>(null);
  const totalOnline = onlinePlayers.length + 1; // +1 for you
  const friendsOnline = onlinePlayers.filter(p => friendIds.includes(p.id)).length;

  // While the overlay is open, refresh presence every few seconds (skipped while the browser tab is hidden)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') socketService.getOnlinePlayers();
    };
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    // Show the last data we saw right away, then always fetch a fresh copy
    if (friendsDataCache) {
      setOnlinePlayers(friendsDataCache.onlinePlayers);
      setFriendIds(friendsDataCache.friendIds);
      setFriendRequests(friendsDataCache.friendRequests);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    socketService.getOnlinePlayers();
    socketService.getFriendRequests();

    // Set up socket listeners
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleOnlinePlayersResponse = (data: any) => {
      // Requested too soon after the previous one; ask again once the server's window has passed
      if (data.rateLimited) {
        window.setTimeout(() => socketService.getOnlinePlayers(), 1100);
        return;
      }
      if (data.success) {
        setOnlinePlayers(data.onlinePlayers || []);
        setFriendIds(data.friendIds || []);
        setError(null);
        
        if (!friendsDataCache) friendsDataCache = { onlinePlayers: [], friendIds: [], friendRequests: [] };
        friendsDataCache.onlinePlayers = data.onlinePlayers || [];
        friendsDataCache.friendIds = data.friendIds || [];
      } else {
        setError(data.error || 'Failed to get online players');
      }
      setLoading(false);
    };

    const handleFriendRequestsResponse = (data: any) => {
      if (data.success) {
        const requests = data.requests || [];
        setFriendRequests(requests);
        
        // Update cache
        if (!friendsDataCache) friendsDataCache = { onlinePlayers: [], friendIds: [], friendRequests: [] };
        friendsDataCache.friendRequests = requests;
      }
    };

    const handleFriendRequestResponse = (data: any) => {
      console.log('🔵 Friend request response:', data);
      if (data.success) {
        setShowAddFriendInput(false);
        setAddFriendUsername('');
        setError(null);
        // Invalidate cache so next open will refresh
        friendsDataCache = null;
      } else {
        console.log('❌ Friend request failed:', data.error);
        setError(data.error || 'Failed to send friend request');
      }
    };

    const handleFriendRequestReceived = (_data: any) => {
      // Just invalidate cache, don't auto-refresh while window is open
      friendsDataCache = null;
      // Only fetch if we're currently viewing (not loading means we have data displayed)
      if (!loading) {
        socketService.getFriendRequests();
      }
    };

    const handleFriendResponseResult = (data: any) => {
      if (data.success) {
        // Accepting/declining changes both the requests and who counts as a friend
        socketService.getFriendRequests();
        socketService.getOnlinePlayers();
      }
    };

    const handleRemoveFriendResponse = (data: any) => {
      if (data.success) {
        console.log('Friend removed successfully');
        // Invalidate cache so next open will refresh
        friendsDataCache = null;
        setError(null);
      } else {
        console.log('Failed to remove friend:', data.error);
        setError(data.error || 'Failed to remove friend');
      }
    };

    const handlePlayerSpectatableResult = (data: any) => {
      setCheckingSpectatable(null);
      if (data.success && data.canSpectate && data.gameInfo) {
        // Player is in a spectatable game - spectate them
        // Call the socketService directly to spectate
        const gameId = data.gameInfo.gameId;
        const targetPlayerId = data.gameInfo.playerId;
        console.log('👁️ Spectating game:', gameId, 'player:', targetPlayerId);
        socketService.spectateGame(gameId, targetPlayerId);
      } else {
        setError('This player is not currently in a spectatable game');
        setTimeout(() => setError(null), 3000);
      }
    };

    const handlePlayerOnlineStatusChanged = (data: any) => {
      const { userId, username, online } = data;
      
      if (online) {
        setOnlinePlayers(prev => (prev.some(p => p.id === userId) ? prev : [...prev, { id: userId, username, isInGame: false }]));
      } else {
        setOnlinePlayers(prev => prev.filter(p => p.id !== userId));
      }
    };

    socket.on('online-players-response', handleOnlinePlayersResponse);
    socket.on('friend-requests-response', handleFriendRequestsResponse);
    socket.on('friend-request-response', handleFriendRequestResponse);
    socket.on('friend-request-received', handleFriendRequestReceived);
    socket.on('friend-response-result', handleFriendResponseResult);
    socket.on('remove-friend-response', handleRemoveFriendResponse);
    socket.on('player-spectatable-result', handlePlayerSpectatableResult);
    socket.on('player-online-status-changed', handlePlayerOnlineStatusChanged);

    // Cleanup function to remove listeners when component unmounts (friends window closes)
    return () => {
      console.log('🔴 Friends window closing - cleaning up socket listeners');
      socket.off('online-players-response', handleOnlinePlayersResponse);
      socket.off('friend-requests-response', handleFriendRequestsResponse);
      socket.off('friend-request-response', handleFriendRequestResponse);
      socket.off('friend-request-received', handleFriendRequestReceived);
      socket.off('friend-response-result', handleFriendResponseResult);
      socket.off('remove-friend-response', handleRemoveFriendResponse);
      socket.off('player-spectatable-result', handlePlayerSpectatableResult);
      socket.off('player-online-status-changed', handlePlayerOnlineStatusChanged);
    };
  }, []); // Empty dependency array means this runs once when component mounts and cleanup when unmounts

  const handlePlayerAction = (player: OnlinePlayer, action: 'addFriend' | 'message' | 'watchGame' | 'removeFriend') => {
    switch (action) {
      case 'addFriend':
        socketService.sendFriendRequest(player.username);
        setSelectedPlayer(null);
        break;
      case 'removeFriend':
        socketService.removeFriend(player.id);
        setSelectedPlayer(null);
        break;
      case 'message':
        onOpenMessage(player.id, player.username);
        setSelectedPlayer(null);
        break;
      case 'watchGame':
        // Check if player is in a spectatable game
        setCheckingSpectatable(player.id);
        setError(null);
        socketService.checkPlayerSpectatable(player.id.toString());
        setSelectedPlayer(null);
        break;
    }
  };

  const handleAddFriendSubmit = () => {
    const username = addFriendUsername.trim();
    if (username) {
      console.log('🔵 Sending friend request to:', username);
      setError(null); // Clear any previous errors
      socketService.sendFriendRequest(username);
    } else {
      setError('Please enter a username');
    }
  };

  const handleFriendRequestResponse = (requesterId: number, accept: boolean) => {
    socketService.respondToFriendRequest(requesterId, accept);
  };

  const sortedPlayers = [...onlinePlayers].sort((a, b) => {
    const aIsFriend = friendIds.includes(a.id);
    const bIsFriend = friendIds.includes(b.id);
    
    // Friends first
    if (aIsFriend && !bIsFriend) return -1;
    if (!aIsFriend && bIsFriend) return 1;
    
    // Then alphabetically
    return a.username.localeCompare(b.username);
  });

  return (
    <div className="friends-overlay-backdrop">
      <div className="friends-overlay">
        <div className="friends-overlay-header">
          <h3>Friends</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="friends-overlay-content">
          {/* Friend Requests Section */}
          {friendRequests.length > 0 && (
            <div className="friend-requests-section">
              <h4>Friend Requests ({friendRequests.length})</h4>
              <div className="friend-requests-list">
                {friendRequests.map((request) => (
                  <div key={request.id} className="friend-request-item">
                    <span className="request-username">{request.username}</span>
                    <div className="request-actions">
                      <button 
                        className="accept-button"
                        onClick={() => handleFriendRequestResponse(request.id, true)}
                      >
                        ✓
                      </button>
                      <button 
                        className="reject-button"
                        onClick={() => handleFriendRequestResponse(request.id, false)}
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Friend Section */}
          <div className="add-friend-section">
            {!showAddFriendInput ? (
              <button 
                className="add-friend-button"
                onClick={() => {
                  setShowAddFriendInput(true);
                  setError(null); // Clear errors when opening input
                }}
              >
                + Add Friend
              </button>
            ) : (
              <div className="add-friend-input-section">
                <input
                  type="text"
                  placeholder="Enter username"
                  value={addFriendUsername}
                  onChange={(e) => setAddFriendUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddFriendSubmit()}
                  className="add-friend-input"
                  autoFocus
                />
                <button onClick={handleAddFriendSubmit} className="send-request-button">
                  Send
                </button>
                <button 
                  onClick={() => {
                    setShowAddFriendInput(false);
                    setAddFriendUsername('');
                    setError(null); // Clear errors when canceling
                  }}
                  className="cancel-button"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Online Players List */}
          <div className="online-players-section">
            <div className="online-players-header">
              <h4>Online Players{friendsOnline > 0 && ` · ${friendsOnline} friend${friendsOnline === 1 ? '' : 's'}`}</h4>
            </div>
            
            {loading ? (
              <div className="loading">Loading...</div>
            ) : error ? (
              <div className="error">{error}</div>
            ) : (
              <>
                <div className="players-list">
                  {sortedPlayers.length > 0 ? (
                    sortedPlayers.map((player) => {
                      const isFriend = friendIds.includes(player.id);
                      return (
                        <div key={player.id} className="player-item">
                          <div 
                            className={`player-info ${isFriend ? 'friend' : ''}`}
                            onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
                          >
                            <span className="player-username">{player.username || 'Unknown Player'}</span>
                            {isFriend && <span className="friend-badge">Friend</span>}
                            {player.isInGame && <span className="in-game-badge">In Game</span>}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="no-players-message" style={{textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '20px'}}>
                      No other players are currently online
                    </div>
                  )}
                </div>

                <div className="online-count">
                  Players online: <span className="count">{totalOnline}</span>
                  {totalOnline === 1 && <span style={{color: '#666', fontSize: '12px'}}> (just you)</span>}
                </div>
              </>
            )}
          </div>
          
          {/* Player Tooltip - positioned outside the container */}
          {selectedPlayer && (
            <div className="player-tooltip">
              <button 
                className="tooltip-action message-action"
                onClick={() => handlePlayerAction(selectedPlayer, 'message')}
              >
                💬 Message
              </button>
              
              {!friendIds.includes(selectedPlayer.id) ? (
                <button 
                  className="tooltip-action add-friend-action"
                  onClick={() => handlePlayerAction(selectedPlayer, 'addFriend')}
                >
                  👥 Add Friend
                </button>
              ) : (
                <button 
                  className="tooltip-action remove-friend-action"
                  onClick={() => handlePlayerAction(selectedPlayer, 'removeFriend')}
                >
                  ❌ Remove Friend
                </button>
              )}
              
              <button 
                className={`tooltip-action watch-action ${!selectedPlayer.isInGame ? 'disabled' : ''}`}
                onClick={() => handlePlayerAction(selectedPlayer, 'watchGame')}
                disabled={!selectedPlayer.isInGame}
              >
                👁️ Watch Game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendsOverlay;
