// The binder: every hero in pockets, two pages at a time, with one filter button and a large view for reading a card.
// Signed in, the shard balance sits under the filter button and a hero not owned can be crafted from its large view.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CloseButton from './CloseButton';
import BinderOpening from './BinderOpening';
import useBinderData from './binder/useBinderData';
import { BinderBook } from './binder/BinderBook';
import { BinderFilter } from './binder/BinderFilter';
import { BinderStatus } from './binder/BinderStatus';
import { BinderLargeView } from './binder/BinderLargeView';
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

const HeroCollection: React.FC<HeroCollectionProps> = ({ onClose, userId, onFavoritesChange, onPurchaseComplete, initialHero, initialView }) => {
  const {
    heroes, collection: loaded, loading, error, retry, toggleFavourite, shards, craft,
  } = useBinderData(userId, onFavoritesChange, onPurchaseComplete);
  // The hook hands back a new object every render; the pages only re-render when a list really changes.
  const collection: Collection = useMemo(
    () => ({ owned: loaded.owned, favourites: loaded.favourites, holo: loaded.holo }),
    [loaded.owned, loaded.favourites, loaded.holo],
  );
  const signedIn = !!userId;

  const [view, setView] = useState<BinderView>(initialView ?? DEFAULT_VIEW);
  const [spread, setSpread] = useState(0);
  const [openHero, setOpenHero] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  // The hero to open on, until the heroes have loaded and its spread is known
  const [pendingHero, setPendingHero] = useState<string | null>(initialHero ?? null);

  const list = useMemo(() => binderList(heroes, view, collection), [heroes, view, collection]);
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

  useEffect(() => {
    if (!openHero) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenHero(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openHero]);

  const closeLargeView = useCallback(() => setOpenHero(null), []);
  const onToggleFavourite = useCallback((name: string) => { void toggleFavourite(name); }, [toggleFavourite]);

  // A craft on its way: "Yes, craft" stays disabled until it is answered, in any large view
  const [crafting, setCrafting] = useState(false);
  const craftHero = useCallback(async (name: string) => {
    setCrafting(true);
    const result = await craft(name);
    setCrafting(false);
    // The one place a craft of `name` is known to have worked (result.ok): the hero is owned and its pocket shows it.
    // The crafting animation (a later task) starts from here.
    return result;
  }, [craft]);

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
    <div className={`binder${cardMotionOff() ? ' binder--still' : ''}${opened ? '' : ' binder--unopened'}${signedIn ? ' binder--shards' : ''}`}>
      <div className="binder-top">
        <BinderFilter view={view} onChange={changeView} signedIn={signedIn} />
        <CloseButton className="binder-close" onClick={onClose} />
      </div>
      {/* Below the filter button, and over the large view, which crafting spends from */}
      {signedIn && (
        <div className="binder-shards" title="Your shards" aria-label={`${shards} shards`}>
          <b>{shards}</b><span>shards</span>
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
          crafting={crafting}
        />
      )}
      {/* Last, so it lies over the book until the binder has been opened */}
      {!opened && <BinderOpening onOpened={() => setOpened(true)} />}
    </div>
  );
};

export default HeroCollection;
