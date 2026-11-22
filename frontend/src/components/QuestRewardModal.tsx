import React, { useEffect, useRef } from 'react';
import { PendingQuestReward } from '../types';
import Coin from './Coin';
import Icon from './ui/Icon';
import { playSound } from '../sound';
import '../styles/QuestRewardModal.css';

interface QuestRewardModalProps {
  reward: PendingQuestReward;
  onOk: () => void;
}

const QuestRewardModal: React.FC<QuestRewardModalProps> = ({ reward, onOk }) => {
  // The chime plays once when the modal opens (a ref keeps StrictMode's second effect quiet); its coins follow.
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    playSound('quest');
    if (reward.vpGained > 0) playSound('coin', { delayMs: 600 });
  }, [reward.vpGained]);

  return (
    <div className="quest-reward-overlay">
      <div className="quest-reward-modal" role="dialog" aria-modal="true" aria-label="Quest complete">
        <Icon name="star" size={36} className="quest-reward-star" />
        <h3>Quest complete</h3>
        <ul className="quest-reward-list">
          {reward.completed.map((q, i) => (
            <li key={q.id} style={{ animationDelay: `${0.35 + i * 0.15}s` }}>
              <Icon name="check" className="quest-reward-check" />
              {q.text}
            </li>
          ))}
        </ul>
        <div className="quest-reward-chips">
          <span className="quest-reward-chip xp">+{reward.xpGained} XP</span>
          <span className="quest-reward-chip vp">+{reward.vpGained} <Coin /></span>
        </div>
        {reward.leveledUp && <div className="quest-reward-levelup">Level up!</div>}
        <button className="quest-reward-ok" onClick={onOk} autoFocus>OK</button>
      </div>
    </div>
  );
};

export default QuestRewardModal;
