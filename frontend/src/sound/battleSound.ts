// Battle sound effects: listens to the battle event bus (not BattleFX), so sounds play even with animation speed off.
import { battleEventBus, getAnimSpeed, sfx } from '../battleAnimations';
import { playSound } from './effects';
import { soundsForEvent } from './heroSounds';

export function startBattleSound(): () => void {
  return battleEventBus.subscribe(ev => {
    // Sound is optional: nothing here may throw into the bus or the socket handler behind it.
    try {
      for (const cue of soundsForEvent(ev, getAnimSpeed())) {
        if (cue.sound === 'synth.tick') {
          // Poison, auras and other end-of-turn damage keep today's synthesized hit.
          window.setTimeout(() => { try { sfx.hit(false); } catch { /* ignore */ } }, cue.delayMs);
        } else if (cue.sound === 'synth.death') {
          window.setTimeout(() => { try { sfx.death(); } catch { /* ignore */ } }, cue.delayMs);
        } else {
          playSound(cue.sound, { delayMs: cue.delayMs });
        }
      }
    } catch (err) {
      // skip this event's sounds
      console.warn('battle sound failed', err);
    }
  });
}
