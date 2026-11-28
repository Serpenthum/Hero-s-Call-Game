import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Hero, Ability } from '../types';
import { getBadges, type Badge } from '../battle/badges';
import BadgeToken from './badges/BadgeToken';
import { useBadgeTip } from './badges/useBadgeTip';
import config from '../config';
import { getAttackDisplay } from '../attackDisplay';
import { cardMotionOff } from '../cards/cardMotion';
import { getHoloEffects } from '../holoSetting';
import { ReadMode, resolveReadMode, pickTextSize, ruleSections, textSizeRange, textFitStages } from '../cards/cardRules';
import { useCardReader } from '../cards/CardReader';
import { useLongPress } from '../cards/useLongPress';
import '../styles/HeroCard.css';

export type HeroCardData = Omit<Hero, 'Ability' | 'Special'> & {
  Ability: Pick<Ability, 'name' | 'description'>[];
  Special?: Pick<Ability, 'name' | 'description'> | Pick<Ability, 'name' | 'description'>[];
};

interface HeroCardProps {
  hero: HeroCardData;
  isSelectable?: boolean;
  isSelected?: boolean;
  isBanned?: boolean;
  isEnemy?: boolean;
  isCurrentTurn?: boolean;
  isBlocked?: boolean; // Alive but cannot be targeted right now (taunt, untargetable, ...)
  onClick?: () => void;
  showFullInfo?: boolean;
  disableHPAnimations?: boolean;
  animKey?: string; // Lets the battle animation layer locate this card
  tutorialReveal?: 'hidden' | 'grow'; // Tutorial: card is invisible, or grows in from nothing
  className?: string;
  children?: React.ReactNode;
  holo?: boolean; // Holographic foil: rainbow sheen and sparkle on the face; the frame is a normal card's
  favorite?: boolean; // Gold star in the top-right corner
  glint?: boolean; // A light sweep across the card every few seconds
  tilt?: boolean; // The card leans toward the pointer (and the foil follows it)
  readable?: ReadMode; // How the large view opens; defaults from isSelectable
  // Battle: a tap that does not choose the card shows its details instead (no reader; fallen cards too)
  onInspect?: () => void;
  isFocused?: boolean; // Battle: this card is the active player's focus
  // Rules text never smaller than this (px): when it does not fit, the text panel grows up the card instead.
  // Off by default; every screen without it keeps the 62% panel and shrinks the text.
  minTextPx?: number;
  // Name, art and stats only at any width: the face a card gets at 129px and below (the binder's pocket cards).
  tiny?: boolean;
  // Battle: the badge tokens to show (the battle passes them with both teams and the queued taunts in view);
  // without it the card works them out from the hero alone
  badges?: Badge[];
  // Battle: an open badge text closes when this changes (the turn)
  badgeResetKey?: unknown;
}

// Largest share of the card's height the name-and-rules panel may cover.
const LOWER_PANEL_MAX = 0.62;
// 14px on a 260px card: the size today's card gives short rules text.
const CARD_TEXT_MAX_EM = 1.08;

