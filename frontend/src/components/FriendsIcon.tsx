import React from 'react';

interface FriendsIconProps {
  onClick: () => void;
  hasNotifications: boolean;
  notificationCount?: number;
  isOpen?: boolean;
}

const FriendsIcon: React.FC<FriendsIconProps> = ({ 
  onClick, 
  hasNotifications, 
  notificationCount = 0,
  isOpen = false
}) => {
  return (
    <div 
      className={`friends-icon ${hasNotifications ? 'has-notifications' : ''}`}
      onClick={onClick}
    >
      <div className="friends-icon-content">
        <svg 
          width="28" 
          height="28" 
          viewBox="0 0 24 24" 
          fill="currentColor"
          className="friends-icon-svg"
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          <path d="M16.5 12c1.38 0 2.49-1.12 2.49-2.5S17.88 7 16.5 7c-.17 0-.33.02-.5.05.31.55.5 1.21.5 1.95s-.19 1.4-.5 1.95c.17.03.33.05.5.05zm0 1c-1.33 0-2.7.14-4 .39 1.99.92 3.5 2.3 4 3.61h5v-2c0-1.66-2.67-2-5-2z"/>
        </svg>
        
        {hasNotifications && (
          <div className="notification-badge">
            {notificationCount > 9 ? '9+' : notificationCount || ''}
          </div>
        )}
      </div>
      
      {!isOpen && (
        <div className="friends-icon-tooltip">
          Friends
        </div>
      )}
    </div>
  );
};

export default FriendsIcon;