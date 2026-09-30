import React from 'react';
import { PendingQuestReward } from '../types';

interface QuestRewardModalProps {
  reward: PendingQuestReward;
  onOk: () => void;
}

const QuestRewardModal: React.FC<QuestRewardModalProps> = ({ reward, onOk }) => (
  <div className="quest-reward-overlay">
    <div className="quest-reward-modal" role="dialog" aria-modal="true" aria-label="Quest complete">
      <div className="quest-reward-star">★</div>
      <h3>Quest Complete!</h3>
      <ul className="quest-reward-list">
        {reward.completed.map((q, i) => (
          <li key={q.id} style={{ animationDelay: `${0.35 + i * 0.15}s` }}>
            <span className="quest-reward-check">✓</span>
            {q.text}
          </li>
        ))}
      </ul>
      <div className="quest-reward-chips">
        <span className="quest-reward-chip xp">+{reward.xpGained} XP</span>
        <span className="quest-reward-chip vp">+{reward.vpGained} VP</span>
      </div>
      {reward.leveledUp && <div className="quest-reward-levelup">Level up!</div>}
      <button className="quest-reward-ok" onClick={onOk} autoFocus>OK</button>
    </div>
  </div>
);

export default QuestRewardModal;
