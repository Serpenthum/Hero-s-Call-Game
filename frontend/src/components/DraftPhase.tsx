import React, { useEffect, useRef, useState } from 'react';
import { GameState, Player, Hero } from '../types';
import { socketService } from '../socketService';
import { getAnimSpeed } from '../battleAnimations';
import { useCardReader } from '../cards/CardReader';
import { READABLE_CARD_MIN_WIDTH, draftStep, playerStatus, draftChoice, visibleBans } from '../draft/draftRules';
import { useDraftLayout } from '../draft/useDraftLayout';
import HeroCard from './HeroCard';
import Icon from './ui/Icon';
import DraftClock from './DraftClock';
import DraftTopBar from './draft/DraftTopBar';
import DraftBand from './draft/DraftBand';
import DraftHand from './draft/DraftHand';
import DraftBigCard from './draft/DraftBigCard';
import '../styles/Draft.css';

interface DraftPhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  opponent: Player | null;
  allHeroes: Hero[];
  draftTimer?: { round: number; deadline: number; durationMs: number } | null;
}

const DraftPhase: React.FC<DraftPhaseProps> = props =>
  props.gameState.phase === 'setup' ? <SetupStep {...props} /> : <DraftTable {...props} />;

/** The hand you hold: from your player, or from the older per-game lists. */
function handOf(gameState: GameState, currentPlayer: Player, allHeroes: Hero[]): Hero[] {
  if (Array.isArray(currentPlayer.draftCards)) return currentPlayer.draftCards;
  if (!gameState.draftCards) return [];
  const index = gameState.players.findIndex(p => p.id === currentPlayer.id);
  if (index === -1) return [];
  const names = index === 0 ? gameState.draftCards.player1 : gameState.draftCards.player2;
  if (!Array.isArray(names)) return [];
  return names.map(name => allHeroes.find(h => h.name === name)).filter(Boolean) as Hero[];
}

/** Ban and pick rounds: the draft table. */
const DraftTable: React.FC<DraftPhaseProps> = ({ gameState, currentPlayer, opponent, allHeroes, draftTimer }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const reader = useCardReader();
  const step = draftStep(gameState.phase, gameState.currentDraftPhase);
  const hand = handOf(gameState, currentPlayer, allHeroes);
  const handNames = hand.map(h => h.name);
  const handKey = handNames.join('|');
  const sizes = useDraftLayout(rootRef, hand.length, step);
  const { layout } = sizes;

  const myStatus = playerStatus(currentPlayer, step);
  const theirStatus = opponent ? playerStatus(opponent, step) : 'choosing';
  // The card you tapped, and (big-card layout) a team or ban card shown big without changing that choice.
  const [picked, setPicked] = useState<string | null>(null);
  const [peek, setPeek] = useState<Hero | null>(null);
  // The card this round's ban or pick was sent for: the hand stays locked on it until the server answers.
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    setPicked(null);
    setPeek(null);
    setSent(null);
  }, [step, handKey]);

  // Locked once sent or done on the server. A choice no longer in the hand (the clock ran out) is dropped;
  // the big-card layout shows its first card chosen when nothing else is.
  const { chosen, locked } = draftChoice({ picked, sent, handNames, layout, serverDone: myStatus === 'done' });

  // Heroes seen on this screen, so a ban keeps its card (and holo flag) after it leaves the hand.
  const seen = useRef(new Map<string, Hero>());
  [...hand, ...(currentPlayer.team ?? []), ...(opponent?.team ?? [])].forEach(h => seen.current.set(h.name, h));
  const heroByName = (name: string) => seen.current.get(name) ?? allHeroes.find(h => h.name === name);

  const bans = visibleBans(currentPlayer.bannedCard, opponent?.bannedCard);
  const banHolo = {
    mine: !!(bans.mine && heroByName(bans.mine)?.holo),
    theirs: !!(bans.theirs && heroByName(bans.theirs)?.holo),
  };

  const choose = (name: string) => {
    if (locked) return;
    setPeek(null);
    setPicked(layout === 'focus' ? name : chosen === name ? null : name);
  };

  const read = (hero: Hero) => {
    if (layout === 'focus') setPeek(hero);
    else reader.open(hero, { holo: !!hero.holo });
  };

  const act = () => {
    if (!chosen || locked) return;
    if (step === 0) {
      if (gameState.phase === 'draft' && gameState.currentDraftPhase === 0) socketService.banCard(chosen);
    } else {
      socketService.pickCard(chosen);
    }
    setSent(chosen);
    setPeek(null);
  };

  const clock =
    draftTimer && draftTimer.round === gameState.currentDraftPhase && myStatus !== 'done' ? (
      <DraftClock
        key={draftTimer.round}
        deadline={draftTimer.deadline}
        durationMs={draftTimer.durationMs}
        action={step === 0 ? 'ban' : 'pick'}
      />
    ) : null;

  const verb = step === 0 ? 'Ban' : 'Pick';
  const shown = sent ?? chosen;
  const bigHero = peek ?? (shown ? hand.find(h => h.name === shown) ?? null : null);
  const motionOff = getAnimSpeed() === 'off';

  const style = {
    '--draft-card-w': `${sizes.handCard}px`,
    '--draft-card-scale': sizes.handCard / 260,
    '--draft-big-w': `${sizes.bigCard}px`,
    '--draft-big-scale': sizes.bigCard / 260,
    '--draft-slot-w': `${sizes.slot}px`,
    '--draft-slot-scale': sizes.slot / 260,
    '--draft-hand-pad': `${sizes.handPad}px`,
  } as React.CSSProperties;

  const classes = [
    'draft-table',
    `draft-table--${layout}`,
    // Big-card layout: hand cards too narrow for readable rules text show as tiny cards (name and stats).
    layout === 'focus' && sizes.handCard < READABLE_CARD_MIN_WIDTH ? 'draft-table--tiny-hand' : '',
    motionOff ? 'draft--still' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={classes} style={style}>
      {layout === 'focus' ? <DraftBigCard hero={bigHero} waiting={locked} /> : null}
      <DraftTopBar step={step} clock={clock} connecting={false} onLeave={() => socketService.abandonDraft()} />
      <DraftBand
        layout={layout}
        me={{ name: currentPlayer.name, team: currentPlayer.team ?? [], status: myStatus }}
        them={{ name: opponent?.name ?? 'Opponent', team: opponent?.team ?? [], status: theirStatus }}
        bans={bans}
        banHolo={banHolo}
        onRead={read}
        heroByName={heroByName}
      />
      <DraftHand cards={hand} chosen={shown} step={step} locked={locked} onChoose={choose} layout={layout} />
      <footer className="draft-foot">
        <button
          type="button"
          className={`draft-act${step === 0 ? ' draft-act--ban' : ''}`}
          disabled={!chosen || locked}
          onClick={act}
        >
          {chosen && !locked ? `${verb} ${chosen}` : verb}
        </button>
      </footer>
    </div>
  );
};

