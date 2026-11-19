import { describe, expect, it } from 'vitest';
import { SearchCancels } from './searchCancels';

describe('SearchCancels', () => {
  it('applies the reply to a plain cancel', () => {
    const c = new SearchCancels();
    c.searchStarted();
    c.cancelSent();
    expect(c.replyApplies()).toBe(true);
  });

  it('ignores the reply to a cancel sent before the current search began (mode switch)', () => {
    const c = new SearchCancels();
    c.searchStarted(); // Random
    c.cancelSent(); // click Draft: cancel Random...
    c.searchStarted(); // ...and join Draft
    expect(c.replyApplies()).toBe(false);
    // A later cancel of the Draft search still clears it
    c.cancelSent();
    expect(c.replyApplies()).toBe(true);
  });

  it('handles several quick switches', () => {
    const c = new SearchCancels();
    c.searchStarted();
    c.cancelSent();
    c.searchStarted();
    c.cancelSent();
    c.searchStarted();
    expect(c.replyApplies()).toBe(false);
    expect(c.replyApplies()).toBe(false);
  });

  it('applies a reply the server sent by itself', () => {
    const c = new SearchCancels();
    c.searchStarted();
    expect(c.replyApplies()).toBe(true);
  });

  it('applies the reply when the cancel was followed by Survival or Gauntlet (no new Random/Draft search)', () => {
    const c = new SearchCancels();
    c.searchStarted();
    c.cancelSent();
    expect(c.replyApplies()).toBe(true);
  });

  it('forgets unanswered cancels on reset', () => {
    const c = new SearchCancels();
    c.searchStarted();
    c.cancelSent();
    c.searchStarted();
    c.reset();
    expect(c.replyApplies()).toBe(true);
  });

  it('after a reconnect, a server-pushed reply during a later search still applies', () => {
    const c = new SearchCancels();
    c.searchStarted();
    c.cancelSent(); // sent while the connection was down: never answered
    c.reset(); // reconnect
    c.searchStarted(); // a later search
    expect(c.replyApplies()).toBe(true); // e.g. accepting a friend's challenge
  });
});
