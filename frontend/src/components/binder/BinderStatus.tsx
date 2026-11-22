// The line under the book: which page, how many heroes are owned, how many are holographic.
import React from 'react';

export const BinderStatus: React.FC<{ text: string }> = ({ text }) => (
  <p className="binder-status" aria-live="polite">{text}</p>
);
