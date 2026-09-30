import { useCallback, useEffect, useRef, useState } from 'react';
import { PendingQuestReward } from './types';
import { getAnimSpeed, speedFactor } from './battleAnimations';

export type QuestStage = 'idle' | 'check' | 'prompt' | 'counting';

interface Totals { xp: number; level: number; vp: number }

// Mirrors XPBar: level N needs N * 25 XP, capped at 500.
const xpForLevel = (level: number) => (level >= 20 ? 500 : level * 25);

const toAbsoluteXP = (level: number, xp: number) => {
  let total = xp;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
};

const fromAbsoluteXP = (absolute: number) => {
  let level = 1;
  let xp = absolute;
  while (level < 20 && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }
  return { level, xp };
};

/**
 * Runs the lobby reveal: check mark -> prompt -> XP/VP count-up.
 * While a reward is pending the header shows the pre-reward totals.
 */
export function useQuestReveal(pending: PendingQuestReward | null, live: Totals, onClaim: () => void) {
  const [stage, setStage] = useState<QuestStage>('idle');
  const [shown, setShown] = useState<Totals | null>(null);
  const [levelFlash, setLevelFlash] = useState(false);
  const rafRef = useRef<number | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const hasPending = pending !== null;

  useEffect(() => {
    if (!hasPending) return;
    const speed = getAnimSpeed();
    const f = speed === 'off' ? 0 : speedFactor(speed);
    const toCheck = window.setTimeout(() => setStage('check'), 700 * f);
    const toPrompt = window.setTimeout(() => setStage('prompt'), 1700 * f);
    return () => {
      window.clearTimeout(toCheck);
      window.clearTimeout(toPrompt);
    };
  }, [hasPending]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const claim = useCallback(() => {
    if (!pending) return;
    const from: Totals = { xp: pending.oldXP, level: pending.oldLevel, vp: pending.oldVictoryPoints };
    const to = liveRef.current;
    onClaim();

    const speed = getAnimSpeed();
    if (speed === 'off') {
      setStage('idle');
      return;
    }

    const duration = 1800 * speedFactor(speed);
    const startAbs = toAbsoluteXP(from.level, from.xp);
    const endAbs = toAbsoluteXP(to.level, to.xp);
    setShown(from);
    setLevelFlash(to.level > from.level);
    setStage('counting');

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const { level, xp } = fromAbsoluteXP(Math.round(startAbs + (endAbs - startAbs) * eased));
      setShown({ xp, level, vp: Math.round(from.vp + (to.vp - from.vp) * eased) });
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setShown(null);
        setLevelFlash(false);
        setStage('idle');
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [pending, onClaim]);

  const display: Totals = shown ?? (pending
    ? { xp: pending.oldXP, level: pending.oldLevel, vp: pending.oldVictoryPoints }
    : live);

  return { stage, display, levelFlash, counting: stage === 'counting', claim };
}