/** The order step as it is today (drag to order, then Ready). The new order step replaces it. */
const SetupStep: React.FC<DraftPhaseProps> = ({ gameState, currentPlayer, opponent, allHeroes }) => {
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [draggedHero, setDraggedHero] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (gameState.phase !== 'setup' || !currentPlayer.team?.length) return;
    const newTeamOrder = currentPlayer.team.map(h => h.name);
    setTeamOrder(prev => (prev.join('|') === newTeamOrder.join('|') ? prev : newTeamOrder));
  }, [gameState.phase, currentPlayer.team]);

  const getHeroByName = (name: string): Hero | undefined =>
    currentPlayer.team?.find(h => h.name === name) ?? allHeroes.find(h => h.name === name);

  const handleSetAttackOrder = () => {
    if (teamOrder.length === 3) {
      socketService.setAttackOrder(teamOrder);
      setIsReady(true);
    }
  };

  const handleDragStart = (heroName: string, e: React.DragEvent) => {
    setDraggedHero(heroName);
    // A transparent drag image hides the default ghost
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX !== 0 && e.clientY !== 0) setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragEnd = () => {
    setDragPosition(null);
    setDraggedHero(null);
  };

  const handleDrop = (targetIndex: number) => {
    if (!draggedHero) return;
    const currentIndex = teamOrder.indexOf(draggedHero);
    if (currentIndex !== targetIndex) {
      const newOrder = [...teamOrder];
      newOrder.splice(currentIndex, 1);
      newOrder.splice(targetIndex, 0, draggedHero);
      setTeamOrder(newOrder);
    }
    setDraggedHero(null);
    setDragPosition(null);
  };

  const dragged = draggedHero ? getHeroByName(draggedHero) : undefined;

  return (
    <div className="setup-phase">
      <h2>Team Setup</h2>
      <p>Drag and drop to arrange your heroes' attack order (left to right):</p>

      {opponent && opponent.isReady && (
        <div className="opponent-ready-indicator">
          <span><Icon name="check" /> Opponent is ready</span>
        </div>
      )}

      <div className="team-order-setup">
        <div className="draggable-team">
          {teamOrder.map((heroName, index) => {
            const hero = getHeroByName(heroName);
            const isDragging = draggedHero === heroName;
            return hero ? (
              <div
                key={heroName}
                className={`draggable-hero-slot ${isDragging ? 'dragging' : ''}`}
                draggable={!isReady}
                onDragStart={(e) => !isReady && handleDragStart(heroName, e)}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => !isReady && handleDrop(index)}
                style={{
                  opacity: isDragging ? 0.3 : 1,
                  transition: 'opacity 0.15s ease, transform 0.3s ease'
                }}
              >
                <div className="position-badge">{index + 1}</div>
                <HeroCard hero={hero} holo={!!hero.holo} isSelectable={false} />
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Floating card that follows the pointer during a drag */}
      {dragged && dragPosition && (
        <div
          style={{
            position: 'fixed',
            left: dragPosition.x - 100,
            top: dragPosition.y - 150,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.9,
            transform: 'rotate(-5deg)',
            transition: 'none',
            willChange: 'transform'
          }}
        >
          <HeroCard hero={dragged} holo={!!dragged.holo} isSelectable={false} readable="none" />
        </div>
      )}

      <div className="setup-actions">
        {!isReady ? (
          <button
            onClick={handleSetAttackOrder}
            disabled={teamOrder.length !== 3}
            className="action-button ready-button"
          >
            Ready
          </button>
        ) : (
          <div className="ready-status">
            <span className="ready-indicator"><Icon name="check" /> You are ready. Waiting for opponent...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DraftPhase;
