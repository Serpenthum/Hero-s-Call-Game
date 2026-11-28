// The binder: every hero in pockets, two pages at a time, with one filter button and a large view for reading a card.
// Signed in, the shard balance sits under the filter button and a hero not owned can be crafted from its large view.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CloseButton from './CloseButton';
import BinderOpening from './BinderOpening';
import useBinderData from './binder/useBinderData';
import { BinderBook } from './binder/BinderBook';
import { BinderFilter } from './binder/BinderFilter';
import { BinderStatus } from './binder/BinderStatus';
import { BinderLargeView } from './binder/BinderLargeView';
import Shard from './ui/Shard';
import { CRAFT_PRICE } from './binder/craftRules';
import { playForge, type ForgePhase } from './binder/craftForge';
import { cardMotionOff } from '../cards/cardMotion';
import {
  DEFAULT_VIEW, binderList, clampSpread, filterForHero, matchesFilter, spreadCount, spreadOfHero, statusLine,
  type BinderView, type Collection,
} from './binder/binderRules';
import '../styles/HeroCollection.css'; // shared form styles other screens still rely on
import '../styles/Binder.css'; // the opening
import '../styles/BinderBook.css';

interface HeroCollectionProps {
  onClose: () => void;
  userId?: number; // Signed-in player; signed out shows every hero with no favourites
  victoryPoints?: number; // Passed by the lobby; the binder shows no coin amount
  onFavoritesChange?: (favoriteHeroes: string[]) => void;
  onPurchaseComplete?: () => void; // After a craft: the lobby refreshes its user, as after a pack
  initialHero?: string; // Open on this hero's page and light its pocket
  initialView?: BinderView; // Dev screen only: the filter, sort and search to open on
}

// How long the pocket of the hero the binder opened on stays lit
const SPOTLIGHT_MS = 1600;

// The crafting animation in play: whose card, how far it has got, and the balance on show as the shards leave
interface Forge { name: string; phase: ForgePhase; shown: number }

