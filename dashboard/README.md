# Air Quality Dashboard



React + Node.js SPA. Phase 0 runs entirely on fixture data — no NAS or InfluxDB needed.

## Dev setup

Two terminals:

```bash
# Terminal 1 — API server (port 3001)
cd dashboard/server
node index.js

# Terminal 2 — Vite dev server (port 5173)
cd dashboard/client
npm install
npm run dev
```

Open http://localhost:5173

## Project structure

```
dashboard/
├── DESIGN.md        full spec and decisions
├── server/
│   └── src/
│       ├── index.js     Express server
│       ├── routes.js    API endpoints
│       ├── influx.js    (Phase 1) InfluxDB client + queries
└── client/
    └── src/
        ├── App.jsx          routing + bottom nav
        ├── hooks/           React Query data fetching
        ├── lib/constants.js metric definitions
        ├── components/      MetricCard, SparkLine, etc.
        └── pages/           Current, DailySummary, LastNight, Trends, MetricDetail
```

## API endpoints (Phase 1 — InfluxDB data)

InfluxDB Flux queries using `@influxdata/influxdb-client`. The API response shape stays identical — client needs no changes.

| Endpoint | Description |
|---|---|
| `GET /api/current` | Latest readings for all metrics + sparklines |
| `GET /api/daily` | Daily aggregates, spike counts |
| `GET /api/overnight` | Overnight time series + highlights |
| `GET /api/trends` | Weekly and monthly aggregates |
| `GET /api/timeseries/:metric` | 24h series for one metric |
| `GET /api/metric/:name` | Combined detail for one metric |



