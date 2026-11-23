import React, { useEffect, useState } from 'react';
import { Hero } from '../types';
import config from '../config';
import HeroCard from './HeroCard';

interface CardLayoutTestProps {
  onExit: () => void;
}

const TEST_TEAMS = [
  { name: 'Test Opponents', heroes: ['Monk', 'Blood Hunter', 'Engineer'], isEnemy: true },
  { name: 'Test Team', heroes: ['Elementalist', 'Angel', 'Dual Defender'], isEnemy: false }
] as const;

// "Face states": every look the card can take, at the widths the game uses.
const FACE_WIDTHS = [350, 260, 195, 143, 78];
const LONG_TEXT_HEROES = ['Arcane Archer', 'Ninja', 'Shroomguard'];
const LONG_TEXT_WIDTHS = [195, 143];
const STATE_WIDTHS = [195, 78];
// Battle board card widths: desktop, a wide phone, a small phone
const BATTLE_WIDTHS = [182, 135, 110];

type FaceFixture = { label: string; hero: Hero; props?: Partial<React.ComponentProps<typeof HeroCard>> };

const buildFaceFixtures = (find: (name: string) => Hero) => {
  const full = (name: string): Hero => { const hero = find(name); return { ...hero, currentHP: hero.HP, maxHP: hero.HP }; };
  const busy = {
    ...full('Shroomguard'),
    currentHP: 7,
    statusEffects: {
      poison: 3,
      taunt: { target: 'Paladin' },
      silenced: { active: true, duration: 2 },
      statModifiers: { Defense: -2 },
      totem_count: 2
    },
    passiveBuffs: [{ stat: 'accuracy', value: 1, sourceHero: 'Bard', sourceName: 'Song' }]
  } as unknown as Hero;

  const looks: FaceFixture[] = [
    { label: 'Plain', hero: full('Paladin') },
    { label: 'Favourite', hero: full('Brawler'), props: { favorite: true } },
    { label: 'Holographic', hero: full('Wizard'), props: { holo: true } },
    { label: 'Holographic favourite', hero: full('Ninja'), props: { holo: true, favorite: true } },
    { label: 'Glint and tilt', hero: full('Monk'), props: { glint: true, tilt: true } },
    { label: 'Busy', hero: busy, props: { showFullInfo: true } },
    // A buffed stat with a hover tooltip, under the foil, the star and the status chips
    { label: 'Busy holographic favourite', hero: { ...busy, modifiedAccuracy: '+3' }, props: { showFullInfo: true, holo: true, favorite: true } }
  ];
  const states: FaceFixture[] = [
    { label: 'Dead', hero: { ...full('Paladin'), currentHP: 0 } },
    { label: 'Banned', hero: full('Wizard'), props: { isBanned: true } },
    { label: 'Selected', hero: full('Brawler'), props: { isSelected: true } },
    { label: 'Selectable', hero: full('Angel'), props: { isSelectable: true } },
    { label: 'Current turn', hero: full('Monk'), props: { isCurrentTurn: true } },
    { label: 'Blocked', hero: full('Engineer'), props: { isBlocked: true } },
    { label: 'Enemy', hero: full('Blood Hunter'), props: { isEnemy: true } },
    { label: 'Dragon Rider dismounted', hero: { ...full('Dragon Rider'), permanentDisables: { abilities: true } } as unknown as Hero }
  ];
  // Holographic next to plain at battle sizes, and holographic under every battle state
  const battleHolo: FaceFixture[] = [
    { label: 'Plain', hero: full('Paladin') },
    { label: 'Holo', hero: full('Wizard'), props: { holo: true } },
    { label: 'Plain enemy', hero: full('Blood Hunter'), props: { isEnemy: true } },
    { label: 'Holo enemy', hero: full('Plague Spreader'), props: { holo: true, isEnemy: true } },
    { label: 'Holo favourite', hero: full('Ninja'), props: { holo: true, favorite: true } },
    { label: 'Holo, its turn', hero: full('Monk'), props: { holo: true, isCurrentTurn: true } },
    { label: 'Holo selected', hero: full('Brawler'), props: { holo: true, isSelected: true } },
    { label: 'Holo selectable', hero: full('Angel'), props: { holo: true, isSelectable: true, isEnemy: true } },
    { label: 'Holo blocked', hero: full('Engineer'), props: { holo: true, isBlocked: true, isEnemy: true } },
    { label: 'Holo dead', hero: { ...full('Cavalier'), currentHP: 0 }, props: { holo: true } },
    { label: 'Holo busy', hero: busy, props: { holo: true, favorite: true, showFullInfo: true } },
    { label: 'Holo banned', hero: full('Barbarian'), props: { holo: true, isBanned: true } }
  ];
  const longText: FaceFixture[] = LONG_TEXT_HEROES.map(name => ({ label: name, hero: full(name) }));
  return { looks, states, battleHolo, longText };
};