const HeroCollection: React.FC<HeroCollectionProps> = ({ onClose, userId, onFavoritesChange, onPurchaseComplete, initialHero, initialView }) => {
  const {
    heroes, collection: loaded, loading, error, retry, toggleFavourite, shards, craft,
  } = useBinderData(userId, onFavoritesChange, onPurchaseComplete);
  const signedIn = !!userId;

  // A craft on its way (the hero's name): "Yes, craft" stays disabled until it is answered, in any large view
  const [crafting, setCrafting] = useState<string | null>(null);
  const [forge, setForge] = useState<Forge | null>(null);
  // The server owns the hero the moment it says yes, but the binder shows it owned only when the forge has struck
  // and the card is home. Until the forge is over the hero also keeps its place in the list, so its pocket is there
  // to land in whatever the filter.
  const unlanded = crafting ?? (forge && forge.phase !== 'landed' ? forge.name : null);
  const unlisted = crafting ?? forge?.name ?? null;
  // The hook hands back a new object every render; the pages only re-render when a list really changes.
  const collection: Collection = useMemo(
    () => ({ owned: unlanded ? loaded.owned.filter(n => n !== unlanded) : loaded.owned, favourites: loaded.favourites, holo: loaded.holo }),
    [loaded.owned, loaded.favourites, loaded.holo, unlanded],
  );
  const listCollection: Collection = useMemo(
    () => (unlisted === unlanded ? collection : { ...collection, owned: collection.owned.filter(n => n !== unlisted) }),
    [collection, unlisted, unlanded],
  );

  const [view, setView] = useState<BinderView>(initialView ?? DEFAULT_VIEW);
  const [spread, setSpread] = useState(0);
  const [openHero, setOpenHero] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  // The hero to open on, until the heroes have loaded and its spread is known
  const [pendingHero, setPendingHero] = useState<string | null>(initialHero ?? null);

  const list = useMemo(() => binderList(heroes, view, listCollection), [heroes, view, listCollection]);
  // A list can shrink with no view change (unfavouriting under Favourites): never show a spread past the end.
  const shownSpread = clampSpread(spread, list.length);

  const changeView = useCallback((v: BinderView) => {
    setView(v);
    setSpread(0);
  }, []);

  // Opening on a hero: switch to a filter that shows it if need be, then go to its spread and light its pocket.
  useEffect(() => {
    if (!pendingHero || loading) return;
    setPendingHero(null);
    const hero = heroes.find(h => h.name === pendingHero);
    if (!hero) return;
    const filter = filterForHero(hero, collection, view.filter);
    const nextView = filter === view.filter ? view : { ...view, filter };
    setView(nextView);
    setSpread(spreadOfHero(binderList(heroes, nextView, collection), hero.name) ?? 0);
    setSpotlight(hero.name);
  }, [pendingHero, loading, heroes, collection, view]);

  // The light goes out a moment after the binder has opened
  useEffect(() => {
    if (!spotlight || !opened) return;
    const timer = window.setTimeout(() => setSpotlight(null), SPOTLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [spotlight, opened]);

  // Until the binder has been opened, Escape backs out of it
  useEffect(() => {
    if (opened) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened, onClose]);

  // The large view stays put while a craft is being answered or its animation plays, so the outcome is never lost:
  // Escape, a tap outside and the X do nothing until it has settled.
  const busy = useRef(false);
  busy.current = !!crafting || (!!forge && forge.phase !== 'landed');
  const closeLargeView = useCallback(() => { if (!busy.current) setOpenHero(null); }, []);

  useEffect(() => {
    if (!openHero) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLargeView(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openHero, closeLargeView]);

  const onToggleFavourite = useCallback((name: string) => { void toggleFavourite(name); }, [toggleFavourite]);

  // A craft closes the large view itself; focus then goes to the crafted hero's pocket, or, if that pocket is not on
  // show, to the binder's X, never to the page
  const focusAfterClose = useRef<string | null>(null);
  const closeToPocket = useCallback((name: string) => {
    focusAfterClose.current = name;
    setOpenHero(null);
  }, []);
  useEffect(() => {
    const name = focusAfterClose.current;
    if (openHero || !name || !rootEl.current) return;
    focusAfterClose.current = null;
    const pockets = Array.from(rootEl.current.querySelectorAll<HTMLElement>('.binder-pocket'));
    const target = pockets.find(p => p.getAttribute('aria-label') === name)
      ?? rootEl.current.querySelector<HTMLElement>('.binder-close');
    target?.focus();
  }, [openHero]);

  const shardsNow = useRef(shards);
  shardsNow.current = shards;
  const craftHero = useCallback(async (name: string) => {
    const before = shardsNow.current;
    setCrafting(name);
    let result: Awaited<ReturnType<typeof craft>>;
    // However the craft ends, even by throwing, it is over: the large view can close again
    try {
      result = await craft(name);
    } finally {
      setCrafting(null);
    }
    // The one place a craft of `name` is known to have worked (result.ok). A refused or failed craft plays nothing.
    if (result.ok) {
      // With animations off the card is simply owned in its pocket
      if (cardMotionOff()) closeToPocket(name);
      else setForge({ name, phase: 'shell', shown: before });
    }
    return result;
  }, [craft, closeToPocket]);

  // The forge plays once per craft, over this binder's own elements
  const rootEl = useRef<HTMLDivElement>(null);
  const forgeNow = useRef(forge);
  forgeNow.current = forge;
  const forging = forge?.name;
  useEffect(() => {
    const start = forgeNow.current;
    if (!forging || !start || !rootEl.current) return;
    return playForge({
      root: rootEl.current,
      hero: forging,
      from: start.shown,
      cost: CRAFT_PRICE,
      onShards: shown => setForge(f => f && { ...f, shown }),
      onPhase: phase => {
        setForge(f => f && { ...f, phase });
        if (phase !== 'landed') return;
        // Home: the large view goes and the pocket lights
        closeToPocket(forging);
        setSpotlight(forging);
      },
      onEnd: () => {
        setSpotlight(null);
        setForge(null);
      },
    });
  }, [forging]);

  const status = useMemo(() => {
    const enabled = heroes.filter(h => !h.disabled);
    return statusLine({
      filter: view.filter,
      spread: shownSpread,
      spreads: spreadCount(list.length),
      ownedCount: enabled.filter(h => collection.owned.includes(h.name)).length,
      enabledCount: enabled.length,
      holoCount: heroes.filter(h => matchesFilter(h, 'holo', collection)).length,
    });
  }, [heroes, collection, view.filter, shownSpread, list.length]);

  // Looked up among all heroes, so the large view stays put when its hero leaves the current list.
  const largeHero = openHero ? heroes.find(h => h.name === openHero) : undefined;

  return (
    <div ref={rootEl} className={`binder${cardMotionOff() ? ' binder--still' : ''}${opened ? '' : ' binder--unopened'}${signedIn ? ' binder--shards' : ''}`}>
      <div className="binder-top">
        <BinderFilter view={view} onChange={changeView} signedIn={signedIn} />
        <CloseButton className="binder-close" onClick={onClose} />
      </div>
      {/* Below the filter button, and over the large view, which crafting spends from */}
      {signedIn && (
        <div className="binder-shards" title="Your shards">
          <Shard />
          {/* The number on show counts down while the forge takes the shards; a screen reader hears the balance itself */}
          <b aria-hidden="true">{forge ? forge.shown : shards}</b>
          <span className="binder-shards-said" role="status">{shards} shards</span>
        </div>
      )}
      <div className="binder-stage">
        {error ? (
          <div className="binder-error" role="alert">
            <p>Couldn't load the heroes.</p>
            <button type="button" className="binder-retry" onClick={retry}>Try again</button>
          </div>
        ) : loading ? (
          <p className="binder-loading" role="status">Loading heroes</p>
        ) : (
          <BinderBook
            list={list}
            collection={collection}
            spread={shownSpread}
            onSpreadChange={setSpread}
            spotlight={spotlight}
            onOpen={setOpenHero}
            viewKey={`${view.filter}|${view.sort}|${view.query}`}
            fadeKey={`${view.filter}|${view.sort}`}
          />
        )}
      </div>
      {!error && !loading && <BinderStatus text={status} />}
      {largeHero && (
        <BinderLargeView
          key={largeHero.name}
          hero={largeHero}
          collection={collection}
          signedIn={signedIn}
          onToggleFavourite={onToggleFavourite}
          onClose={closeLargeView}
          shards={shards}
          onCraft={craftHero}
          crafting={!!crafting}
          forge={forge && forge.phase !== 'landed' && forge.name === largeHero.name ? forge.phase : undefined}
        />
      )}
      {/* Where the forge's shards and sparks fly, over everything */}
      <div className="binder-fx" aria-hidden="true" />
      {/* Last, so it lies over the book until the binder has been opened */}
      {!opened && <BinderOpening onOpened={() => setOpened(true)} />}
    </div>
  );
};

export default HeroCollection;
