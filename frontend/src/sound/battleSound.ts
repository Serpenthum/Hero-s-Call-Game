// Battle sound effects: listens to the battle event bus (not BattleFX), so sounds play even with animation speed off.
import { battleEventBus, getAnimSpeed, sfx } from '../battleAnimations';
import { playSound } from './effects';
import { soundsForEvent } from './heroSounds';

export function startBattleSound(): () => void {
  return battleEventBus.subscribe(ev => {
    for (const cue of soundsForEvent(ev, getAnimSpeed())) {
      if (cue.sound === 'synth.tick') {
        // Poison, auras and other end-of-turn damage keep today's synthesized hit.
        window.setTimeout(() => sfx.hit(false), cue.delayMs);
      } else {
        playSound(cue.sound, { delayMs: cue.delayMs });
      }
    }
  });
}
