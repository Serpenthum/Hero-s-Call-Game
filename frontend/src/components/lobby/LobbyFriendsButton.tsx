import React from 'react';
import { useFriendsOnline } from '../../lobby/useFriendsOnline';

export interface LobbyFriendsProps {
  onToggle(): void;
  isOpen: boolean;
  notificationCount: number;
  // minimized: a chat is minimised (shown as a small dot when nothing is unread)
  messages: { show: boolean; onClick(): void; count: number; minimized: boolean };
}

const badgeText = (count: number) => (count > 9 ? '9+' : String(count));

// Friends (with a green dot while a friend is online) and, when there are unread or minimised chats, Messages.
const LobbyFriendsButton: React.FC<LobbyFriendsProps> = ({ onToggle, isOpen, notificationCount, messages }) => {
  const friendOnline = useFriendsOnline();
  const friendsLabel = [
    'Friends',
    notificationCount > 0 ? `${notificationCount} new` : null,
    friendOnline ? 'a friend is online' : null,
  ].filter(Boolean).join(', ');

  return (
    <>
      <button
        type="button"
        className={`lobby-bar-btn lobby-friends${isOpen ? ' is-open' : ''}`}
        onClick={onToggle}
        aria-label={friendsLabel}
        aria-expanded={isOpen}
        title="Friends"
      >
        <span className="lobby-bar-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="8" r="4" />
            <path d="M1.5 21c0-4 3.4-7 7.5-7s7.5 3 7.5 7z" />
            <circle cx="17.5" cy="9" r="3" />
            <path d="M17 14.2c3.2.2 5.5 2.6 5.5 5.8h-4" />
          </svg>
          {friendOnline && <span className="lobby-friends-online" aria-hidden="true" />}
        </span>
        <span className="lobby-bar-btn-label">Friends</span>
        {notificationCount > 0 && <span className="lobby-bar-badge" aria-hidden="true">{badgeText(notificationCount)}</span>}
      </button>
      {messages.show && (
        <button
          type="button"
          className="lobby-bar-btn lobby-messages"
          onClick={messages.onClick}
          aria-label={messages.count > 0 ? `Messages, ${messages.count} unread` : messages.minimized ? 'Messages, minimised chat' : 'Messages'}
          title="Messages"
        >
          <span className="lobby-bar-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
            </svg>
            {messages.minimized && messages.count === 0 && <span className="lobby-messages-minimized" aria-hidden="true" />}
          </span>
          <span className="lobby-bar-btn-label">Messages</span>
          {messages.count > 0 && <span className="lobby-bar-badge" aria-hidden="true">{badgeText(messages.count)}</span>}
        </button>
      )}
    </>
  );
};

export default LobbyFriendsButton;
