import React from 'react';
import { Hero } from '../../types';
import HeroCard from '../HeroCard';
import DraftPortrait, { heroImage } from './DraftPortrait';
import { getHoloEffects } from '../../holoSetting';

interface BandPlayer {
  name: string;
  team: Hero[];
  status: 'choosing' | 'done';
}

export interface DraftBandProps {
  layout: 'table' | 'focus';
  me: BandPlayer;
  them: BandPlayer;
  bans: { mine: string | null; theirs: string | null };
  banHolo: { mine: boolean; theirs: boolean };
  onRead(hero: Hero): void;
  /** Full hero for a banned name, so a ban can be read. Without it the ban shows as a plain portrait. */
  heroByName?: (name: string) => Hero | undefined;
}

const SLOTS = [0, 1, 2];

/** The band across the table: your team, VS over both bans, the opponent's team (mirrored). */
const DraftBand: React.FC<DraftBandProps> = ({ layout, me, them, bans, banHolo, onRead, heroByName }) => {
  const side = (who: 'me' | 'them', p: BandPlayer) => {
    const enemy = who === 'them';
    return (
      <div className={`draft-side draft-side--${who}`}>
        {layout === 'table' && (
          <div className="draft-side-head">
            <h3 className="draft-side-name">
              {p.name} <small>{Math.min(3, p.team.length)}/3</small>
            </h3>
            <span className={`draft-status draft-status--${p.status}`}>{p.status === 'done' ? 'Done ✓' : 'Choosing…'}</span>
          </div>
        )}
        <div className={`draft-slots draft-slots--${who}`}>
          {SLOTS.map(i => {
            const hero = p.team[i];
            if (!hero) {
              return (
                <div key={i} className="draft-slot draft-slot--empty">
                  {i + 1}
                </div>
              );
            }
            return (
              <div key={hero.name} className="draft-slot draft-slot--filled" data-name={hero.name}>
                {layout === 'table' ? (
                  <HeroCard hero={hero} isEnemy={enemy} holo={!!hero.holo} readable="tap" disableHPAnimations />
                ) : (
                  <DraftPortrait hero={hero} enemy={enemy} onRead={onRead} />
                )}
              </div>
            );
          })}
        </div>
        {layout === 'focus' && (
          <span className={`draft-status draft-status--${p.status}`}>{p.status === 'done' ? 'Done ✓' : 'Choosing…'}</span>
        )}
      </div>
    );
  };

  const ban = (who: 'mine' | 'theirs') => {
    const name = bans[who];
    const label = who === 'mine' ? 'Your ban' : 'Their ban';
    const full = name ? heroByName?.(name) : undefined;
    return (
      <div className={`draft-ban draft-ban--${who}${name ? ' draft-ban--set' : ''}`}>
        <div className="draft-ban-token">
          {name && full && <DraftPortrait hero={{ ...full, holo: banHolo[who] }} onRead={onRead} />}
          {name && !full && (
            <span className={`draft-portrait${banHolo[who] && getHoloEffects() ? ' draft-portrait--holo' : ''}`}>
              <img src={heroImage(name)} alt="" draggable={false} />
            </span>
          )}
        </div>
        <em className="draft-ban-name">{name ?? label}</em>
      </div>
    );
  };

  return (
    <section className="draft-band" aria-label="Teams and bans">
      {side('me', me)}
      <div className="draft-band-centre">
        <div className="draft-vs">VS</div>
        <div className="draft-bans">
          {ban('mine')}
          {ban('theirs')}
        </div>
      </div>
      {side('them', them)}
    </section>
  );
};

export default DraftBand;
