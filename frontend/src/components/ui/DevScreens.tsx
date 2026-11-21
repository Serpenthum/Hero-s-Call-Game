import React, { useEffect, useState } from 'react';
import QuestRewardModal from '../QuestRewardModal';
import RequirementModal from '../RequirementModal';
import SettingsModal from '../SettingsModal';
import HowToPlayModal from '../HowToPlayModal';
import PackOpening from '../packs/PackOpening';
import type { PackCardKind, PackResult } from '../packs/packTypes';
import TutorialOverlay from '../tutorial/TutorialOverlay';
import config from '../../config';

// Dev only: shows one rarely reached screen with sample data, e.g. /#screens/quest-reward
const DevScreens: React.FC = () => {
  const name = window.location.hash.replace('#screens/', '');
  const [heroes, setHeroes] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${config.API_BASE_URL}/api/heroes`)
      .then(r => r.json())
      .then(list => setHeroes(list.slice(0, 4)))
      .catch(() => undefined);
  }, []);
  const noop = () => undefined;
  // Sample packs: /#screens/pack-opening (3 cards) and /#screens/pack-opening-holo (a bonus holographic fourth)
  const samplePack = (kinds: PackCardKind[]): PackResult => ({
    cards: kinds.map((kind, i) => ({ name: heroes[i].name, kind, hero: heroes[i] })),
    coinsBack: kinds.filter(k => k === 'repeat').length * 2,
    newVP: 30,
  });
  const packScreen = (kinds: PackCardKind[]) =>
    heroes.length >= kinds.length
      ? <PackOpening result={samplePack(kinds)} price={12} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} />
      : null;

  switch (name) {
    case 'quest-reward':
      return (
        <QuestRewardModal
          reward={{ completed: [{ id: 1, text: 'Win 1 battle with Ninja' }, { id: 2, text: 'Win 1 battle going 2nd' }], xpGained: 40, vpGained: 8, leveledUp: true } as any}
          onOk={noop}
        />
      );
    case 'requirement':
      return <RequirementModal isOpen onClose={noop} message="You need at least 21 heroes to play Survival Mode." currentCount={12} requiredCount={21} type="heroes" />;
    case 'settings':
      return <SettingsModal onClose={noop} />;
    case 'how-to-play':
      return <HowToPlayModal onClose={noop} />;
    case 'pack-opening':
      return packScreen(['new', 'repeat', 'new']);
    case 'pack-opening-holo':
      return packScreen(['new', 'repeat', 'new', 'holo']);
    case 'tutorial':
      return <TutorialOverlay step={{ key: 'dev', text: 'This is your Binder. Every hero you own lives here.', showNext: true, nextLabel: 'Got it', anchor: 'center' }} onNext={noop} />;
    default:
      return <div style={{ padding: 'var(--space-7)', color: 'var(--bone)' }}>Screens: quest-reward, requirement, settings, how-to-play, pack-opening, pack-opening-holo, tutorial</div>;
  }
};

export default DevScreens;
