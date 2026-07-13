# Custodial Scheduler - Whitworth University

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
shared/
  types.ts           # Trusted internal SQL row shapes (Building, Zone, etc.)
  schemas.ts         # zod schemas for request bodies + Claude JSON output
server/
  index.ts           # Express entry
  db/index.ts        # SQLite connection
  routes/
    buildings.ts     # Building CRUD + space breakdown
    custodians.ts    # Custodian management
    schedules.ts     # Daily schedule generation + assignment
    zones.ts         # Zone management
    disruptions.ts   # Callouts, events, special projects
    ai.ts            # Claude Haiku rebalancing + impact analysis
client/
  src/
    api.ts             # Typed fetch wrappers over shared/types + shared/schemas
    pages/
      ScheduleBoard.tsx  # Main daily view
      Buildings.tsx      # Building list + hours
      Custodians.tsx     # Staff roster by shift
      Zones.tsx          # Zone breakdown
seeds/
  001_appa_standards.sql   # APPA room types + service levels
  002_whitworth_data.sql   # 41 WU buildings, 248 space rows, real sqft
```

Run `npm run typecheck` to type-check both the client and server projects.

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
