// "Show holographic effects": a per-device setting. Off draws holographic cards plain.
const HOLO_KEY = 'heroscall.holo';

export function getHoloEffects(): boolean {
  try {
    return localStorage.getItem(HOLO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHoloEffects(on: boolean): void {
  try {
    localStorage.setItem(HOLO_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting lasts only until the page reloads
  }
}

/** Whether the player owns this hero holographic (for screens showing their own collection). */
export function isHolo(user: { holo_heroes?: string[] } | null | undefined, name: string): boolean {
  return !!user?.holo_heroes?.includes(name);
}
