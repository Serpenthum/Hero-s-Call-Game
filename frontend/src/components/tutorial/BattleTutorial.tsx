import React, { useEffect, useRef, useState } from 'react';
import { GameState } from '../../types';
import { socketService } from '../../socketService';
import TutorialOverlay, { OverlayStep } from './TutorialOverlay';

interface LogEntryLike {
  id: string;
  crit?: boolean;
  attacker?: string;
}

interface BattleTutorialProps {
  gameState: GameState;
  playerId: string | null;
  battleLog: LogEntryLike[];
  onRevealChange: (count: number | null) => void;
  onSkip: () => void;
}

type IntroStage = 'welcome' | 'heroes' | 'roll' | 'won' | 'choose' | 'hp' | 'defense' | 'accuracy' | 'attack' | 'image' | 'final' | 'done';
type PromptKind = 'poison' | 'crit' | 'log' | 'target' | 'attack' | 'ability' | 'endturn';

interface Prompt {
  kind: PromptKind;
  step: OverlayStep;
}

const DRUID = '.player-area [data-hero-name="Druid"]';
const REVEAL_DELAY_MS = 2000;
const REVEAL_STEP_MS = 600;
const HERO_COUNT = 6;

const INTRO_STEPS: Record<Exclude<IntroStage, 'done'>, OverlayStep> = {
  welcome: {
    key: 'welcome',
    text: "Welcome to Hero's Call! Let me show you how things work.",
    showNext: true,
    anchor: 'topleft'
  },
  heroes: {
    key: 'heroes',
    text: "Your heroes will battle against your opponents' until one player is victorious!",
    dim: false,
    anchor: 'topleft'
  },
  roll: {
    key: 'roll',
    text: "First let's roll to see who decides to start.",
    target: ['[data-tutorial="initiative-roll"]'],
    interactive: true
  },
  won: {
    key: 'won',
    text: "You won the diceroll! You'll get to choose whether your hero attacks first or your opponent. But be careful, the first hero to attack can't use an ability! Choose wisely!",
    showNext: true,
    anchor: 'topleft'
  },
  choose: {
    key: 'choose',
    text: null,
    target: ['[data-tutorial="turn-choice"]'],
    interactive: true
  },
  hp: {
    key: 'hp',
    text: "This is your hero's health, don't lose it all.",
    target: [`${DRUID} [data-tutorial="hp"]`],
    showNext: true
  },
  defense: {
    key: 'defense',
    text: "This is your hero's defense, your opponent will need to roll higher than this number to hit this hero.",
    target: [`${DRUID} [data-tutorial="defense"]`],
    showNext: true
  },
  accuracy: {
    key: 'accuracy',
    text: "This is your hero's accuracy, you'll add this number to your roll when you try to hit your opponent.",
    target: [`${DRUID} [data-tutorial="accuracy"]`],
    showNext: true
  },
  attack: {
    key: 'attack',
    text: "This is your hero's attack damage, when you hit an opponent, the druid will roll 1 six sided dice for their damage.",
    target: [`${DRUID} [data-tutorial="attack"]`],
    showNext: true
  },
  image: {
    key: 'image',
    text: 'Read your hero\'s abilities and specials directly on the card. Each turn, your hero can use 1 attack and 1 ability on the same enemy. Each hero is unique and brings something new to the battlefield.',
    target: [`${DRUID} .card-details`],
    side: 'left',
    interactive: true,
    showNext: true
  },
  final: {
    key: 'final',
    text: 'Show your opponent what you got!',
    target: ['.opponent-area .team-display'],
    side: 'bottom',
    showNext: true
  }
};

const NEXT_INTRO: Partial<Record<IntroStage, IntroStage>> = {
  welcome: 'heroes',
  heroes: 'roll',
  won: 'choose',
  hp: 'defense',
  defense: 'accuracy',
  accuracy: 'attack',
  attack: 'image',
  image: 'final',
  final: 'done'
};

const actionButton = (name: string, enabledOnly = false) =>
  `.action-bar [data-tutorial="${name}"]${enabledOnly ? ':not([disabled])' : ''}`;

