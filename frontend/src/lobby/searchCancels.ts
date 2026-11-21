// Matches each 'search-cancelled' reply to the cancel that asked for it, so a reply that arrives after
// a new Random/Draft search has started (switching mode while searching sends cancel, then join) is
// not taken as cancelling the new search. The server answers every 'cancel-search' with exactly one
// 'search-cancelled', in order; it can also send one by itself (accepting a friend's challenge).
export class SearchCancels {
  private searchSeq = 0;
  // The search number current when each unanswered cancel was sent, oldest first
  private pending: number[] = [];

  searchStarted() {
    this.searchSeq++;
  }

  cancelSent() {
    this.pending.push(this.searchSeq);
  }

  // Call on every 'search-cancelled'. True when it should clear the search on screen: it answers a
  // cancel of the current search, or the server sent it by itself. False when a newer search has
  // started since the cancel it answers.
  replyApplies(): boolean {
    if (this.pending.length === 0) return true;
    const sentDuring = this.pending.shift() as number;
    return sentDuring === this.searchSeq;
  }

  // A new socket (sign-in, or one replacing a closed socket) or a reconnect has no replies on the way
  reset() {
    this.pending = [];
  }
}
