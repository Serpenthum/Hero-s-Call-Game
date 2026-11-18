import React, { useEffect, useRef, useState } from 'react';
import { GameState } from '../../types';
import { socketService } from '../../socketService';
import type { InspectedCard } from '../../battle/focus';
import TutorialOverlay, { OverlayStep } from './TutorialOverlay';
import {
  LogEntryLike,
  NEEDS_CLEAR_BOARD,
  Prompt,
  PromptKind,
  PromptProgress,
  actionButton,
  pickBattlePrompt,
  promptAbandoned,
  promptFinished,
  usedAbilityOf,
  usedAttackOf,
} from './battlePrompts';

interface BattleTutorialProps {
  gameState: GameState;
  playerId: string | null;
  battleLog: LogEntryLike[];
  // The card in the battle details panel (null when closed)
  inspected: InspectedCard | null;
  // Closes the details panel: it covers the battle log, and on phones part of the board
  onCloseInspect: () => void;
  onRevealChange: (count: number | null) => void;
  onSkip: () => void;
}

type IntroStage = 'welcome' | 'heroes' | 'roll' | 'won' | 'choose' | 'hp' | 'defense' | 'accuracy' | 'attack' | 'image' | 'final' | 'done';

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
    text: "Your hero's abilities and specials are written on the card. Tap any card to read it in the panel on the left. Each turn, your hero can use 1 attack and 1 ability.",
    // The rules text is hidden on tiny cards (a sideways phone), so fall back to the whole card
    target: [`${DRUID} .card-details`, DRUID],
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

const BattleTutorial: React.FC<BattleTutorialProps> = ({
  gameState, playerId, battleLog, inspected, onCloseInspect, onRevealChange, onSkip
}) => {
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
  const progress: PromptProgress = {
    focused: !!me?.selectedTarget,
    inspectedEnemy: inspected?.side === 'enemy',
    usedAttack: !!me && usedAttackOf(me),
    usedAbility: !!me && usedAbilityOf(me),
    myTurn
  };

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
    // The card tapped in the 'image' step stays open; the next steps point at the board
    if (stage === 'image' && inspected) onCloseInspect();
    if (stage === 'final') socketService.tutorialContinue('intro');
    setStage(next);
  };

  // Show the next relevant prompt once the intro is over and nothing else is showing
  useEffect(() => {
    if (stage !== 'done' || prompt || !me || gameState.phase === 'ended' || gameState.winner) return;
    const next = pickBattlePrompt({
      me,
      myTurn,
      battleLog,
      shown: shown.current,
      inspected,
      attackReady: !!document.querySelector(actionButton('attack', true)),
      abilityReady: !!document.querySelector(actionButton('ability', true))
    });
    if (next) {
      shown.current.add(next.kind);
      if (inspected && NEEDS_CLEAR_BOARD.has(next.kind)) onCloseInspect();
      setPrompt(next);
    }
  });

  // Action prompts close themselves once the player does the thing they point at. One whose button went away
  // first (the turn ran out, or the panel closed before Focus) is forgotten so it is asked again.
  useEffect(() => {
    if (!prompt || !me) return;
    if (promptFinished(prompt.kind, progress)) {
      setPrompt(null);
    } else if (promptAbandoned(prompt.kind, progress)) {
      shown.current.delete(prompt.kind);
      if (prompt.kind === 'focus') shown.current.delete('inspect');
      setPrompt(null);
    }
  }, [prompt, progress.focused, progress.inspectedEnemy, progress.usedAttack, progress.usedAbility, myTurn]);

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
