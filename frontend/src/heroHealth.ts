// A hero's current hit points: currentHP once the battle has set it (0 included), else the card's HP.
// Do not write `currentHP || HP`: a dead hero's 0 would fall through to its full HP.
export function heroCurrentHP(hero: { currentHP?: number; HP: number | string }): number {
  if (hero.currentHP !== undefined && hero.currentHP !== null) return hero.currentHP;
  return typeof hero.HP === 'string' ? parseInt(hero.HP, 10) : hero.HP;
}

export function isHeroAlive(hero: { currentHP?: number; HP: number | string } | null | undefined): boolean {
  return !!hero && heroCurrentHP(hero) > 0;
}
