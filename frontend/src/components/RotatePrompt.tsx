import React from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/Icon';

// Shown by CSS only on upright touch screens (see GameTheme.css); the game keeps running behind it.
// Portalled to body so it covers the card reader and every modal.
const RotatePrompt: React.FC = () => createPortal(
  <div className="rotate-prompt" role="alert">
    <Icon name="rotate" size={56} className="rotate-prompt-icon" />
    <h2>Rotate your device</h2>
    <p>Hero's Call is played sideways. Your game is still running.</p>
  </div>,
  document.body,
);

export default RotatePrompt;
