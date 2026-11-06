# Hero's Call - Multiplayer Card Game

A real-time multiplayer drafting and battle card game, hosted free on Cloudflare.

- Website: https://heroscall.pages.dev
- Game server: https://heroscall-server.heros-call-backend.workers.dev

## Hosting

The server runs as a Cloudflare Worker and the website on Cloudflare Pages (free plan).

```bash
npm run deploy:server   # deploy the game server
npm run deploy:site     # build and deploy the website
```

Admin login: the Quick admin login button and the Admin1, Admin2 and Admin3 accounts still exist. Run
`npx wrangler secret put ADMIN_PASSWORD` in the `backend` folder to set their password.

See [docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md) for details, free-plan limits and what a deploy does.

## How to Run Locally

Run `npm run install:all` once in the project folder. Then open two terminals:

1. Terminal 1, the server:
   ```
   cd backend
   npx wrangler dev
   ```
2. Terminal 2, the website (http://localhost:5173):
   ```
   cd frontend
   npm run dev
   ```

## How to Play

### Setup
1. Two players join the game by entering their names
2. Once both players are connected, the draft phase begins

### Draft Phase
1. **Ban Phase**: Each player receives 5 random heroes and bans 1 card
2. **Pick Phase**: Players alternate picking heroes from the remaining cards
   - After banning, players swap hands
   - Each player picks 1 hero, then hands are swapped again
   - This continues until each player has 3 heroes
3. **Attack Order**: Each player arranges their 3 heroes from left to right (attack order)

### Battle Phase
1. **Initiative**: Both players roll a d20, winner chooses to go first or second
2. **Combat**: Players alternate turns with their heroes
   - On your turn, your active hero can make 1 basic attack and use 1 ability (unless specified otherwise)
   - Choose targets for attacks and abilities
   - Some heroes have special rules (no basic attack, multiple abilities, etc.)
3. **Turn Order**: Alternates between players after each hero's action
4. **Win Condition**: Last team with surviving heroes wins

## Game Mechanics

### Attack System
- Roll d20 + Accuracy modifier
- Hit if total ≥ target's AC
- Rolling natural 20 = critical hit (maximum damage)
- Basic attacks use the hero's BasicAttack damage dice
- Abilities have their own damage values

### Status Effects
- **Poison**: Takes damage equal to poison stacks at end of turn
- **Taunt**: Forces enemies to target this hero
- **Inspiration**: Can grant advantage on next roll
- **Silence**: Cannot use abilities
- **Untargetable**: Cannot be targeted by attacks/abilities

### Special Hero Types
- **Assassin**: No basic attack, can use ability twice per turn
- **Blood Hunter**: No basic attack, can use both abilities per turn
- **Berserker**: Gains damage stacks, attacks twice when below 10 HP
- And many more unique mechanics!

## Features
- Real-time multiplayer via WebSockets
- Hover to see full card details and tooltips
- Visual status effect indicators
- Automatic dice rolling and damage calculation
- Reconnection support (basic implementation)

## File Structure
```
backend/
  ├── gameServer.js      # Game server: HTTP routes and realtime events
  ├── worker/            # Cloudflare Worker entry and the Durable Object
  ├── realtime/          # WebSocket hub (socket.io-style API)
  ├── http/              # Small request router
  ├── sql/               # SQLite drivers and compatibility layer
  ├── passwords.js       # Password hashing
  ├── gameManager.js     # Core game logic and state management
  ├── utils.js           # Dice rolling and game utilities
  └── heros.json         # Hero card definitions

frontend/
  ├── src/
  │   ├── components/    # React components
  │   ├── types.ts       # TypeScript interfaces
  │   ├── socketService.ts # Realtime client wrapper
  │   ├── realtime/client.ts # WebSocket client
  │   └── App.tsx        # Main application component
  └── hero-images/       # Hero card images
```

## Contributing
The game is designed to be extensible:
- Add new heroes in `heros.json`
- Implement new status effects in `utils.js`
- Add new UI components in `frontend/src/components/`

## Technologies Used
- **Backend**: Cloudflare Workers + Durable Objects (WebSockets)
- **Frontend**: React, TypeScript, Vite
- **Real-time**: WebSockets
