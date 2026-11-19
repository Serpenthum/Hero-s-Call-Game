import { useEffect, useState } from 'react';
import { socketService } from '../socketService';

// How often the lobby asks who is online (only while the browser tab is visible)
const REFRESH_MS = 30000;
// The server turns away requests that come too fast; ask again once its window has passed
const RATE_LIMIT_RETRY_MS = 1100;

interface OnlinePlayersResponse {
  success?: boolean;
  onlinePlayers?: { id: number }[];
  friendIds?: number[];
  rateLimited?: boolean;
}

interface OnlineStatusChange {
  userId: number;
  online: boolean;
}

// True while at least one of the player's friends is online: drives the green dot on the lobby's Friends button.
export function useFriendsOnline(): boolean {
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [friendIds, setFriendIds] = useState<number[]>([]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    let retryTimer: number | undefined;
    let retried = false;

    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      retried = false;
      socketService.getOnlinePlayers();
    };

    const handleResponse = (data: OnlinePlayersResponse) => {
      if (data.rateLimited) {
        // Retry once per ask; the Friends overlay's own polling can also be turned away
        if (!retried) {
          retried = true;
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => socketService.getOnlinePlayers(), RATE_LIMIT_RETRY_MS);
        }
        return;
      }
      if (!data.success) return;
      setOnlineIds((data.onlinePlayers || []).map(p => p.id));
      setFriendIds(data.friendIds || []);
    };

    const handleStatusChange = (data: OnlineStatusChange) => {
      setOnlineIds(prev => {
        if (data.online) return prev.includes(data.userId) ? prev : [...prev, data.userId];
        return prev.filter(id => id !== data.userId);
      });
    };

    // player-online-status-changed is not in the typed event list, so listen through an untyped view
    const untyped = socket as unknown as {
      on(event: string, fn: (data: never) => void): void;
      off(event: string, fn: (data: never) => void): void;
    };
    untyped.on('online-players-response', handleResponse);
    untyped.on('player-online-status-changed', handleStatusChange);

    ask();
    const interval = window.setInterval(ask, REFRESH_MS);
    document.addEventListener('visibilitychange', ask);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', ask);
      untyped.off('online-players-response', handleResponse);
      untyped.off('player-online-status-changed', handleStatusChange);
    };
  }, []);

  return friendIds.some(id => onlineIds.includes(id));
}
