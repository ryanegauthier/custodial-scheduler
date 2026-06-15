# Custodial Scheduler — Whitworth University

Operational scheduling tool for the Whitworth custodial team. Built on Express + SQLite + React.

## Setup

```bash
# Install dependencies
npm install

# Copy env file and add your Anthropic API key
cp .env.example .env

# Initialize database with Whitworth building data
npm run db:init

# Start development (server + client)
npm run dev
```

Server runs on :3001, client on :5173 (proxied to server).

## Structure

```
server/
  index.js           # Express entry
  db/index.js        # SQLite connection
  routes/
    buildings.js     # Building CRUD + space breakdown
    custodians.js    # Custodian management
    schedules.js     # Daily schedule generation + assignment
    zones.js         # Zone management
    disruptions.js   # Callouts, events, special projects
    ai.js            # Claude Haiku rebalancing + impact analysis
client/
  src/
    pages/
      ScheduleBoard.jsx  # Main daily view
      Buildings.jsx      # Building list + hours
      Custodians.jsx     # Staff roster by shift
      Zones.jsx          # Zone breakdown
seeds/
  001_appa_standards.sql   # APPA room types + service levels
  002_whitworth_data.sql   # 41 WU buildings, 248 space rows, real sqft
```

## Key numbers (from WU Building Data spreadsheet)

- 41 buildings, 482,817 cleanable sqft
- 187.9 daily routine hours at APPA Level 2
- 26.8 FTE needed at 7hr productive shift
- Shift structure: 4/5/6am start, 420 productive min, 7.5hr clock

## Deployment (Render)

1. Push to GitHub
2. Create a new Web Service on Render pointing to this repo
3. Build command: `npm install && npm run build`
4. Start command: `npm run db:init && npm start`
5. Add `ANTHROPIC_API_KEY` as an environment variable
6. Add `NODE_ENV=production`
7. Point `custodial.ryangauthier.dev` CNAME to your Render service URL
