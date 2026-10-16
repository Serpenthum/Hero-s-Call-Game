import React from 'react';
import CloseButton from './CloseButton';
import '../styles/RulesModal.css';

interface HowToPlayModalProps {
  onClose: () => void;
}

const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ onClose }) => (
  <div className="modal-overlay">
    <div className="rules-modal" role="dialog" aria-modal="true" aria-label="How to play">
      <div className="rules-modal-header">
        <h3>How to play</h3>
        <CloseButton onClick={onClose} />
      </div>

      <div className="rules-modal-content">
        <div className="rules-category">
          <h4>Game objective</h4>
          <div className="rule-text">Defeat all enemy heroes to win the battle</div>
          <div className="rule-text">Last team standing wins</div>
        </div>

        <div className="rules-category">
          <h4>Combat basics</h4>
          <div className="rule-item">
            <span className="rule-label">Turn structure:</span>
            <span className="rule-value">Each turn you can use a Basic Attack OR an Ability, then End Turn</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">First turn restriction:</span>
            <span className="rule-value">The player who starts CANNOT use their first hero's ability on turn 1</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Attack rolls:</span>
            <span className="rule-value">Roll 1D20 + Accuracy vs enemy Defense to hit</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Critical hits:</span>
            <span className="rule-value">Natural 20 = Critical (max damage)</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Damage:</span>
            <span className="rule-value">Roll dice for damage (e.g., 2D6 = roll two 6-sided dice)</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Defense:</span>
            <span className="rule-value">Higher Defense = harder to hit</span>
          </div>
        </div>

        <div className="rules-category">
          <h4>Special mechanics</h4>
          <div className="rule-item">
            <span className="rule-label">Advantage:</span>
            <span className="rule-value">Roll twice, take the higher result</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Disadvantage:</span>
            <span className="rule-value">Roll twice, take the lower result</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Taunt:</span>
            <span className="rule-value">Forces enemy to target a specific hero</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Poison:</span>
            <span className="rule-value">Takes damage at start of each turn</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Silence:</span>
            <span className="rule-value">Cannot use abilities</span>
          </div>
        </div>

        <div className="rules-category">
          <h4>Game modes</h4>
          <div className="rule-item">
            <span className="rule-label">Draft mode:</span>
            <span className="rule-value">Take turns picking heroes (ban 1, pick 3)</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Random mode:</span>
            <span className="rule-value">Both players get random teams instantly</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Survival mode:</span>
            <span className="rule-value">Fight other players using Survival Mode decks. Heroes that win in this battle cannot be used again</span>
          </div>
          <div className="rule-item">
            <span className="rule-label">Friend challenges:</span>
            <span className="rule-value">Challenge an online friend from your friends list to a draft battle. XP only</span>
          </div>
        </div>

        <div className="rules-category">
          <h4>Hero abilities</h4>
          <div className="rule-text">Each hero has a unique <strong>Ability</strong> and <strong>Special</strong></div>
          <div className="rule-text">Abilities cost your action for the turn</div>
          <div className="rule-text">Specials are passive or triggered automatically</div>
          <div className="rule-text">Check the Binder to learn each hero's abilities</div>
        </div>

        <div className="rules-category">
          <h4>Tips</h4>
          <div className="rule-item">
            <span className="rule-label">Team composition:</span>
            <span className="rule-value">Build your team carefully - synergy between heroes is crucial</span>
          </div>
          <div className="rule-text">Position matters - some abilities affect adjacent allies/enemies</div>
          <div className="rule-text">Team synergy is key - combine hero abilities strategically</div>
          <div className="rule-text">Pay attention to turn order - some heroes shine when going first/second</div>
          <div className="rule-text">Read enemy abilities carefully to plan your strategy</div>
        </div>
      </div>
    </div>
  </div>
);

export default HowToPlayModal;
