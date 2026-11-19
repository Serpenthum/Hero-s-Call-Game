import React from 'react';
import Coin from '../Coin';
import Icon from '../ui/Icon';
import { ShopIcon, BinderIcon } from '../LobbyIcons';
import config from '../../config';
import { Quest } from '../../types';
import { collectionSummary, heroImageUrl } from '../../lobby/lobbyRules';

interface PlayerPanelProps {
  username: string;
  profileIcon: string | null;
  record: string | null;
  quests: Quest[];
  pendingQuestIds: Set<string>;
  revealStage: string;
  resetText: string;
  collection: ReturnType<typeof collectionSummary> | null;
  onOpenProfile(): void;
  onOpenShop(): void;
  onOpenBinder(): void;
}

// Quest rewards the server gives when a quest carries none.
const DEFAULT_REWARD = { vp: 3, xp: 15 };

// The player's ledger beside the table: who you are, today's quests, your collection, Shop and Binder.
const PlayerPanel: React.FC<PlayerPanelProps> = ({
  username, profileIcon, record, quests, pendingQuestIds, revealStage, resetText, collection,
  onOpenProfile, onOpenShop, onOpenBinder,
}) => (
  <aside className="lobby-panel">
    <div className="lobby-who">
      {/* The portrait and the name both open the profile */}
      <button type="button" className="lobby-portrait" onClick={onOpenProfile} aria-label="Open profile" title="Profile">
        {profileIcon && <img src={heroImageUrl(config.IMAGE_BASE_URL, profileIcon)} alt="" />}
      </button>
      <div className="lobby-who-text">
        <h2 className="lobby-who-name">
          <button type="button" className="lobby-name-btn" onClick={onOpenProfile} aria-label={`${username}, open profile`} title="Profile">
            {username}
          </button>
        </h2>
        {record && <small className="lobby-record">{record}</small>}
      </div>
    </div>

    <div className="lobby-sec">
      <h3 className="lobby-sec-title">Quests</h3>
      <small className="lobby-sec-note">{resetText}</small>
    </div>
    {quests.length === 0 ? (
      <p className="lobby-empty">No quests today. New ones arrive at midnight UTC.</p>
    ) : (
      <ul className="lobby-quests">
        {quests.map(quest => {
          // Pending quests stay unchecked until the reveal starts.
          const revealed = !pendingQuestIds.has(quest.id) || revealStage !== 'idle';
          const isDone = quest.completed && revealed;
          const justRevealed = pendingQuestIds.has(quest.id) && revealed;
          const shownProgress = quest.completed && !revealed ? quest.target - 1 : quest.progress;
          const percent = isDone ? 100 : Math.max(0, Math.min(100, (shownProgress / Math.max(1, quest.target)) * 100));
          const reward = quest.reward ?? DEFAULT_REWARD;
          return (
            <li key={quest.id} className={`lobby-quest${isDone ? ' completed' : ''}${justRevealed ? ' just-completed' : ''}`}>
              <div className="lobby-quest-top">
                <span className="lobby-quest-text">{quest.text}</span>
                <span className="lobby-quest-progress">
                  {isDone ? <Icon name="check" title="Done" /> : `${shownProgress}/${quest.target}`}
                </span>
              </div>
              <div className="lobby-quest-bar"><i style={{ width: `${percent}%` }} /></div>
              <div className="lobby-quest-reward">
                <Coin /><span>{reward.vp}</span>
                <span className="lobby-dot" aria-hidden="true">·</span>
                <span>{reward.xp} XP</span>
              </div>
            </li>
          );
        })}
      </ul>
    )}

    {collection && (
      <div className="lobby-collection">
        <div className="lobby-sec">
          <h3 className="lobby-sec-title">Collection</h3>
          <small className="lobby-sec-note">{collection.owned} of {collection.total} heroes</small>
        </div>
        <div className="lobby-collection-body">
          <div className="lobby-quest-bar">
            <i style={{ width: `${collection.total ? (collection.owned / collection.total) * 100 : 0}%` }} />
          </div>
          <div className="lobby-collection-counts">
            <Icon name="star" size={14} className="lobby-fav-star" />
            <span>{collection.favorites} {collection.favorites === 1 ? 'favourite' : 'favourites'}</span>
            {collection.holo !== null && (
              <>
                <span className="lobby-dot" aria-hidden="true">·</span>
                <span className="lobby-holo-count">{collection.holo} holographic</span>
              </>
            )}
          </div>
        </div>
      </div>
    )}

    <div className="lobby-tiles">
      <button type="button" className="lobby-tile shop-tile" onClick={onOpenShop}>
        <ShopIcon className="lobby-tile-icon" />
        <span>Shop</span>
      </button>
      <button type="button" className="lobby-tile binder-tile" data-tutorial="collection" onClick={onOpenBinder}>
        <BinderIcon className="lobby-tile-icon" />
        <span>Binder</span>
      </button>
    </div>
  </aside>
);

export default PlayerPanel;
