// A page refresh (or the reload after a deploy) must not skip the tutorial. The saved session's
// tutorial_completed is kept in step by App when the tutorial battle ends or is skipped, the same moments
// the server marks it done.

export type TutorialStage = 'battle' | 'lobby' | null;

// The stage a restored session starts in: back into the tutorial battle if the account has not done it.
// The tutorial is not a held seat on the server (a disconnect ends it), so a fresh join-tutorial is right.
export function tutorialStageOnRestore(user: { tutorial_completed?: boolean } | null): TutorialStage {
  return user && user.tutorial_completed === false ? 'battle' : null;
}

// The tutorial battle has a winner: the server has marked the tutorial done (handleTutorialCompletion)
export function tutorialBattleFinished(
  stage: TutorialStage,
  gameState: { mode?: string; winner: string | null } | null,
): boolean {
  return stage === 'battle' && !!gameState && gameState.mode === 'tutorial' && !!gameState.winner;
}