const STAT_ICONS = {
  hp: (
    <svg className="card-gem-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ),
  defense: (
    <svg className="card-gem-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" />
    </svg>
  ),
  accuracy: (
    <svg className="card-gem-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2v5.5M12 16.5V22M2 12h5.5M16.5 12H22" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  ),
  attack: (
    <svg className="card-gem-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3l12 12M20 3L8 15M13.5 18.5l5-5M10.5 18.5l-5-5M17 17l3.5 3.5M7 17l-3.5 3.5" />
    </svg>
  )
};

const HeroCard: React.FC<HeroCardProps> = ({
  hero,
  isSelectable = false,
  isSelected = false,
  isBanned = false,
  isEnemy = false,
  isCurrentTurn = false,
  isBlocked = false,
  onClick,
  showFullInfo = true,
  disableHPAnimations = false,
  animKey,
  tutorialReveal,
  className = '',
  children,
  holo: holoProp = false,
  favorite = false,
  glint = false,
  tilt = false,
  readable,
  onInspect,
  isFocused = false,
  minTextPx,
  tiny = false,
  badges,
  badgeResetKey
}) => {
  // "Show holographic effects: off" draws a holographic card plain, everywhere.
  const holo = holoProp && getHoloEffects();
  const [animatedHP, setAnimatedHP] = useState<number | null>(null);
  const [hpColor, setHpColor] = useState<string>('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isDismounted, setIsDismounted] = useState(false);
  const previousHP = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const wasDismountedRef = useRef(false);
  const resurrectionProcessedRef = useRef(false); // Track if we've processed the current resurrection
  const cardRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const reader = useCardReader();
  const openReader = () => reader.open(hero, { holo, favorite });
  const pressHandlers = useLongPress(openReader);
  const shownBadges = badges ?? getBadges(hero as Hero);
  const badgeTip = useBadgeTip(badgeResetKey);
  // The open text goes when its badge does (and does not come back by itself)
  const openBadge = badgeTip.openKey && shownBadges.some(b => b.key === badgeTip.openKey) ? badgeTip.openKey : null;
  useEffect(() => {
    if (badgeTip.openKey && !openBadge) badgeTip.close();
  }, [badgeTip, openBadge]);

  const currentHP = hero.currentHP !== undefined ? hero.currentHP : (typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP);
  const maxHP = typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP;

  // Initialize previous HP on first render
  useEffect(() => {
    if (previousHP.current === null) {
      previousHP.current = currentHP;
      setAnimatedHP(currentHP);
    }
  }, [currentHP]);

  // Track Dragon Rider's Dismount trigger
  useEffect(() => {
    if (hero.name === 'Dragon Rider') {
      const isDismountActive = (hero as any).permanentDisables?.abilities === true;
      
      if (isDismountActive && !wasDismountedRef.current) {
        // Dismount just triggered - play flip animation
        console.log('🐉 Dragon Rider dismounting! Triggering flip animation');
        setIsFlipping(true);
        setIsDismounted(true);
        wasDismountedRef.current = true;
        
        // Remove flip animation class after animation completes
        setTimeout(() => {
          setIsFlipping(false);
        }, 600); // Match animation duration
      } else if (isDismountActive) {
        // Already dismounted, just set state
        setIsDismounted(true);
        wasDismountedRef.current = true;
      }
    }
  }, [(hero as any).permanentDisables?.abilities, hero.name]);

  // Animate HP changes (only if animations are enabled)
  useEffect(() => {
    if (disableHPAnimations) {
      // Skip all HP animations if disabled
      setAnimatedHP(currentHP);
      setHpColor('');
      previousHP.current = currentHP;
      return;
    }

    // Special handling for resurrection
    if (hero.resurrected && currentHP > 0 && !resurrectionProcessedRef.current) {
      console.log(`👼 Resurrection detected for ${hero.name} - starting animation`);
      resurrectionProcessedRef.current = true; // Mark as processed to prevent re-triggering
      setIsAnimating(true);
      
      // Clear any existing animation
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
      
      // Step 1: Show HP at 0 with red color
      setAnimatedHP(0);
      setHpColor('#ff0000');
      
      // Step 2: After 500ms, start healing to current HP
      animationRef.current = setTimeout(() => {
        console.log(`👼 Starting heal animation for ${hero.name} to ${currentHP} HP`);
        setHpColor('#00ff00'); // Change to green for healing
        
        // Animate from 0 to currentHP
        let current = 0;
        const healAnimate = () => {
          if (current < currentHP) {
            current += 1;
            setAnimatedHP(current);
            animationRef.current = setTimeout(healAnimate, 50); // Fast heal animation
          } else {
            setAnimatedHP(currentHP);
            // Return to normal color after 1 second
            animationRef.current = setTimeout(() => {
              setHpColor('');
              setIsAnimating(false);
              previousHP.current = currentHP;
            }, 1000);
          }
        };
        healAnimate();
      }, 500);
      
      return;
    }
    
    // Reset the resurrection flag when the hero no longer has it
    if (!hero.resurrected && resurrectionProcessedRef.current) {
      resurrectionProcessedRef.current = false;
      console.log(`✨ Resurrection flag cleared for ${hero.name}`);
    }

    if (previousHP.current !== null && previousHP.current !== currentHP && !isAnimating) {
      const difference = currentHP - previousHP.current;
      const isHealing = difference > 0;
      const isDamage = difference < 0;

      if (isHealing || isDamage) {
        setIsAnimating(true);
        setHpColor(isHealing ? '#00ff00' : '#ff0000'); // Green for healing, red for damage
        
        // Clear any existing animation
        if (animationRef.current) {
          clearTimeout(animationRef.current);
        }

        // Animate HP counter
        const startHP = previousHP.current;
        const endHP = currentHP;
        const step = isHealing ? 1 : -1;
        let current = startHP;

        const animate = () => {
          if ((isHealing && current < endHP) || (isDamage && current > endHP)) {
            current += step;
            setAnimatedHP(current);
            animationRef.current = setTimeout(animate, 100); // 100ms per step
          } else {
            setAnimatedHP(endHP);
            // Return to normal color after 1 second
            animationRef.current = setTimeout(() => {
              setHpColor('');
              setIsAnimating(false);
            }, 1000);
          }
        };

        animate();
      }

      previousHP.current = currentHP;
    }
  }, [currentHP, isAnimating, disableHPAnimations, hero.resurrected, hero.name]);

  const getCardClasses = () => {
    let classes = 'hero-card';
    
    // Check if hero is dead (0 HP)
    const currentHP = hero.currentHP !== undefined ? hero.currentHP : (typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP);
    const isDead = currentHP <= 0;
    
    if (isDead) classes += ' dead';
    if (isSelectable) classes += ' selectable';
    if (isSelected) classes += ' selected';
    if (isFocused) classes += ' focused';
    if (isBlocked && !isDead && !isSelectable) classes += ' target-blocked';
    if (isBanned) classes += ' banned';
    if (isEnemy) classes += ' enemy';
    if (!isEnemy) classes += ' ally';
    if (isCurrentTurn && !isDead) classes += ' current-turn'; // Don't highlight dead heroes as current turn
    if (tutorialReveal) classes += ` tutorial-${tutorialReveal}`;
    if (tiny) classes += ' card-tiny';
    classes += ` hero-layout-card ${className}`;
    return classes;
  };

  // Round badge tokens, straight inside .card-status (Badges.css steers each bubble by its place there)
  const renderBadges = () => {
    if (!showFullInfo) return null;
    return shownBadges.map(badge => (
      <BadgeToken
        key={badge.key}
        badge={badge}
        open={openBadge === badge.key}
        onToggle={() => badgeTip.toggle(badge.key)}
        onHoverChange={on => badgeTip.hover(badge.key, on)}
      />
    ));
  };
  // A tap on a token only opens its text: it never reaches the card (Focus, details, choosing, the long-press reader)
  const stopTokenEvent = (event: React.SyntheticEvent) => {
    if ((event.target as Element | null)?.closest?.('.badge-token')) event.stopPropagation();
  };

  const renderCompanions = () => {
    if (!hero.companions || hero.companions.length === 0 || !showFullInfo) return null;

    return (
      <div className="companions">
        {hero.companions.map((companion, index) => (
          <span 
            key={index}
            className="companion"
            title={`${companion.type} (Active)`}
          >
            🐾
          </span>
        ))}
      </div>
    );
  };



  const getImagePath = () => {
    // Show dismounted version when Dragon Rider's special triggers
    if (hero.name === 'Dragon Rider' && isDismounted) {
      return `${config.IMAGE_BASE_URL}/hero-images/dragonriderdismounted.webp`;
    }
    return `${config.IMAGE_BASE_URL}/hero-images/${hero.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`;
  };

  const formatAccuracy = (accuracy: string) => {
    return accuracy.startsWith('+') ? accuracy : `+${accuracy}`;
  };

  // Helper function to get stat glow class based on buff/debuff status
  const getStatGlowClass = (_statName: string, isBuffed: boolean, isDebuffed: boolean) => {
    if (isBuffed) return 'stat-buffed';
    if (isDebuffed) return 'stat-debuffed';
    return '';
  };

  const renderBuffedStat = (statName: string, baseValue: string, modifiedValue?: string, passiveBuffs?: any[], showLabel = true) => {
    const isBuffed = modifiedValue && modifiedValue !== baseValue;
    const relevantBuffs = passiveBuffs?.filter(buff => 
      (statName === 'accuracy' && buff.stat === 'accuracy') ||
      (statName === 'attack' && buff.stat === 'damage')
    ) || [];

    const hasPositiveBuffs = relevantBuffs.some(buff => buff.value > 0);
    const hasNegativeBuffs = relevantBuffs.some(buff => buff.value < 0);
    const glowClass = getStatGlowClass(statName, hasPositiveBuffs, hasNegativeBuffs);

    // Heroes with damage bonuses (Hoarder's dice, Last Stand, Berserker stacks, passive buffs)
    if (statName === 'attack') {
      // No basic attack: a damage bonus has nothing to add to, so show the plain dash
      if (!/\d/.test(baseValue || '')) {
        return <span>{showLabel ? `Attack: ${baseValue}` : baseValue}</span>;
      }
      const attack = getAttackDisplay(hero);

      if (attack.hasExtras) {
        const tooltipText = [
          ...attack.sources,
          ...relevantBuffs.map(buff => `+${buff.value} from ${buff.sourceHero}'s ${buff.sourceName}`)
        ].join(', ');

        return (
          <span className={`buffed-stat ${glowClass || 'stat-buffed'}`}>
            <span className="buffed-text">
              {showLabel ? `Attack: ${attack.text}` : attack.text}
            </span>
            <span className="buff-tooltip">
              <span className="buff-tooltiptext">
                Buffed by: {tooltipText}
              </span>
            </span>
          </span>
        );
      }
    }

    if (!isBuffed) {
      const value = statName === 'accuracy' ? formatAccuracy(baseValue) : baseValue;
      return <span className={glowClass}>{showLabel ? `${statName === 'accuracy' ? 'Accuracy' : 'Attack'}: ${value}` : value}</span>;
    }

    const tooltipText = relevantBuffs.map(buff => 
      `+${buff.value} from ${buff.sourceHero}'s ${buff.sourceName}`
    ).join(', ');

    return (
      <span className={`buffed-stat ${glowClass}`}>
        <span className="buffed-text">
          {showLabel
            ? `${statName === 'accuracy' ? 'Accuracy' : 'Attack'}: ${statName === 'accuracy' ? formatAccuracy(modifiedValue) : modifiedValue}`
            : statName === 'accuracy' ? formatAccuracy(modifiedValue) : modifiedValue}
        </span>
        <span className="buff-tooltip">
          <span className="buff-tooltiptext">
            Buffed by: {tooltipText}
          </span>
        </span>
      </span>
    );
  };

  const renderEffectiveDefense = (showLabel = true) => {
    // Use modifiedDefense if available (includes scaling buffs like Champion's Last Stand)
    if ((hero as any).modifiedDefense !== undefined) {
      const modifiedDefense = (hero as any).modifiedDefense;
      const sharedDefense = (hero as any).sharedDefense;
      
      // Determine the base defense for comparison
      let baseDefenseForComparison = sharedDefense?.originalDefense || hero.Defense;
      
      // Check if defense was buffed (either modified or shared from Dual Defender)
      let hasModifications = modifiedDefense !== hero.Defense;
      let isSharedDefenseBuff = false;
      let hasDebuff = false;
      
      // Check for debuffs (like Piercing Shot)
      if (hero.statusEffects?.statModifiers?.Defense && hero.statusEffects.statModifiers.Defense < 0) {
        hasDebuff = true;
        hasModifications = true;
      }
      
      // Special handling for Dual Defender's shared defense
      if (sharedDefense && sharedDefense.sharedValue > sharedDefense.originalDefense) {
        isSharedDefenseBuff = true;
        hasModifications = true;
        // When there's shared defense, compare against the shared value (not original) for determining buff/debuff color
        baseDefenseForComparison = sharedDefense.sharedValue;
      }
      
      // Determine glow class: debuffs take priority for red glow
      let glowClass = '';
      if (hasModifications) {
        if (hasDebuff && !isSharedDefenseBuff) {
          // Pure debuff - show red
          glowClass = 'stat-debuffed';
        } else if (hasDebuff && isSharedDefenseBuff) {
          // Both shared defense buff and debuff - compare final value
          glowClass = modifiedDefense > baseDefenseForComparison ? 'stat-buffed' : 'stat-debuffed';
        } else {
          // Normal comparison
          glowClass = modifiedDefense > baseDefenseForComparison ? 'stat-buffed' : 'stat-debuffed';
        }
      }
      
      // Build tooltip text with modifier details
      let tooltipText = `Base Defense: ${sharedDefense?.originalDefense || hero.Defense}, Modified Defense: ${modifiedDefense}`;
      const tooltipParts: string[] = [];
      
      // Add shared defense info (Dual Defender)
      if (isSharedDefenseBuff) {
        tooltipParts.push(`Defense shared from ${sharedDefense.source}`);
      }
      
      // Add stat modifier details if available
      if (hero.statusEffects?.statModifiers?.Defense && hero.statusEffects?.statModifierCasters) {
        const defenseModifier = hero.statusEffects.statModifiers.Defense;
        const casterInfo = Object.entries(hero.statusEffects.statModifierCasters)
          .filter(([key]) => key.startsWith('Defense_'))
          .map(([key, caster]) => {
            const abilityName = key.includes('Piercing Shot') ? 'Piercing Shot' : 'ability';
            return `${defenseModifier} Defense from ${caster}'s ${abilityName}`;
          });
        
        if (casterInfo.length > 0) {
          tooltipParts.push(...casterInfo);
        }
      }
      
      // Add passive buffs/debuffs (like Reaper's Aura of Dread)
      const defenseBuffs = hero.passiveBuffs?.filter(buff => buff.stat === 'Defense') || [];
      defenseBuffs.forEach(buff => {
        tooltipParts.push(`${buff.value > 0 ? '+' : ''}${buff.value} Defense from ${buff.sourceHero}'s ${buff.sourceName}`);
      });
      
      if (tooltipParts.length > 0) {
        tooltipText += `\n${tooltipParts.join('\n')}`;
      }
      
      return (
        <span 
          className={`buffed-stat ${glowClass}`}
          title={tooltipText}
        >
          {showLabel ? `Defense: ${modifiedDefense}` : modifiedDefense}
        </span>
      );
    }

    let effectiveDefense = hero.Defense;
    let defenseModifier = 0;
    const tooltipParts: string[] = [];
    
    // Apply stat modifiers if they exist
    if (hero.statusEffects?.statModifiers?.Defense) {
      defenseModifier = hero.statusEffects.statModifiers.Defense;
      effectiveDefense += defenseModifier;
      
      // Try to get caster information
      if (hero.statusEffects?.statModifierCasters) {
        const casterInfo = Object.entries(hero.statusEffects.statModifierCasters)
          .filter(([key]) => key.startsWith('Defense_'))
          .map(([key, caster]) => {
            const abilityName = key.includes('Piercing') ? 'Piercing Shot' : 'ability';
            return `${defenseModifier} Defense from ${caster}'s ${abilityName}`;
          });
        
        if (casterInfo.length > 0) {
          tooltipParts.push(...casterInfo);
        } else {
          tooltipParts.push(`${defenseModifier} Defense modifier`);
        }
      } else {
        tooltipParts.push(`${defenseModifier} Defense modifier`);
      }
    }

    // Apply permanent buffs (like Dragon Rider's Dismount)
    if ((hero as any).permanentBuffs) {
      Object.values((hero as any).permanentBuffs).forEach((buffArray: any) => {
        if (Array.isArray(buffArray)) {
          buffArray.forEach((buff: any) => {
            if (buff.stat === 'Defense') {
              effectiveDefense += buff.value;
              defenseModifier += buff.value; // Track for glow effect
              tooltipParts.push(`${buff.value > 0 ? '+' : ''}${buff.value} Defense from ${buff.source || 'permanent buff'}`);
            }
          });
        }
      });
    }

    // Check for Defense buffs from passive effects
    const defenseBuffs = hero.passiveBuffs?.filter(buff => buff.stat === 'Defense') || [];
    defenseBuffs.forEach(buff => {
      tooltipParts.push(`${buff.value > 0 ? '+' : ''}${buff.value} Defense from ${buff.sourceHero}'s ${buff.sourceName}`);
    });
    
    const hasPositiveBuffs = defenseBuffs.some(buff => buff.value > 0) || defenseModifier > 0;
    const hasNegativeBuffs = defenseBuffs.some(buff => buff.value < 0) || defenseModifier < 0;
    const glowClass = getStatGlowClass('Defense', hasPositiveBuffs, hasNegativeBuffs);
    
    if (defenseModifier === 0 && defenseBuffs.length === 0) {
      return <span>{showLabel ? `Defense: ${hero.Defense}` : hero.Defense}</span>;
    }
    
    const tooltip = `Base Defense: ${hero.Defense}, Effective Defense: ${effectiveDefense}\n${tooltipParts.join('\n')}`;
    
    return (
      <span 
        className={`buffed-stat ${glowClass}`}
        title={tooltip}
      >
        {showLabel ? `Defense: ${effectiveDefense}` : effectiveDefense}
      </span>
    );
  };

  useLayoutEffect(() => {
    // A tiny card shows no rules text, so there is nothing to fit (and the fitting's forced layouts add up when
    // a binder page mounts twelve of them)
    if (tiny) return;
    const card = cardRef.current;
    const lower = lowerRef.current;
    if (!card || !lower) return;

    // The largest rules-text size at which the name-and-rules panel covers no more than its share of the card
    // and the name stays clear of the stat rail above it. With minTextPx the size never goes below that floor:
    // when nothing fits, the floor size is used and the panel grows past its share.
    const fitText = () => {
      if (card.clientHeight === 0) return;
      const range = textSizeRange({
        cardFontPx: parseFloat(getComputedStyle(card).fontSize),
        maxEm: CARD_TEXT_MAX_EM,
        minTextPx,
      });
      const limit = card.clientHeight * LOWER_PANEL_MAX;
      const rail = card.querySelector<HTMLElement>('.card-stats');
      const name = lower.querySelector<HTMLElement>('.card-hero-name');
      const railBottom = () => (rail ? rail.offsetTop + rail.offsetHeight : 0);
      const nameTop = () => lower.offsetTop + (name ? name.offsetTop : 0);
      // With a floor, a card whose name would run into the stat rail tries tighter text spacing, then smaller
      // gems (data-fit; React leaves the attribute alone). Without a floor there is one stage: today's fitting.
      const stages = textFitStages(minTextPx);
      let crowded = false;
      for (const stage of stages) {
        if (stage) card.setAttribute('data-fit', stage);
        else card.removeAttribute('data-fit');
        const bottom = railBottom();
        const size = pickTextSize(sizeEm => {
          card.style.setProperty('--card-text-size', `${sizeEm}em`);
          return lower.offsetHeight <= limit && nameTop() >= bottom;
        }, range.maxEm, range.minEm);
        card.style.setProperty('--card-text-size', `${size}em`);
        crowded = nameTop() < bottom;
        if (!crowded) break;
      }
      // Even at the floor with every stage the name runs into the rail: flag it so it can be found and measured.
      if (minTextPx) card.toggleAttribute('data-text-crowded', crowded);
    };

    fitText();
    const observer = new ResizeObserver(fitText);
    observer.observe(card);
    return () => observer.disconnect();
  }, [hero.Ability, hero.Special, hero.name, minTextPx, tiny]);

  const renderCardDetails = () => (
    <div className="card-details">
      {ruleSections(hero).map((section, index) => (
        <section
          key={`${section.label}-${index}`}
          className={`card-text-section${section.label === 'Special' ? ' card-special' : ''}`}
        >
          <h4><span className="card-type-label">{section.label}:</span> {section.name}</h4>
          <p>{section.description}</p>
        </section>
      ))}
    </div>
  );

  const still = (holo || glint || tilt) && cardMotionOff();
  const followPointer = tilt && !still;
  const faceClasses = [
    holo ? 'card-holo' : '',
    followPointer ? 'card-tilt' : '',
    still ? 'card-still' : ''
  ].filter(Boolean).join(' ');

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.classList.add('card-hovering');
    card.style.setProperty('--card-ry', `${(x - 0.5) * 24}deg`);
    card.style.setProperty('--card-rx', `${(0.5 - y) * 24}deg`);
    card.style.setProperty('--card-mx', `${x * 100}%`);
    card.style.setProperty('--card-my', `${y * 100}%`);
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = event.currentTarget;
    card.classList.remove('card-hovering');
    ['--card-rx', '--card-ry', '--card-mx', '--card-my'].forEach(name => card.style.removeProperty(name));
  };

  // A fallen hero can still be read, but never chosen.
  const isDead = currentHP <= 0;
  const canChoose = isSelectable && !isDead;
  // A card that can be inspected never opens the reader; the battle's details panel replaces it.
  const readMode = onInspect ? 'none' : resolveReadMode({ readable, isSelectable: canChoose });
  const handleClick = (event: React.MouseEvent) => {
    if (canChoose) onClick?.();
    if (onInspect) {
      if (canChoose) return;
      event.stopPropagation();
      onInspect();
      return;
    }
    if (readMode !== 'tap') return;
    // The tap is spent on reading; a wrapper that closes on click (the pack opening) must not also react.
    event.stopPropagation();
    openReader();
  };
  const handlePointerMoveAll = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readMode === 'press') pressHandlers.onPointerMove(event);
    if (followPointer) handlePointerMove(event);
  };

  return (
    <div
      ref={cardRef}
      className={`${getCardClasses()}${faceClasses ? ` ${faceClasses}` : ''}`}
      data-anim-key={animKey}
      data-hero-name={animKey ? hero.name : undefined}
      data-read-mode={readMode}
      data-min-text-px={minTextPx}
      data-focused={isFocused ? 'true' : undefined}
      onClick={canChoose || readMode === 'tap' || onInspect ? handleClick : undefined}
      onPointerDown={readMode === 'press' ? pressHandlers.onPointerDown : undefined}
      onPointerMove={readMode === 'press' || followPointer ? handlePointerMoveAll : undefined}
      onPointerUp={readMode === 'press' ? pressHandlers.onPointerUp : undefined}
      onPointerCancel={readMode === 'press' ? pressHandlers.onPointerCancel : undefined}
      onClickCapture={readMode === 'press' ? pressHandlers.onClickCapture : undefined}
      onContextMenu={readMode !== 'none' ? pressHandlers.onContextMenu : undefined}
      onPointerLeave={followPointer ? handlePointerLeave : undefined}
      style={{ cursor: canChoose || onInspect ? 'pointer' : readMode === 'tap' ? 'zoom-in' : undefined }}
    >
      <img
        src={getImagePath()}
        decoding="async"
        loading="lazy"
        alt={hero.name}
        className={`card-art ${isFlipping ? 'card-flip' : ''}`}
        onError={(e) => {
          // Fallback to a placeholder if image doesn't exist
          (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        }}
      />
      <div className="card-edge" aria-hidden="true" />

      <div className="card-stats">
        <div className="card-gem card-gem-hp" data-tutorial="hp" role="group" aria-label="Health">
          {STAT_ICONS.hp}
          <b className="card-gem-value">
            <span style={{ color: hpColor || 'inherit' }}>
              {animatedHP !== null ? `${animatedHP}/${maxHP}` : `${currentHP}/${maxHP}`}
            </span>
          </b>
        </div>
        <div className="card-gem card-gem-defense" data-tutorial="defense" role="group" aria-label="Defense">
          {STAT_ICONS.defense}
          <b className="card-gem-value">{renderEffectiveDefense(false)}</b>
        </div>
        <div className="card-gem card-gem-accuracy" data-tutorial="accuracy" role="group" aria-label="Accuracy">
          {STAT_ICONS.accuracy}
          <b className="card-gem-value">{renderBuffedStat('accuracy', hero.Accuracy, hero.modifiedAccuracy, hero.passiveBuffs, false)}</b>
        </div>
        <div className="card-gem card-gem-attack" data-tutorial="attack" role="group" aria-label="Attack">
          {STAT_ICONS.attack}
          <b className="card-gem-value">{renderBuffedStat('attack', hero.BasicAttack, hero.modifiedBasicAttack, hero.passiveBuffs, false)}</b>
        </div>
      </div>

      <div className="card-lower" ref={lowerRef}>
        {renderCompanions()}
        <h3 className="card-hero-name">{hero.name}</h3>
        <div className="card-rule" aria-hidden="true" />
        {renderCardDetails()}
      </div>

      {glint && !still && <div className="card-glint" aria-hidden="true" />}
      {holo && (
        <>
          <div className="card-sheen" aria-hidden="true" />
          <div className="card-spark" aria-hidden="true" />
        </>
      )}
      {favorite && (
        <div className="card-fav-star" role="img" aria-label="Favourite">
          <svg viewBox="0 0 24 24" fill="currentColor" strokeWidth="1" aria-hidden="true">
            <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" />
          </svg>
        </div>
      )}
      {/* Battle Focus: the pulsing red halo round the focused card (the ring itself is CSS on .focused) */}
      {isFocused && (
        <div className={`card-focus-halo${cardMotionOff() ? ' card-focus-halo--still' : ''}`} aria-hidden="true" />
      )}
      <div className="card-status" onClick={stopTokenEvent} onPointerDown={stopTokenEvent} onPointerUp={stopTokenEvent} onContextMenu={stopTokenEvent}>
        {renderBadges()}
      </div>
      {children}
    </div>
  );
};

export default HeroCard;
