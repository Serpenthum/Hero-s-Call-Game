import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../types';
import { socketService } from '../socketService';

interface MessageChatProps {
  targetUserId: number;
  targetUsername: string;
  currentUserId: number;
  onClose: () => void;
  onMinimize: () => void;
}

const MessageChat: React.FC<MessageChatProps> = ({
  targetUserId,
  targetUsername,
  currentUserId,
  onClose,
  onMinimize
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 60, y: 100 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  
  const chatRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Position the chat window consistently relative to friends icon position
    // Friends icon is at bottom: 20px, left: 50px (from App.css .friends-icon)
    // Chat should appear to the right of the friends area
    const chatX = 120; // To the right of friends icon (50px + icon width + margin)
    const chatY = Math.max(window.innerHeight - 420, 50); // Align with friends area
    setPosition({ x: chatX, y: chatY });
  }, []);

  useEffect(() => {
    // Load initial messages
    socketService.getMessages(targetUserId);

    // Set up socket listeners
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleMessagesResponse = (data: any) => {
      if (data.success) {
        setMessages(data.messages || []);
        setLoading(false);
      }
    };

    const handleMessageResponse = (data: any) => {
      if (data.success && data.message) {
        // Add the sent message to the list
        setMessages(prev => [...prev, data.message]);
        setNewMessage('');
      }
    };

    const handleMessageReceived = (message: Message) => {
      // Only add if it's from the user we're chatting with
      if (message.sender_id === targetUserId) {
        setMessages(prev => [...prev, message]);
      }
    };

    socket.on('messages-response', handleMessagesResponse);
    socket.on('message-response', handleMessageResponse);
    socket.on('message-received', handleMessageReceived);

    return () => {
      socket.off('messages-response', handleMessagesResponse);
      socket.off('message-response', handleMessageResponse);
      socket.off('message-received', handleMessageReceived);
    };
  }, [targetUserId]);

  const handleSendMessage = () => {
    const trimmedMessage = newMessage.trim();
    if (trimmedMessage) {
      socketService.sendMessage(targetUserId, trimmedMessage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Dragging functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chat-header')) {
      setIsDragging(true);
      const rect = chatRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      ref={chatRef}
      className="message-chat-window"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="chat-header" style={{ cursor: 'grab' }}>
        <div className="chat-title">
          {targetUsername}
        </div>
        <div className="chat-controls">
          <button className="chat-minimize-button" onClick={onMinimize} title="Minimize">
            −
          </button>
          <button className="chat-close-button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>

      <div className="chat-body">
        <div className="messages-container">
          {loading ? (
            <div className="chat-loading">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="no-messages">No messages yet. Start the conversation!</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.sender_id === currentUserId ? 'sent' : 'received'}`}
              >
                <div className="message-content">
                  {message.message}
                </div>
                <div className="message-time">
                  {formatTime(message.created_at)}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="message-input-container">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="message-input"
            rows={2}
            maxLength={500}
          />
          <button
            onClick={handleSendMessage}
            className="send-button"
            disabled={!newMessage.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageChat;