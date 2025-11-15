# Spectator Mode Testing Guide

## Testing Checklist

### Setup
- [x] Backend server running on port 3001
- [x] Frontend server running on port 5173
- [ ] At least 3 test accounts created (Player1, Player2, Spectator1)

---

## Test 1: Entry Point - Friends List Spectate Button

### Prerequisites
- Player1 and Player2 are friends
- Player1 and Player2 are in an active game (past draft phase)
- Spectator1 is logged in and has Player1 or Player2 as friend

### Test Steps
1. [ ] Open Friends overlay as Spectator1
2. [ ] Verify "Watch Game" button is visible for Player1 (who is in-game)
3. [ ] Verify "Watch Game" button shows disabled state if player is NOT in game
4. [ ] Click "Watch Game" button for Player1
5. [ ] Verify spectator joins the game successfully
6. [ ] Verify spectator sees the battle from Player1's perspective

### Expected Results
- "Watch Game" button only enabled for friends in active games
- Spectator can successfully join and view the game
- UI shows "Watching [Player1's Name]" indicator

---

## Test 2: Entry Point - Game Browser (SpectatorView)

### Prerequisites
- At least one game in progress (past draft phase)
- Spectator1 is logged in

### Test Steps
1. [ ] Navigate to Friendly Battle section in Game Lobby
2. [ ] Click "Spectate Games" option
3. [ ] Verify SpectatorView component displays
4. [ ] Verify list shows all spectatable games with:
   - Room name (or "Player1 vs Player2")
   - Game mode (Draft/Random)
   - Current phase
   - Spectator count (X/20)
5. [ ] Test search by room name filter
6. [ ] Test search by player name filter
7. [ ] Select a game to spectate
8. [ ] Choose which player's perspective to view
9. [ ] Click spectate button
10. [ ] Verify spectator joins successfully

### Expected Results
- All active games (past draft phase) are listed
- Search filters work correctly
- Spectator can choose perspective before joining
- Successfully joins selected game

---

## Test 3: Spectator Perspective and UI

### Prerequisites
- Spectator1 is spectating Player1 in an active game

### Test Steps
1. [ ] Verify BattlePhase displays from Player1's perspective
2. [ ] Verify action bar shows:
   - "You are spectating [Player1's Name]" text
   - "Stop Spectating" button only
   - NO attack/ability/pass turn buttons
3. [ ] Verify surrender button is hidden for spectators
4. [ ] Verify battle log is visible and updating
5. [ ] Verify all hero cards are visible but non-interactive
6. [ ] Try clicking on enemy heroes - verify no targeting occurs
7. [ ] Try clicking on ability buttons - verify they don't activate
8. [ ] Verify spectator count indicator is NOT visible to spectators

### Expected Results
- Spectator sees battle from chosen player's perspective
- No interaction buttons except "Stop Spectating"
- Cannot target, attack, or use abilities
- Battle log updates in real-time

---

## Test 4: Spectator Count Indicator (Player View)

### Prerequisites
- Player1 is in an active game
- At least 1 spectator is watching

### Test Steps (as Player1)
1. [ ] Verify eye icon (👁️) appears at bottom right
2. [ ] Verify spectator count displays (e.g., "3")
3. [ ] Click the eye icon
4. [ ] Verify spectator list modal appears
5. [ ] Verify modal shows:
   - "Spectators (X)" header
   - List of spectator usernames
   - User icons next to each name
6. [ ] Add a new spectator to the game
7. [ ] Verify count updates in real-time
8. [ ] Verify new spectator appears in list
9. [ ] Remove a spectator (have them stop spectating)
10. [ ] Verify count decreases
11. [ ] Verify spectator removed from list

### Expected Results
- Eye icon visible only to players, not spectators
- Count updates in real-time
- List shows all current spectators
- Smooth animations when spectators join/leave

---

## Test 5: 20 Spectator Limit

### Prerequisites
- One active game
- Ability to create/control 20+ test accounts

### Test Steps
1. [ ] Have 20 spectators join the game
2. [ ] Verify all 20 can successfully spectate
3. [ ] Try to add a 21st spectator
4. [ ] Verify error message: "This game has reached the maximum number of spectators (20)"
5. [ ] Have one spectator leave
6. [ ] Verify new spectator can now join

### Expected Results
- Maximum 20 spectators enforced
- Clear error message when limit reached
- Slot opens when spectator leaves

---

## Test 6: Stop Spectating

### Prerequisites
- Spectator1 is spectating a game

### Test Steps
1. [ ] Click "Stop Spectating" button in action bar
2. [ ] Verify spectator returns to Game Lobby
3. [ ] Verify game state is cleared
4. [ ] Verify can immediately spectate another game
5. [ ] Check backend - verify spectator removed from game's spectator list
6. [ ] Check players in game - verify spectator count decreased

### Expected Results
- Spectator cleanly exits to lobby
- Can immediately join another game
- Backend properly cleans up spectator data

---

## Test 7: Game Over Handling (Spectator View)

### Prerequisites
- Spectator1 is watching an active game

### Test Steps
1. [ ] Wait for game to end naturally (or have player surrender)
2. [ ] Verify spectator sees game over overlay with:
   - "[Winner's Name] Wins!" message
   - "Return to Lobby" button
   - NO rematch option
