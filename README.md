# THREES Online

Mobile-first real-time multiplayer implementation of the custom THREES card game.

## Current build
- 2–4 players
- Server-authoritative game state and hidden hands
- Room creation/joining with Socket.IO
- Setup swaps
- Starting-card selection and server-side race resolution
- Mandatory-play rule
- Optional same-rank multiples
- 2 reset / 6 glass / 7 low / 8 skip / 10 bomb
- Four-of-a-kind bomb (except 10)
- Jump-ins for 3+ players
- Hand → face-up → face-down progression
- Pickup and blind face-down failure handling
- Win detection
- Disconnect handling and host reassignment
- Mobile-first UI
- Automated rule/game regression tests

## Run locally

Requires Node.js 20+.

```bash
npm install
npm test
npm start
```

Then open `http://localhost:3000` on two or more devices on the same network, or deploy the Node app to a host that supports WebSockets.

## Test status

The current regression suite contains 26 passing tests covering the core rule engine and important multiplayer/game-state transitions.

## Still planned before calling it production-ready

- Reconnection/session recovery
- Rematch flow
- More exhaustive 3/4-player jump-in chain simulation
- Production deployment configuration
- Better animations, sound and visual card polish
- Optional persistent accounts/statistics
- More comprehensive integration testing with real browser clients


## Multiplayer reliability
- Reconnect sessions are stored in the browser and accepted for up to 5 minutes after a disconnect.
- Hidden cards remain server-side; reconnecting restores the same player rather than creating a replacement player.
- If the active player disconnects during a live game, the turn advances so the table does not freeze.
- A disconnected player remains reserved during the reconnect grace period.