const FaceRow: React.FC<{ title: string; width: number; fixtures: FaceFixture[] }> = ({ title, width, fixtures }) => (
  <div className="card-face-states-row" style={{ '--hero-card-scale': width / 260 } as React.CSSProperties}>
    <h3>{title} · {width}px</h3>
    <div className="card-face-states-cards">
      {fixtures.map(fixture => (
        <figure key={fixture.label}>
          <HeroCard hero={fixture.hero} showFullInfo={false} disableHPAnimations {...fixture.props} />
          <figcaption>{fixture.label}</figcaption>
        </figure>
      ))}
    </div>
  </div>
);

const isHero = (value: unknown): value is Hero => {
  if (!value || typeof value !== 'object') return false;

  const hero = value as Record<string, unknown>;
  return typeof hero.name === 'string' &&
    typeof hero.HP === 'number' &&
    typeof hero.Defense === 'number' &&
    typeof hero.Accuracy === 'string' &&
    typeof hero.BasicAttack === 'string' &&
    Array.isArray(hero.Ability);
};

const CardLayoutTest: React.FC<CardLayoutTestProps> = ({ onExit }) => {
  const [teams, setTeams] = useState<Array<{ name: string; heroes: Hero[]; isEnemy: boolean }> | null>(null);
  const [faces, setFaces] = useState<ReturnType<typeof buildFaceFixtures> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadHeroes = async () => {
      setTeams(null);
      setError(null);

      try {
        const response = await fetch(`${config.API_BASE_URL}/api/heroes`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Hero list request failed (${response.status}).`);
        }

        const data: unknown = await response.json();
        if (!Array.isArray(data)) {
          throw new Error('Hero list response was not a valid list.');
        }

        const heroList = data.filter(isHero);
        // Dev only: #all-cards shows every hero, three to a row, to check text fit across the roster
        if (import.meta.env.DEV && window.location.hash === '#all-cards') {
          const rows: Array<{ name: string; heroes: Hero[]; isEnemy: boolean }> = [];
          for (let i = 0; i < heroList.length; i += 3) {
            const heroes = heroList.slice(i, i + 3).map(hero => ({ ...hero, currentHP: hero.HP, maxHP: hero.HP }));
            rows.push({ name: `Heroes ${i / 3 + 1}`, heroes, isEnemy: false });
          }
          if (!controller.signal.aborted) setTeams(rows);
          return;
        }

        const findHero = (name: string) => {
          const hero = heroList.find(candidate => candidate.name === name);
          if (!hero) {
            throw new Error(`The test battle needs the ${name} hero, but it was not returned by the server.`);
          }
          return hero;
        };

        const loadedTeams = TEST_TEAMS.map(team => {
          const selectedHeroes = team.heroes.map(name => {
            const hero = findHero(name);
            return { ...hero, currentHP: hero.HP, maxHP: hero.HP };
          });

          return { name: team.name, heroes: selectedHeroes, isEnemy: team.isEnemy };
        });

        const loadedFaces = buildFaceFixtures(findHero);

        if (!controller.signal.aborted) {
          setTeams(loadedTeams);
          setFaces(loadedFaces);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : 'An unknown error occurred.';
        console.error('Failed to load card layout test heroes:', loadError);
        setError(`Could not load the test battle heroes. ${message}`);
      }
    };

    void loadHeroes();
    return () => controller.abort();
  }, [retryCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  return (
    <main className="card-layout-test">
      <button
        type="button"
        className="card-layout-test-exit"
        onClick={onExit}
        aria-label="Exit test battle"
        title="Exit test battle"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      {error ? (
        <div className="card-layout-test-message" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetryCount(count => count + 1)}>
            Try Again
          </button>
        </div>
      ) : teams ? (
        <div className="card-layout-test-teams">
          {teams.map(team => (
            <section
              key={team.name}
              className={`card-layout-test-team ${team.isEnemy ? 'card-layout-test-opponents' : 'card-layout-test-players'}`}
              aria-label={team.isEnemy ? 'Opponent heroes' : 'Player heroes'}
            >
              <div className="card-layout-test-team-cards">
                {team.heroes.map((hero, index) => (
                  <HeroCard
                    key={`${team.name}-${hero.name}-${index}`}
                    hero={hero}
                    isEnemy={team.isEnemy}
                    showFullInfo={false}
                    disableHPAnimations
                  />
                ))}
              </div>
            </section>
          ))}
          {faces && (
            <section className="card-face-states" aria-label="Face states">
              <h2>Face states</h2>
              {FACE_WIDTHS.map(width => <FaceRow key={`looks-${width}`} title="Looks" width={width} fixtures={faces.looks} />)}
              {STATE_WIDTHS.map(width => <FaceRow key={`states-${width}`} title="Battle and draft states" width={width} fixtures={faces.states} />)}
              {BATTLE_WIDTHS.map(width => <FaceRow key={`battle-holo-${width}`} title="Holographic on the battle board" width={width} fixtures={faces.battleHolo} />)}
              {LONG_TEXT_WIDTHS.map(width => <FaceRow key={`long-${width}`} title="Longest texts" width={width} fixtures={faces.longText} />)}
            </section>
          )}
        </div>
      ) : (
        <div className="card-layout-test-loading" role="status" aria-label="Loading test battle" />
      )}
    </main>
  );
};

export default CardLayoutTest;