3. [ ] Click "Return to Lobby"
4. [ ] Verify spectator returns to Game Lobby
5. [ ] Verify spectator can join new games

### Expected Results
- Spectator sees appropriate game over message
- No rematch option for spectators
- Clean return to lobby

---

## Test 8: Player Disconnection While Being Spectated

### Prerequisites
- Spectator1 is watching Player1
- Player1 and Player2 are in active battle

### Test Steps
1. [ ] Have Player1 disconnect (close browser/tab)
2. [ ] Verify spectator receives alert: "[Player1's Name] has disconnected from the game."
3. [ ] Verify spectator is automatically returned to lobby
4. [ ] Verify game state is cleaned up
5. [ ] Check backend logs for disconnection handling
6. [ ] Verify spectator can join new games after disconnection

### Expected Results
- Spectator notified of player disconnection
- Auto-return to lobby
- Clean state cleanup

---

## Test 9: Spectator Disconnection

### Prerequisites
- Spectator1 is watching a game
- Player1 and Player2 can see spectator count

### Test Steps
1. [ ] Note current spectator count as Player1
2. [ ] Have Spectator1 disconnect (close browser)
3. [ ] Verify spectator count decreases for Player1
4. [ ] Verify spectator removed from spectator list
5. [ ] Check backend logs for cleanup
6. [ ] Verify game continues normally for Player1 and Player2

### Expected Results
- Spectator cleanly removed on disconnect
- Game continues unaffected
- Count and list update correctly

---

## Test 10: Multiple Spectators Different Perspectives

### Prerequisites
- One active game with Player1 vs Player2
- Spectator1, Spectator2, Spectator3 available

### Test Steps
1. [ ] Have Spectator1 join watching Player1's perspective
2. [ ] Have Spectator2 join watching Player2's perspective
3. [ ] Have Spectator3 join watching Player1's perspective
4. [ ] Verify all spectators see correct perspective
5. [ ] Wait for Player1's turn
6. [ ] Verify Spectator1 and Spectator3 see "Your Turn" indicators
7. [ ] Verify Spectator2 sees "Opponent's Turn" indicators
8. [ ] Wait for Player2's turn
9. [ ] Verify perspectives flip appropriately
10. [ ] Have players check spectator list - verify all 3 listed

### Expected Results
- Multiple spectators can watch same game
- Each spectator sees their chosen perspective
- Perspectives work independently and correctly

---

## Test 11: Draft Phase Restriction

### Prerequisites
- Game in draft phase (NOT yet in battle)
- Spectator1 attempting to join

### Test Steps
1. [ ] Try to spectate game in "waiting" phase
2. [ ] Verify error: Cannot spectate games in draft phase
3. [ ] Try to spectate game in "draft" phase
4. [ ] Verify error message
5. [ ] Wait for game to complete draft and enter battle
6. [ ] Try to spectate again
7. [ ] Verify spectator can now join

### Expected Results
- Cannot spectate during draft/waiting phases
- Clear error message
- Can spectate once battle starts

---

## Test 12: Real-time Battle Updates

### Prerequisites
- Spectator1 watching an active battle

### Test Steps
1. [ ] Watch Player1 attack
2. [ ] Verify spectator sees:
   - Attack animation/result
   - Battle log entry
   - HP/Status updates
3. [ ] Watch Player2 use ability
4. [ ] Verify spectator sees ability effects
5. [ ] Watch hero die
6. [ ] Verify spectator sees death/next hero switch
7. [ ] Compare spectator view timing with actual player view
8. [ ] Verify minimal lag (should be near real-time)

### Expected Results
- All battle events visible to spectator
- Real-time or near-real-time updates
- Battle log synced correctly

---

## Test 13: UI Responsiveness and Polish

### Test Steps
1. [ ] Test spectator UI on different screen sizes
2. [ ] Verify spectator count button doesn't overlap surrender button
3. [ ] Verify spectator list modal scrolls if many spectators
4. [ ] Test clicking outside modal to close it
5. [ ] Verify hover effects on spectate buttons
6. [ ] Check for any console errors during spectating
7. [ ] Verify smooth transitions when joining/leaving

### Expected Results
- Clean, responsive UI
- No layout issues
- No console errors
- Smooth user experience

---

## Test 14: Edge Cases

### Test Steps
1. [ ] Try to spectate non-existent game ID
   - [ ] Verify appropriate error handling
2. [ ] Try to spectate after game just ended
   - [ ] Verify handles gracefully
3. [ ] Have spectator refresh page while spectating
   - [ ] Verify state resets appropriately
4. [ ] Try to spectate while already spectating
   - [ ] Verify switches games correctly
5. [ ] Have both players disconnect while spectators watching
   - [ ] Verify all spectators returned to lobby

### Expected Results
- All edge cases handled gracefully
- Clear error messages
- No crashes or stuck states

---

## Success Criteria

✅ All 14 test scenarios pass
✅ No console errors during normal operation
✅ Smooth user experience for both players and spectators
✅ Real-time updates working correctly
✅ All interaction restrictions enforced
✅ Clean state management and cleanup

---

## Known Issues / Notes

_(Document any issues found during testing)_

---

## Testing Completed By

- Date: ___________
- Tester: ___________
- Build/Commit: ___________
