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
        const loadedTeams = TEST_TEAMS.map(team => {
          const selectedHeroes = team.heroes.map(name => {
            const hero = heroList.find(candidate => candidate.name === name);
            if (!hero) {
              throw new Error(`The test battle needs the ${name} hero, but it was not returned by the server.`);
            }

            return { ...hero, currentHP: hero.HP, maxHP: hero.HP };
          });

          return { name: team.name, heroes: selectedHeroes, isEnemy: team.isEnemy };
        });

        if (!controller.signal.aborted) {
          setTeams(loadedTeams);
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
        </div>
      ) : (
        <div className="card-layout-test-loading" role="status" aria-label="Loading test battle" />
      )}
    </main>
  );
};

export default CardLayoutTest;
