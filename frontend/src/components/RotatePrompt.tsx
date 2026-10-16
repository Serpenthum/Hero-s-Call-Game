import React from 'react';
import Icon from './ui/Icon';

// Shown by CSS only when the screen is narrow and upright (see GameTheme.css); the game keeps running behind it.
const RotatePrompt: React.FC = () => (
  <div className="rotate-prompt" role="alert">
    <Icon name="rotate" size={56} className="rotate-prompt-icon" />
    <h2>Rotate your phone</h2>
    <p>Hero's Call is played sideways. Your game is still running.</p>
  </div>
);

export default RotatePrompt;