const BattleTutorial: React.FC<BattleTutorialProps> = ({ gameState, playerId, battleLog, onRevealChange, onSkip }) => {
  const [stage, setStage] = useState<IntroStage>('welcome');
  const [revealDone, setRevealDone] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const shown = useRef<Set<PromptKind>>(new Set());
  const revealRef = useRef(onRevealChange);
  revealRef.current = onRevealChange;

  const myIdx = gameState.players.findIndex(p => p.id === playerId);
  const me = gameState.players[myIdx];
  const opp = gameState.players[1 - myIdx];
  const myTurn = gameState.phase === 'battle' && gameState.currentTurn === myIdx && !gameState.winner;
  const usedAttack = !!me && (me.hasUsedAttack || (me.usedAttacks || 0) > 0);
  const usedAbility = !!me && (me.hasUsedAbility || (me.usedAbilities?.length || 0) > 0);

  // Heroes grow in one by one, starting a couple of seconds after the prompt appears
  useEffect(() => {
    if (stage !== 'heroes') return;
    setRevealDone(false);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => {
      for (let i = 1; i <= HERO_COUNT; i++) {
        timers.push(window.setTimeout(() => revealRef.current(i), (i - 1) * REVEAL_STEP_MS));
      }
      timers.push(window.setTimeout(() => setRevealDone(true), HERO_COUNT * REVEAL_STEP_MS));
    }, REVEAL_DELAY_MS));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [stage]);

  // Stages that wait on the game rather than a Next click
  useEffect(() => {
    if (stage === 'roll' && me?.initiativeRoll !== undefined && opp?.initiativeRoll !== undefined) {
      setStage(me.initiativeRoll > opp.initiativeRoll ? 'won' : 'choose');
    } else if (stage === 'choose' && gameState.phase === 'battle') {
      setStage('hp');
    }
  }, [stage, me?.initiativeRoll, opp?.initiativeRoll, gameState.phase]);

  const advanceIntro = () => {
    const next = NEXT_INTRO[stage];
    if (!next) return;
    if (stage === 'heroes') revealRef.current(null);
    if (stage === 'final') socketService.tutorialContinue('intro');
    setStage(next);
  };

  const pickPrompt = (): Prompt | null => {
    if (!me) return null;
    const heroNames = new Set(me.team.map(h => h.name));

    if (!shown.current.has('poison')) {
      const poisoned = me.team.find(h => (h.statusEffects?.poison || 0) > 0);
      if (poisoned) {
        return {
          kind: 'poison',
          step: {
            key: 'poison',
            text: "Looks like you've been poisoned. Poison lasts forever and does its damage at the end of that hero's turn.",
            target: [`.player-area [data-hero-name="${poisoned.name}"] .status-effect.poison`, `.player-area [data-hero-name="${poisoned.name}"]`],
            showNext: true
          }
        };
      }
    }

    if (!shown.current.has('crit')) {
      const critEntry = battleLog.find(e => e.crit && e.attacker && heroNames.has(e.attacker));
      if (critEntry) {
        return {
          kind: 'crit',
          step: {
            key: 'crit',
            text: "That's a critical hit! A crit means you do the maximum damage you can roll on your damage dice!",
            target: [`[data-log-id="${critEntry.id}"]`, '.battle-log-section'],
            showNext: true
          }
        };
      }
    }

    if (!shown.current.has('log') && battleLog.length > 0) {
      const newest = battleLog[battleLog.length - 1];
      return {
        kind: 'log',
        step: {
          key: 'log',
          text: "This is the battle log. It'll tell you what happened and what dice were rolled.",
          target: [`[data-log-id="${newest.id}"]`, '.battle-log-section'],
          showNext: true
        }
      };
    }

    if (!myTurn) return null;

    if (!me.selectedTarget) {
      if (shown.current.has('target')) return null;
      return {
        kind: 'target',
        step: {
          key: 'target',
          text: 'Click on an enemy hero to choose who to target!',
          target: ['.opponent-area .team-display'],
          interactive: true
        }
      };
    }

    const attackReady = !!document.querySelector(actionButton('attack', true));
    const abilityReady = !!document.querySelector(actionButton('ability', true));

    if (!shown.current.has('attack') && !usedAttack && attackReady) {
      return {
        kind: 'attack',
        step: {
          key: 'attack-btn',
          text: "Now press Attack to strike your target with your hero's basic attack!",
          target: [actionButton('attack')],
          interactive: true
        }
      };
    }

    if (!shown.current.has('ability') && usedAttack && !usedAbility && abilityReady) {
      return {
        kind: 'ability',
        step: {
          key: 'ability-btn',
          text: 'Your hero can also use an ability on the same enemy. Press the ability button!',
          target: [actionButton('ability', true)],
          interactive: true
        }
      };
    }

    if (!shown.current.has('endturn') && usedAttack && (usedAbility || !abilityReady)) {
      return {
        kind: 'endturn',
        step: {
          key: 'end-turn-btn',
          text: usedAbility
            ? "You're out of actions for this hero. Press End Turn to pass to your opponent!"
            : "This hero can't use an ability right now. Press End Turn to pass to your opponent!",
          target: [actionButton('end-turn')],
          interactive: true
        }
      };
    }
    return null;
  };

  // Show the next relevant prompt once the intro is over and nothing else is showing
  useEffect(() => {
    if (stage !== 'done' || prompt || gameState.phase === 'ended' || gameState.winner) return;
    const next = pickPrompt();
    if (next) {
      shown.current.add(next.kind);
      setPrompt(next);
    }
  });

  // Action prompts close themselves once the player does the thing they point at
  useEffect(() => {
    if (!prompt || !me) return;
    const finished =
      (prompt.kind === 'target' && !!me.selectedTarget) ||
      (prompt.kind === 'attack' && usedAttack) ||
      (prompt.kind === 'ability' && usedAbility) ||
      (prompt.kind === 'endturn' && !myTurn);
    if (finished) setPrompt(null);
  }, [prompt, me?.selectedTarget, usedAttack, usedAbility, myTurn]);

  const handlePromptNext = () => {
    if (!prompt) return;
    // The server pauses the bot while these two prompts are up
    if (prompt.kind === 'log' || prompt.kind === 'poison') socketService.tutorialContinue(prompt.kind);
    setPrompt(null);
  };

  let step: OverlayStep | null = null;
  let onNext: (() => void) | undefined;
  if (stage !== 'done') {
    step = { ...INTRO_STEPS[stage] };
    if (stage === 'heroes') step.showNext = revealDone;
    onNext = advanceIntro;
  } else if (prompt) {
    step = prompt.step;
    onNext = handlePromptNext;
  }

  return <TutorialOverlay step={step} onNext={onNext} onSkip={gameState.phase === 'ended' ? undefined : onSkip} />;
};

export default BattleTutorial;
