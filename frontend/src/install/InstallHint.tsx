import React, { useEffect, useState } from 'react';
import CloseButton from '../components/CloseButton';
import { installHintKind, INSTALL_HINT_DISMISSED_KEY } from './installHint.ts';
import '../styles/InstallHint.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

// Chrome fires beforeinstallprompt once, often before the lobby mounts, so keep it from page load.
let savedPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    savedPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    savedPrompt = null;
    notify();
  });
}

const readDismissed = () => {
  try { return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === '1'; } catch { return false; }
};

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Bottom of the lobby: how to play full screen. Touch devices only, never inside the installed app.
const InstallHint: React.FC = () => {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [, rerender] = useState(0);

  useEffect(() => {
    const onChange = () => rerender(n => n + 1);
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  const kind = installHintKind({
    isTouch: window.matchMedia('(pointer: coarse)').matches,
    isStandalone: isStandalone(),
    dismissed,
    userAgent: navigator.userAgent,
    hasInstallPrompt: savedPrompt !== null,
  });
  if (!kind) return null;

  const dismiss = () => {
    try { localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1'); } catch { /* private mode: hide for this visit only */ }
    setDismissed(true);
  };

  const install = async () => {
    const event = savedPrompt;
    if (!event) return;
    savedPrompt = null; // a prompt event can only be used once
    await event.prompt();
    notify();
  };

  return (
    <div className="install-hint ui-panel" role="status">
      {kind === 'android' ? (
        <>
          <p className="install-hint-text">Play full screen: install Hero's Call.</p>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={install}>Install</button>
        </>
      ) : (
        <p className="install-hint-text">Play full screen: tap Share, then Add to Home Screen.</p>
      )}
      <CloseButton onClick={dismiss} label="Dismiss" />
    </div>
  );
};

export default InstallHint;
