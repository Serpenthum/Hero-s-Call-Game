import React, { useState } from 'react';
import TutorialOverlay, { OverlayStep } from './TutorialOverlay';

interface LobbyTutorialProps {
  onFinish: () => void;
}

const STEPS: OverlayStep[] = [
  {
    key: 'lobby-home',
    text: 'This is the lobby, your home base. From here you can jump into battles, check your quests and manage your heroes.',
    showNext: true,
    anchor: 'center'
  },
  {
    key: 'lobby-collection',
    text: 'This is your Hero Collection. Every hero you own lives here, so come back any time to read about their abilities and specials.',
    target: ['[data-tutorial="collection"]'],
    showNext: true,
    nextLabel: 'Got it ▶'
  }
];

// Brief tour of the lobby; the lobby is fully usable once the last prompt is dismissed.
const LobbyTutorial: React.FC<LobbyTutorialProps> = ({ onFinish }) => {
  const [index, setIndex] = useState(0);

  const handleNext = () => {
    if (index + 1 >= STEPS.length) onFinish();
    else setIndex(index + 1);
  };

  return <TutorialOverlay step={STEPS[index]} onNext={handleNext} />;
};

export default LobbyTutorial;
