# Air Quality Dashboard — Design Document

## Overview

A React + Node.js SPA served locally from the NAS, accessible via Tailscale.  
Development approach: prototype with CSV snapshot of InfluxDB data → wire up live API.

---

## Architecture

```
InfluxDB (NAS) ←→ Node.js API (NAS, Docker) ←→ React SPA (served same container)
                                                        ↑
                                                  Tailscale access
```

- **Backend**: Node.js / Express (or Fastify) querying InfluxDB HTTP API
- **Frontend**: React, mobile-first, dark theme
- **Dev mode**: CSV fixtures replacing live API calls — no NAS needed to design/prototype
- **Deployment**: Docker container on NAS, same `airquality_network` as InfluxDB

---

## Design System

| Token | Value |
|---|---|
| Background | `#000000` / `#0a0a0a` |
| Surface | `#111111` / `#1a1a1a` |
| Primary accent | `#39ff14` (neon lime green) |
| Secondary accent | `#00e5a0` (mint green) |
| Muted accent | `#1a3a2a` (dark green tint for backgrounds) |
| Text primary | `#f0f0f0` |
| Text secondary | `#666666` |
| Danger/alert | `#ff4444` |
| Warning | `#ffaa00` |
| Font — UI | Inter, system-ui, sans-serif |
| Font — metrics | JetBrains Mono, monospace |
| Border radius | 8px cards, 4px badges |

---

## Navigation Structure

```
Landing (Current Air Quality)
├── → Daily Summary
├── → Last Night
├── → Trends
└── [tap any metric] → Metric Detail Page
                         ├── Current
                         ├── Daily summary
                         ├── Last night's chart
                         └── Trend / time series
```

All four dashboards accessible from a persistent bottom nav bar (mobile) or top nav (desktop).

---

## Dashboard 1 — Current Air Quality

**Purpose**: At-a-glance right now snapshot.

**Primary metrics** (large stat cards, always visible):
- CO2 (ppm)
- NO2 (ppm)
- O3 (ppb)
- VOC Index
- Temperature (°C)
- Humidity (%)

**Expandable section** — "Particulates":
- PM1.0, PM2.5, PM4.0, PM10.0 (µg/m³)

**Expandable section** — "Multi-Gas (MiCS)":
- CO, C2H5OH, CH4, H2, NH3, NOx (ppm)

Each card: metric name, current value (monospace), unit, subtle sparkline (last 1hr), color-coded status dot.  
Tap any card → Metric Detail Page.

**Data**: last() query from InfluxDB, auto-refreshes every 30s.

---

## Dashboard 2 — Daily Summary

**Purpose**: How has today been? How does it compare?

**Layout**: Table/grid of all primary metrics with columns:

| Metric | Current | 1hr Avg | 6hr Avg | 12hr Avg | Daily High | vs Yesterday |
|---|---|---|---|---|---|---|

**Spike counts** (noxious gas alerts section):
- For CO, C2H5OH, CH4, H2, NOx — count of readings exceeding threshold in last 24h
- Displayed as: `CO: 3 spikes (last at 14:32)`

**Percent diff badges**:
- Each metric shows ↑/↓ vs previous day average, color-coded green/red

**Data queries**:
- Current: `last()`
- Averages: `mean()` over window
- Spikes: `filter()` > threshold, `count()`
- Percent diff: today mean vs yesterday mean

---

## Dashboard 3 — Last Night

**Purpose**: What happened while I was asleep? (10pm – 6am)

**Time series charts** (one per metric, vertically stacked, zoomable):
- CO2 — full overnight time series
- NO2 — full overnight time series
- Temperature + Humidity — overlaid on same chart
- O3 — time series

**Hourly average bar chart** — CO2 by hour 10pm→6am

**Automated highlights** (statistical, text callouts):
- "CO2 lowest at 5:12am (387 ppm)"
- "Temperature dropped 2.1°C between midnight and 3am"
- "NO2 spike at 11:47pm"
- Pattern detection: consistent low points, high points, rate-of-change anomalies

**Data**: query from previous day 22:00 → current day 06:00 (local time, UTC offset applied)

---

## Dashboard 4 — Trends

**Purpose**: Longer-horizon patterns — weekly, monthly.

