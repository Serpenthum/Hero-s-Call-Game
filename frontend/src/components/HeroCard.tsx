import React, { useState, useEffect, useRef } from 'react';
import { Hero } from '../types';

interface HeroCardProps {
  hero: Hero;
  isSelectable?: boolean;
  isSelected?: boolean;
  isBanned?: boolean;
  isEnemy?: boolean;
  isCurrentTurn?: boolean;
  onClick?: () => void;
  showFullInfo?: boolean;
  disableHPAnimations?: boolean;
}

const KEYWORD_TOOLTIPS: { [key: string]: string } = {
  poison: "A hero who is poisoned takes damage equal to their poison stacks at the end of each turn.",
  taunt: "Forces an enemy hero to attack the hero who taunted it instead of their intended target.",
  inspiration: "When rolling an attack or ability, can give it advantage by expending the inspiration.",
  silence: "Cannot use abilities while silenced.",
  disable_attack: "Cannot make basic attacks while stunned.",
  untargetable: "Cannot be targeted by attacks or abilities.",
  advantage: "Roll twice and take the higher result."
};

const HeroCard: React.FC<HeroCardProps> = ({
  hero,
  isSelectable = false,
  isSelected = false,
  isBanned = false,
  isEnemy = false,
  isCurrentTurn = false,
  onClick,
  showFullInfo = true,
  disableHPAnimations = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [animatedHP, setAnimatedHP] = useState<number | null>(null);
  const [hpColor, setHpColor] = useState<string>('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isDismounted, setIsDismounted] = useState(false);
  const previousHP = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const wasDismountedRef = useRef(false);

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
  }, [currentHP, isAnimating, disableHPAnimations]);

  const getCardClasses = () => {
    let classes = 'hero-card';
    
    // Check if hero is dead (0 HP)
    const currentHP = hero.currentHP !== undefined ? hero.currentHP : (typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP);
    const isDead = currentHP <= 0;
    
    if (isDead) classes += ' dead';
    if (isSelectable) classes += ' selectable';
    if (isSelected) classes += ' selected';
    if (isBanned) classes += ' banned';
    if (isEnemy) classes += ' enemy';
    if (!isEnemy) classes += ' ally';
    if (isCurrentTurn && !isDead) classes += ' current-turn'; // Don't highlight dead heroes as current turn
    if (isHovered && showFullInfo) classes += ' hovered';
    return classes;
  };

  const renderKeywordWithTooltip = (text: string) => {
    const words = text.split(' ');
    return words.map((word, index) => {
      const cleanWord = word.replace(/[.,;:!?]/g, '').toLowerCase();
      const tooltip = KEYWORD_TOOLTIPS[cleanWord];
      
      if (tooltip) {
        return (
          <span key={index} className={`keyword ${cleanWord}`}>
            <span className="tooltip">
              {word}
              <span className="tooltiptext">{tooltip}</span>
            </span>
          </span>
        );
      }
      return <span key={index}>{word}</span>;
    }).reduce((prev: React.ReactNode[], curr, index) => {
      if (index > 0) prev.push(' ');
      prev.push(curr);
      return prev;
    }, []);
  };

  const renderStatusEffects = () => {
    if (!hero.statusEffects || !showFullInfo) return null;

    const buffs = [];
    const debuffs = [];

    // Buffs (positive effects - top left)
    if (hero.statusEffects.beast_active) {
      buffs.push(
        <span
          key="beast-active"
          className="status-effect beast-active"
          title="Beast Active: Beast Tamer's pet is summoned and can attack."
        >
          🐾
        </span>
      );
    }
    
    if (hero.statusEffects.totem_count && hero.statusEffects.totem_count > 0) {
      buffs.push(
        <span
          key="totem-count"
          className="status-effect totem-count"
          title={`Totems: ${hero.statusEffects.totem_count}/3 active - next ability deals ${hero.statusEffects.totem_count}D4 damage`}
        >
          🗿 {hero.statusEffects.totem_count}
        </span>
      );
    }
    
    if (hero.statusEffects.inspiration > 0) {
      buffs.push(
        <span 
          key="inspiration" 
          className="status-effect inspiration"
          title={`Inspired: +${hero.statusEffects.inspiration} to damage on next attack`}
        >
          ✨ {hero.statusEffects.inspiration}
        </span>
      );
    }
    
    if (hero.statusEffects.damageStacks && hero.statusEffects.damageStacks > 0) {
      buffs.push(
        <span 
          key="damage-stacks"
          className="status-effect damage-stacks"
          title={`Damage Stacks: +${hero.statusEffects.damageStacks} damage to all attacks`}
        >
          ⚔️ {hero.statusEffects.damageStacks}
        </span>
      );
    }
    
    if (hero.statusEffects.untargetable) {
      buffs.push(
        <span 
          key="untargetable" 
          className="status-effect untargetable"
          title="Untargetable: Cannot be targeted by attacks or abilities"
        >
          👻
        </span>
      );
    }
    
    if (hero.statusEffects.arcaneShieldAvailable) {
      buffs.push(
        <span 
          key="arcane-shield" 
          className="status-effect arcane-shield"
          title="Arcane Shield: Will negate the first damage instance greater than 6"
        >
          🛡️
        </span>
      );
    }

    // Debuffs (negative effects - top right)
    if (hero.statusEffects.poison > 0) {
      debuffs.push(
        <span 
          key="poison" 
          className="status-effect poison"
          title={`Poisoned: Takes ${hero.statusEffects.poison} damage at turn end`}
        >
          ☠ {hero.statusEffects.poison}
        </span>
      );
    }
    
    if (hero.statusEffects.taunt) {
      const tauntTarget = hero.statusEffects.taunt.target || 'unknown';
      debuffs.push(
        <span 
          key="taunt" 
          className="status-effect taunt"
          title={`Taunted by ${tauntTarget}: Must target ${tauntTarget} on next attack`}
        >
          🎯
        </span>
      );
    }
    
    // Handle both boolean and object formats for silenced
    const isSilenced = hero.statusEffects.silenced === true || 
                      (typeof hero.statusEffects.silenced === 'object' && hero.statusEffects.silenced?.active);
    
    if (isSilenced) {
      const duration = typeof hero.statusEffects.silenced === 'object' ? 
                      hero.statusEffects.silenced.duration : '';
      const isFirstPickSilence = typeof hero.statusEffects.silenced === 'object' && 
                                hero.statusEffects.silenced.source === "First Pick Disadvantage";
      
      const tooltipText = isFirstPickSilence 
        ? "First Pick Silence - Your ability is disabled this turn" 
        : `Silenced: Cannot use abilities${duration ? ` (${duration} turns left)` : ''}`;
      
      debuffs.push(
        <span 
          key="silenced" 
          className="status-effect silenced"
          title={tooltipText}
        >
          🔇
        </span>
      );
    }
    
    // Handle disable_attack status effect
    if (hero.statusEffects.disableAttack) {
      const duration = typeof hero.statusEffects.disableAttack === 'object' ? 
                      hero.statusEffects.disableAttack.duration : '';
      debuffs.push(
        <span 
          key="disable-attack" 
          className="status-effect disable-attack"
          title={`Attack Disabled: Cannot make basic attacks${duration ? ` (${duration} turns left)` : ''}`}
        >
          ⚔️❌
        </span>
      );
    }
    
    if (hero.statusEffects.grantAdvantage) {
      const source = hero.statusEffects.grantAdvantage.source || 'unknown';
      debuffs.push(
        <span 
          key="grant-advantage" 
          className="status-effect grant-advantage"
          title={`Marked by ${source}: Next attack against this hero has advantage`}
        >
          🎯⬆️
        </span>
      );
    }
    
    if (hero.statusEffects.rideDownDebuff) {
      const source = hero.statusEffects.rideDownDebuff.source || 'Cavalier';
      debuffs.push(
        <span 
          key="ride-down-debuff"
          className="status-effect ride-down-debuff debuff"
          title={`Ride Down: All attacks against this hero have advantage (applied by ${source})`}
        >
          🏇⬇️
        </span>
      );
    }

    // Show stat modifiers (positive go to buffs, negative go to debuffs)
    if (hero.statusEffects.statModifiers) {
      Object.entries(hero.statusEffects.statModifiers).forEach(([stat, modifier]) => {
        if (modifier !== 0) {
          const modifierText = modifier > 0 ? `+${modifier}` : `${modifier}`;
          const statSymbol = stat === 'Defense' ? '🛡️' : '📊';
          
          // Try to find the source information
          let tooltipText = `${stat} ${modifierText}`;
          if (hero.statusEffects && (hero.statusEffects.statModifierCasters || hero.statusEffects.statModifierAbilities)) {
            // Look for matching modifier key
            const possibleKeys = Object.keys(hero.statusEffects.statModifierCasters || {})
              .filter(key => key.startsWith(`${stat}_`));
              
            if (possibleKeys.length > 0) {
              const modifierKey = possibleKeys[0]; // Use first matching key
              const abilityName = hero.statusEffects.statModifierAbilities?.[modifierKey];
              const casterName = hero.statusEffects.statModifierCasters?.[modifierKey];
              
              if (abilityName) {
                tooltipText = `${abilityName}: ${stat} ${modifierText}`;
              } else if (casterName) {
                tooltipText = `${casterName}: ${stat} ${modifierText}`;
              }
            }
          }
          
          const statusElement = (
            <span 
              key={`stat-modifier-${stat}`}
              className={`status-effect stat-modifier ${modifier < 0 ? 'debuff' : 'buff'}`}
              title={tooltipText}
            >
              {statSymbol} {modifierText}
            </span>
          );
          
          if (modifier > 0) {
            buffs.push(statusElement);
          } else {
            debuffs.push(statusElement);
          }
        }
      });
    }

    return (
      <>
        {buffs.length > 0 && (
          <div className="status-effects-buffs">
            {buffs}
          </div>
        )}
        {debuffs.length > 0 && (
          <div className="status-effects-debuffs">
            {debuffs}
          </div>
        )}
      </>
    );
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
      return `http://localhost:3001/hero-images/Dragon Rider (Dismounted).png`;
    }
    return `http://localhost:3001/hero-images/${hero.name}.png`;
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

  const renderBuffedStat = (statName: string, baseValue: string, modifiedValue?: string, passiveBuffs?: any[]) => {
    const isBuffed = modifiedValue && modifiedValue !== baseValue;
    const relevantBuffs = passiveBuffs?.filter(buff => 
      (statName === 'accuracy' && buff.stat === 'accuracy') ||
      (statName === 'attack' && buff.stat === 'damage')
    ) || [];

    const hasPositiveBuffs = relevantBuffs.some(buff => buff.value > 0);
    const hasNegativeBuffs = relevantBuffs.some(buff => buff.value < 0);
    const glowClass = getStatGlowClass(statName, hasPositiveBuffs, hasNegativeBuffs);

    // Special handling for heroes with damage bonuses (both status effects and passive buffs)
    if (statName === 'attack') {
      let stackDisplay = baseValue;
      let hasExtraDisplay = false;
      
      // Add Berserker damage stacks (from status effects)
      if (hero.statusEffects?.damageStacks && hero.statusEffects.damageStacks > 0) {
        stackDisplay += ` + ${hero.statusEffects.damageStacks}`;
        hasExtraDisplay = true;
      }
      
      // Add passive damage buffs (like Warlock Dark Pact)
      if (relevantBuffs.length > 0) {
        const totalPassiveDamage = relevantBuffs.reduce((sum, buff) => sum + buff.value, 0);
        if (totalPassiveDamage > 0) {
          stackDisplay += ` + ${totalPassiveDamage}`;
          hasExtraDisplay = true;
        }
      }
      
      if (hasExtraDisplay) {
        const tooltipText = relevantBuffs.map(buff => 
          `+${buff.value} from ${buff.sourceHero}'s ${buff.sourceName}`
        ).join(', ');

        return (
          <span className={`buffed-stat ${glowClass}`}>
            <span className="buffed-text">
              Attack: {stackDisplay}
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
      return <span className={glowClass}>{statName === 'accuracy' ? `Accuracy: ${formatAccuracy(baseValue)}` : `Attack: ${baseValue}`}</span>;
    }

    const tooltipText = relevantBuffs.map(buff => 
      `+${buff.value} from ${buff.sourceHero}'s ${buff.sourceName}`
    ).join(', ');

    return (
      <span className={`buffed-stat ${glowClass}`}>
        <span className="buffed-text">
          {statName === 'accuracy' ? `Accuracy: ${formatAccuracy(modifiedValue)}` : `Attack: ${modifiedValue}`}
        </span>
        <span className="buff-tooltip">
          <span className="buff-tooltiptext">
            Buffed by: {tooltipText}
          </span>
        </span>
      </span>
    );
  };

  const renderEffectiveDefense = () => {
    // Use modifiedDefense if available (includes scaling buffs like Champion's Last Stand)
    if ((hero as any).modifiedDefense !== undefined) {
      const modifiedDefense = (hero as any).modifiedDefense;
      const hasModifications = modifiedDefense !== hero.Defense;
      const glowClass = hasModifications ? (modifiedDefense > hero.Defense ? 'stat-buffed' : 'stat-debuffed') : '';
      
      // Build tooltip text with modifier details
      let tooltipText = `Base Defense: ${hero.Defense}, Modified Defense: ${modifiedDefense}`;
      
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
          tooltipText += `\n${casterInfo.join(', ')}`;
        }
      }
      
      return (
        <span 
          className={`buffed-stat ${glowClass}`}
          title={tooltipText}
        >
          Defense: {modifiedDefense}
        </span>
      );
    }

    let effectiveDefense = hero.Defense;
    let defenseModifier = 0;
    let tooltipParts: string[] = [];
    
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
      return <span>Defense: {hero.Defense}</span>;
    }
    
    const tooltip = `Base Defense: ${hero.Defense}, Effective Defense: ${effectiveDefense}\n${tooltipParts.join('\n')}`;
    
    return (
      <span 
        className={`buffed-stat ${glowClass}`}
        title={tooltip}
      >
        Defense: {effectiveDefense}
      </span>
    );
  };

  return (
    <div
      className={getCardClasses()}
      onClick={isSelectable ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderStatusEffects()}
      {renderCompanions()}
      
      <img 
        src={getImagePath()} 
        alt={hero.name} 
        className={`hero-image ${isFlipping ? 'card-flip' : ''}`}
        onError={(e) => {
          // Fallback to a placeholder if image doesn't exist
          (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        }}
      />
      
      <div className="hero-card-content">
        <div className="hero-stats">
          <div className="hero-name">{hero.name}</div>
          <div className="hero-stats-row">
            <span className="stat-icon">❤️</span>
            <span style={{ color: hpColor || 'inherit' }}>
              HP: {animatedHP !== null ? `${animatedHP}/${maxHP}` : (hero.currentHP !== undefined ? `${hero.currentHP}/${hero.HP}` : hero.HP)}
            </span>
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">🛡️</span>
            {renderEffectiveDefense()}
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">🎯</span>
            {renderBuffedStat('accuracy', hero.Accuracy, hero.modifiedAccuracy, hero.passiveBuffs)}
          </div>
          <div className="hero-stats-row">
            <span className="stat-icon">⚔️</span>
            {renderBuffedStat('attack', hero.BasicAttack, hero.modifiedBasicAttack, hero.passiveBuffs)}
          </div>
        </div>
      </div>

      {showFullInfo && isHovered && (
        <div className="hero-tooltip">
          <div className="tooltip-section">
            <h4>Abilities</h4>
            {hero.Ability.map((ability, index) => (
              <div key={index} className="tooltip-ability">
                <div className="tooltip-ability-name">{ability.name}</div>
                <div className="tooltip-ability-description">{renderKeywordWithTooltip(ability.description)}</div>
              </div>
            ))}
          </div>
          
          {hero.Special && (
            <div className="tooltip-section">
              <h4>Special</h4>
              {Array.isArray(hero.Special) ? (
                hero.Special.map((special, index) => (
                  <div key={index} className="tooltip-special">
                    <div className="tooltip-special-name">{special.name}</div>
                    <div className="tooltip-special-description">{renderKeywordWithTooltip(special.description)}</div>
                  </div>
                ))
              ) : (
                <div className="tooltip-special">
                  <div className="tooltip-special-name">{(hero.Special as any).name || "Special Ability"}</div>
                  <div className="tooltip-special-description">{renderKeywordWithTooltip((hero.Special as any).description || "Special ability details not available")}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HeroCard;