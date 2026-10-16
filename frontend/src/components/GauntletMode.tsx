import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './ui/Icon';
import TrialMap, { bracketOf } from './gauntlet/TrialMap';
import RosterSheet, { CampPick } from './gauntlet/RosterSheet';
import TeamStrip from './gauntlet/TeamStrip';
import CampPanel from './gauntlet/CampPanel';
import OfferPanel from './gauntlet/OfferPanel';
import GauntletResults from './gauntlet/GauntletResults';
import { socketService } from '../socketService';
import type { GauntletRunState, GauntletHeroOffer, GauntletRewards } from '../types';
import '../styles/Gauntlet.css';

interface User {
  id: number;
  username: string;
  victory_points: number;
  available_heroes: string[];
  best_gauntlet_trial: number;
}

interface GauntletModeProps {
  onReturnToLobby: () => void;
  user?: User;
  // The live battle, drawn by the app's own battle screen while one is in progress
  battleView?: React.ReactNode;
  // Called when the server reports the battle's result, so the app can put the battle away
  onBattleFinished?: () => void;
}

type Screen = 'loading' | 'camp' | 'searching' | 'offer' | 'results';
type Notice = { kind: 'error' | 'success' | 'info'; text: string } | null;

const GauntletMode: React.FC<GauntletModeProps> = ({ onReturnToLobby, user, battleView, onBattleFinished }) => {
  const [runState, setRunState] = useState<GauntletRunState | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [team, setTeam] = useState<number[]>([]);
  const [pick, setPick] = useState<CampPick>(null);
  const [offer, setOffer] = useState<GauntletHeroOffer[] | null>(null);
  const [offerFromBattle, setOfferFromBattle] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [rewards, setRewards] = useState<GauntletRewards | null>(null);
  const [result, setResult] = useState({ trialsWon: 0, finalTrial: 1 });
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const onBattleFinishedRef = useRef(onBattleFinished);
  onBattleFinishedRef.current = onBattleFinished;

  const emit = useCallback((event: string, data?: unknown) => {
    const socket = socketService.getSocket() || socketService.connect();
    socket?.emit(event as never, data as never);
  }, []);

  useEffect(() => {
    const socket = socketService.getSocket() || socketService.connect();
    if (!socket) return;

    const adopt = (state?: GauntletRunState) => {
      if (!state) return;
      setRunState(state);
      // A held offer (after a reload or a return to the lobby) is shown again, never lost
      setTeam(previous => previous.filter(i => state.roster[i] && (state.roster[i].alive || state.roster[i].temporary_resurrection_active)));
    };
    const finish = (text: string) => { setNotice({ kind: 'success', text }); };

    const started = (data: any) => {
      if (!data.success) { setNotice({ kind: 'error', text: data.error || 'The Gauntlet could not start. Try again.' }); return; }
      adopt(data.runState);
      if (data.runState?.phase === 'hero_offer' && data.runState.pending_offer?.length) {
        setOffer(data.runState.pending_offer);
        setOfferFromBattle(true);
        setScreen('offer');
      } else {
        setScreen('camp');
      }
    };
    const queueWaiting = () => { setBusy(false); setScreen('searching'); };
    const queueCancelled = (data: any) => { adopt(data.runState); setScreen('camp'); };
    const queueFailed = (data: any) => { setNotice({ kind: 'error', text: data.error || 'Could not join the queue.' }); setScreen('camp'); };
    const teamSet = (data: any) => {
      if (data.success) emit('queue-for-gauntlet-trial');
      else setNotice({ kind: 'error', text: data.error || 'That team cannot go in.' });
    };
    const matchFound = () => { setScreen('camp'); setNotice(null); };
    const battleComplete = (data: any) => {
      onBattleFinishedRef.current?.();
      setTeam([]);
      setPick(null);
      if (data.runEnded) {
        setRewards(data.rewards || null);
        setResult({ trialsWon: data.trialsWon ?? 0, finalTrial: data.finalTrial ?? 1 });
        setScreen('results');
        return;
      }
      adopt(data.runState);
      finish(data.won ? 'You won the trial.' : 'You lost the trial. Your heroes keep their wounds.');
      if (data.heroOffer && data.heroOffer.length) {
        setOffer(data.heroOffer);
        setOfferFromBattle(true);
        setScreen('offer');
      } else {
        setScreen('camp');
      }
    };
    const shopResult = (data: any) => {
      setBusy(false);
      if (!data.success) { setNotice({ kind: 'error', text: data.error || 'That did not work.' }); setPick(null); return; }
      adopt(data.runState);
      if (data.action === 'show_offer') {
        setOffer(data.offer);
        setOfferFromBattle(false);
        setScreen('offer');
        return;
      }
      if (data.action === 'need_sacrifice') { setReplacing(data.selectedHero); return; }
      setPick(null);
      setOffer(null);
      setReplacing(null);
      setScreen('camp');
      if (data.message) finish(data.message);
    };
    const offerResult = (data: any) => {
      setBusy(false);
      if (!data.success) { setNotice({ kind: 'error', text: data.error || 'That did not work.' }); return; }
      adopt(data.runState);
      if (data.action === 'show_offer') { setOffer(data.offer); return; }
      if (data.action === 'need_sacrifice') { setReplacing(data.selectedHero); return; }
      setOffer(null);
      setReplacing(null);
      setScreen('camp');
      if (data.message) finish(data.message);
    };
    const abandoned = (data: any) => {
      if (!data.success) return;
      setRewards(data.rewards || null);
      setResult({ trialsWon: data.trialsWon ?? 0, finalTrial: data.finalTrial ?? 1 });
      setScreen('results');
    };

    socket.on('gauntlet-run-started', started);
    socket.on('gauntlet-queue-waiting', queueWaiting);
    socket.on('gauntlet-queue-cancelled', queueCancelled);
    socket.on('gauntlet-queue-failed', queueFailed);
    socket.on('gauntlet-battle-team-set', teamSet);
    socket.on('gauntlet-match-found', matchFound);
    socket.on('gauntlet-battle-complete', battleComplete);
    socket.on('gauntlet-shop-action-result', shopResult);
    socket.on('gauntlet-hero-offer-result', offerResult);
    socket.on('gauntlet-run-abandoned', abandoned);
    socket.emit('start-gauntlet-run', { name: user?.username || 'Player' });

    return () => {
      socket.off('gauntlet-run-started', started);
      socket.off('gauntlet-queue-waiting', queueWaiting);
      socket.off('gauntlet-queue-cancelled', queueCancelled);
      socket.off('gauntlet-queue-failed', queueFailed);
      socket.off('gauntlet-battle-team-set', teamSet);
      socket.off('gauntlet-match-found', matchFound);
      socket.off('gauntlet-battle-complete', battleComplete);
      socket.off('gauntlet-shop-action-result', shopResult);
      socket.off('gauntlet-hero-offer-result', offerResult);
      socket.off('gauntlet-run-abandoned', abandoned);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- actions -----
  const toggleTeam = (index: number) => {
    setNotice(null);
    setTeam(previous => (previous.includes(index) ? previous.filter(i => i !== index) : previous.length < 3 ? [...previous, index] : previous));
  };
  const startTrial = () => {
    setNotice(null);
    emit('set-gauntlet-battle-team', { teamIndices: team });
  };
  const chooseCamp = (choice: 'heal' | 'temp_res' | 'buy_pack' | 'skip_trial') => {
    setNotice(null);
    if (choice === 'heal' || choice === 'temp_res') { setPick(choice); return; }
    setBusy(true);
    emit('gauntlet-shop-action', { action: choice });
  };
  const pickTarget = (index: number) => {
    if (!pick || !runState) return;
    setBusy(true);
    emit('gauntlet-shop-action', pick === 'heal' ? { action: 'heal', heroIndex: index } : { action: 'temp_res', heroId: runState.roster[index].hero_id });
  };
  const chooseHero = (heroName: string) => {
    setBusy(true);
    if (offerFromBattle) emit('complete-gauntlet-hero-offer', { selectedHeroId: heroName });
    else emit('gauntlet-shop-action', { action: 'buy_pack', selectedHeroId: heroName });
  };
  const replaceHero = (rosterIndex: number) => {
    if (!replacing) return;
    setBusy(true);
    if (offerFromBattle) emit('complete-gauntlet-hero-offer', { selectedHeroId: replacing, sacrificeIndex: rosterIndex });
    else emit('gauntlet-shop-action', { action: 'buy_pack', selectedHeroId: replacing, sacrificeIndex: rosterIndex });
  };
  const reroll = () => {
    setBusy(true);
    if (offerFromBattle) emit('complete-gauntlet-hero-offer', { useReroll: true });
    else emit('gauntlet-shop-action', { action: 'buy_pack', useReroll: true });
  };
  const leaveOffer = () => {
    if (offerFromBattle) { setBusy(true); emit('complete-gauntlet-hero-offer', { skip: true }); }
    setOffer(null);
    setReplacing(null);
    setScreen('camp');
  };
  const cancelSearch = () => emit('cancel-gauntlet-queue');
  const saveAndLeave = () => {
    if (screen === 'searching') cancelSearch();
    emit('save-and-return-to-lobby');
    onReturnToLobby();
  };
  const abandon = () => {
    setConfirmAbandon(false);
    emit('abandon-gauntlet-run');
  };

  // ----- screens -----
  if (battleView) return <div className="gt gt-battle">{battleView}</div>;

  if (screen === 'results') {
    return (
      <div className="gt gt-centered">
        <GauntletResults
          trialsWon={result.trialsWon}
          finalTrial={result.finalTrial}
          rewards={rewards}
          bestTrial={user?.best_gauntlet_trial}
          onDone={onReturnToLobby}
        />
      </div>
    );
  }

  if (!runState || screen === 'loading') {
    return (
      <div className="gt gt-centered">
        <p className="gt-hint" role="status"><span className="ui-spinner" aria-hidden="true" /> Gathering your roster</p>
        {notice && <p className="ui-notice ui-notice--error" role="alert">{notice.text}</p>}
        <button type="button" className="ui-btn ui-btn--quiet" onClick={onReturnToLobby}>Back to the lobby</button>
      </div>
    );
  }

  const searching = screen === 'searching';
  const bracket = bracketOf(runState.current_trial);

  return (
    <div className="gt">
      <header className="gt-bar">
        <h1 className="gt-title">The Gauntlet</h1>
        <span className="ui-badge">Trial {runState.current_trial} · bracket {bracket}</span>
        <div className="gt-bar-actions">
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={saveAndLeave}>
            <Icon name="logout" /> Save and leave
          </button>
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" disabled={searching} onClick={() => setConfirmAbandon(true)}>
            Abandon run
          </button>
        </div>
      </header>

      {notice && (
        <p className={`ui-notice ui-notice--${notice.kind} gt-notice`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>
      )}

      <main className="gt-main">
        <aside className="gt-side ui-panel">
          <TrialMap currentTrial={runState.current_trial} trialsWon={runState.trials_won || 0} />
          <CampPanel runState={runState} pick={pick} busy={busy || searching} onChoose={chooseCamp} onCancelPick={() => setPick(null)} />
        </aside>
        <section className="gt-table">
          <TeamStrip
            runState={runState}
            teamIndices={team}
            searching={searching}
            onRemove={toggleTeam}
            onStart={startTrial}
            onCancelSearch={cancelSearch}
          />
          <RosterSheet
            roster={runState.roster}
            teamIndices={team}
            pick={pick}
            locked={searching}
            onToggleTeam={toggleTeam}
            onPick={pickTarget}
          />
        </section>
      </main>

      {screen === 'offer' && offer && (
        <div className="ui-modal-overlay gt-offer-overlay">
          <OfferPanel
            offer={offer}
            runState={runState}
            fromBattle={offerFromBattle}
            replacing={replacing}
            busy={busy}
            onChoose={chooseHero}
            onReplace={replaceHero}
            onReroll={reroll}
            onLeave={leaveOffer}
            onCancelReplace={() => setReplacing(null)}
          />
        </div>
      )}

      {confirmAbandon && (
        <div className="ui-modal-overlay">
          <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="gt-abandon-title">
            <h2 id="gt-abandon-title" className="gt-heading">Abandon this run?</h2>
            <p className="gt-hint">The run ends now and is paid for the {runState.trials_won || 0} {(runState.trials_won || 0) === 1 ? 'trial' : 'trials'} you won.</p>
            <div className="gt-offer-actions">
              <button type="button" className="ui-btn ui-btn--danger" onClick={abandon}>Abandon run</button>
              <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setConfirmAbandon(false)}>Keep playing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GauntletMode;