**Sections**:

1. **Weekly averages** — bar chart, each metric, Mon–Sun
2. **Monthly time series** — line chart per primary metric, last 30 days
3. **Week over week overlay** — "this week so far" vs "last week same days" on same chart (two lines, different colors)
4. **Monthly heatmap** — CO2 or NO2 by day, color intensity = average value (like a GitHub contribution graph)

**Data**: windowed `mean()` queries, 7-day and 30-day ranges

---

## Metric Detail Page

Accessible by tapping any metric card from any dashboard.

**Sections** (all for the selected metric):
1. **Current** — large readout, timestamp, status
2. **Daily** — 1hr / 6hr / 12hr / 24hr averages + daily high/low
3. **Last Night** — overnight time series chart
4. **Trends** — 30-day time series + week-over-week overlay

**Header**: metric name, unit, sensor source  
**Back**: returns to originating dashboard

---

## Feature: Insights

Simple statistical callouts surfaced on dashboards and detail pages.

Examples:
- "CO2 has increased 8% over the past 7 days"
- "NO2 consistently peaks between 7–9pm"
- "This week's PM2.5 average is the highest in 4 weeks"

Implementation: computed server-side from InfluxDB aggregates, returned alongside metric data. Start simple (percent change, peak time, rolling average comparison) — no ML needed.

---

## Feature: Alerts

**Scope**: noxious gases — CO, C2H5OH (ethanol), CH4, H2, NOx

**Behavior**:
- Visual alert banner at top of any dashboard when a threshold is exceeded
- Alert card in Current dashboard replaces normal card (red border, pulsing dot)
- Thresholds configurable in a simple JSON config (server-side, not UI initially)

**Default thresholds** (to be tuned):
| Gas | Threshold |
|---|---|
| CO | > 35 ppm (EPA 1hr limit) |
| NOx | > 0.5 ppm |
| CH4 | > 1000 ppm |
| C2H5OH | > 200 ppm |
| H2 | > 500 ppm |

**Future**: push notification via Tailscale / webhook (not in v1)

---

## UX Principles

- **Mobile first** — all layouts designed for iPhone, gracefully expand to desktop
- **Progressive disclosure** — summary visible by default, tap/expand for detail
- **No unnecessary navigation** — bottom nav always visible, back button on detail pages
- **Fast first paint** — show cached/stale data immediately, refresh in background
- **Offline graceful** — if API unreachable, show last known values with timestamp

---

## Technology Choices (to explore during build)

| Layer | Primary candidate | Alternatives to consider |
|---|---|---|
| Framework | React (Vite) | — |
| Charting | **Recharts** (simple) or **Victory Native** | uPlot (performance), Chart.js, Tremor |
| Styling | Tailwind CSS | CSS Modules, styled-components |
| API | Express / Fastify | — |
| InfluxDB client | `@influxdata/influxdb-client` (Node) | Raw HTTP fetch |
| State / data fetching | React Query (TanStack) | SWR |
| Routing | React Router v6 | — |
| Container | Docker (single image, serves built React + API) | — |

**Charting options to prototype**: Recharts has the easiest API; uPlot is fastest for dense time series. Worth testing both for the overnight time series chart.

---

## Development Phases

### Phase 0 — Fixtures & Design (local, no NAS)
- Export 24h of InfluxDB data as CSV
- Build Node API that serves CSV data in same shape as live queries
- Build and style all dashboards against fixture data
- Finalize component library, colors, typography

### Phase 1 — Live API wiring
- Replace CSV fixture responses with real InfluxDB Flux queries
- Add auto-refresh (React Query polling)
- Test on NAS via Tailscale

### Phase 2 — Features
- Insights computation
- Alerts + threshold config
- Metric detail pages

### Phase 3 — Polish
- Push notifications (optional)
- PWA manifest (add to iPhone home screen)
- Performance tuning

---

## Open Questions

- [ ] UTC offset for "last night" queries — confirm NAS timezone
- [ ] Spike threshold values — tune after seeing real data ranges
- [ ] Single Docker image (React built into Node server) vs separate containers
- [ ] Authentication — Tailscale handles network access, but do we want a login screen?
- [ ] PWA vs native app wrapper (Capacitor) for iPhone home screen feel
