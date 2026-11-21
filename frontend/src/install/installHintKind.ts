export type InstallHintKind = 'android' | 'ios' | null;

export const INSTALL_HINT_DISMISSED_KEY = 'heroscall.installHintDismissed';

export interface InstallHintEnv {
  isTouch: boolean;
  isStandalone: boolean;
  dismissed: boolean;
  userAgent: string;
  hasInstallPrompt: boolean;
}

// iPadOS Safari reports a Mac user agent by default; a touch "Mac" is an iPad.
const isIos = (userAgent: string, isTouch: boolean) =>
  /iPhone|iPad|iPod/.test(userAgent) || (isTouch && /Macintosh/.test(userAgent));

// Which install hint the lobby shows: never on computers, inside the installed app, or once dismissed.
export function installHintKind(env: InstallHintEnv): InstallHintKind {
  if (!env.isTouch || env.isStandalone || env.dismissed) return null;
  if (isIos(env.userAgent, env.isTouch)) return 'ios';
  if (env.hasInstallPrompt) return 'android';
  return null;
}
