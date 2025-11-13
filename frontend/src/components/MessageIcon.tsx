import React from 'react';

interface MessageIconProps {
  onClick: () => void;
  hasNotifications: boolean;
  notificationCount?: number;
}

const MessageIcon: React.FC<MessageIconProps> = ({ 
  onClick, 
  hasNotifications, 
  notificationCount = 0 
}) => {
  return (
    <div 
      className={`message-icon ${hasNotifications ? 'has-notifications' : ''}`}
      onClick={onClick}
    >
      <div className="message-icon-content">
        <svg 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="currentColor"
          className="message-icon-svg"
        >
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
        </svg>
        
        {hasNotifications && (
          <div className="notification-badge">
            {notificationCount > 9 ? '9+' : notificationCount || ''}
          </div>
        )}
      </div>
      
      <div className="message-icon-tooltip">
        Messages
      </div>
    </div>
  );
};

export default MessageIcon;