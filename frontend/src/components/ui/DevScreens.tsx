import React, { useEffect, useState } from 'react';
import QuestRewardModal from '../QuestRewardModal';
import RequirementModal from '../RequirementModal';
import SettingsModal from '../SettingsModal';
import HowToPlayModal from '../HowToPlayModal';
import PackOpeningAnimation from '../PackOpeningAnimation';
import TutorialOverlay from '../tutorial/TutorialOverlay';
import config from '../../config';

// Dev only: shows one rarely reached screen with sample data, e.g. /#screens/quest-reward
const DevScreens: React.FC = () => {
  const name = window.location.hash.replace('#screens/', '');
  const [heroes, setHeroes] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${config.API_BASE_URL}/api/heroes`)
      .then(r => r.json())
      .then(list => setHeroes(list.slice(0, 3)))
      .catch(() => undefined);
  }, []);
  const noop = () => undefined;

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
      return heroes.length ? <PackOpeningAnimation heroes={heroes} onComplete={noop} /> : null;
    case 'tutorial':
      return <TutorialOverlay step={{ key: 'dev', text: 'This is your Binder. Every hero you own lives here.', showNext: true, nextLabel: 'Got it', anchor: 'center' }} onNext={noop} />;
    default:
      return <div style={{ padding: 'var(--space-7)', color: 'var(--bone)' }}>Screens: quest-reward, requirement, settings, how-to-play, pack-opening, tutorial</div>;
  }
};

export default DevScreens;
