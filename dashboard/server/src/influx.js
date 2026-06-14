const { InfluxDB } = require('@influxdata/influxdb-client');

const INFLUXDB_URL    = process.env.INFLUXDB_URL    || 'http://airquality_influxdb:8086';
const INFLUXDB_TOKEN  = process.env.INFLUXDB_TOKEN  || 'airqualitysensing101';
const INFLUXDB_ORG    = process.env.INFLUXDB_ORG    || 'home';
const INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET || 'airquality';

const client   = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });
const queryApi = client.getQueryApi(INFLUXDB_ORG);

const BUCKET = INFLUXDB_BUCKET;

// Execute a Flux query and return all rows as plain objects
function query(fluxStr) {
  return new Promise((resolve, reject) => {
    const rows = [];
    queryApi.queryRows(fluxStr, {
      next(row, meta) { rows.push(meta.toObject(row)); },
      error: reject,
      complete() { resolve(rows); },
    });
  });
}

// Group query rows by their `sensor` tag → Map<topic, [{timestamp, value}]>
function groupBySensor(rows) {
  const map = new Map();
  for (const row of rows) {
    const topic = row.sensor;
    if (!map.has(topic)) map.set(topic, []);
    map.get(topic).push({ timestamp: row._time, value: row._value });
  }
  return map;
}

// ── Math utils ───────────────────────────────────────────────────────────────

function mean(vals) {
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function stdDev(vals) {
  if (vals.length < 2) return 0;
  const mu = mean(vals);
  return Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / vals.length);
}

function round(v, dp) {
  if (v == null || isNaN(v)) return null;
  return +v.toFixed(dp);
}

function arrMax(pts) { return pts.reduce((m, p) => Math.max(m, p.value), -Infinity); }
function arrMin(pts) { return pts.reduce((m, p) => Math.min(m, p.value),  Infinity); }
function arrMean(pts, dp) { return round(mean(pts.map(p => p.value)), dp); }

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const muX = mean(xs.slice(0, n)), muY = mean(ys.slice(0, n));
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - muX, dy = ys[i] - muY;
    num += dx * dy; dx2 += dx ** 2; dy2 += dy ** 2;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : round(num / denom, 2);
}

// ── Normal distribution for distribution charts ──────────────────────────────

function normalPDF(x, mu, sigma) {
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
}

function buildDistChart(dists, dp) {
  const pad  = 3.5;
  const minX = Math.min(...dists.map(d => d.mu - pad * d.sigma));
  const maxX = Math.max(...dists.map(d => d.mu + pad * d.sigma));
  const N = 60, step = (maxX - minX) / N;
  return Array.from({ length: N + 1 }, (_, i) => {
    const x  = minX + i * step;
    const pt = { x: round(x, dp) };
    dists.forEach(d => { pt[d.name] = round(normalPDF(x, d.mu, d.sigma), 6); });
    return pt;
  });
}

// ── Simple in-memory cache ────────────────────────────────────────────────────

const _cache = new Map();

async function cachedQuery(key, ttlMs, fn) {
  const now    = Date.now();
  const cached = _cache.get(key);
  if (cached && now - cached.at < ttlMs) return cached.data;
  const data = await fn();
  _cache.set(key, { data, at: now });
  return data;
}

// ── Overnight time window (ET) ────────────────────────────────────────────────

function overnightRange() {
  const tz = 'America/New_York';
  const now = new Date();

  // 1. Convert the current exact time to a stable NY date string
  const nyString = now.toLocaleString('en-US', { timeZone: tz });
  const nyDate = new Date(nyString);

  // 2. Build a stable object tracking 6:00 AM ET for "today"
  const today6AM = new Date(nyString);
  today6AM.setHours(6, 0, 0, 0);

  let startET, endET;

// 3. Determine if the current time is before or after 6:00 AM ET
  if (nyDate < today6AM) {
    // BEFORE 6 AM (e.g., 5 AM June 12): Show the completed window from 2 nights ago to yesterday morning
    // Target End: June 11 at 6:00 AM (Today 6 AM minus 24 hours)
    endET = new Date(today6AM.getTime() - 24 * 60 * 60 * 1000);
    // Target Start: June 10 at 10:00 PM (End time minus 8 hours)
    startET = new Date(endET.getTime() - 8 * 60 * 60 * 1000);
  } else {
    // AFTER 6 AM (e.g., 7 AM June 12): Show last night's window to this morning
    // Target End: June 12 at 6:00 AM (Today 6 AM)
    endET = today6AM;
    // Target Start: June 11 at 10:00 PM (Today 6 AM minus 8 hours)
    startET = new Date(today6AM.getTime() - 8 * 60 * 60 * 1000);
  }

  // 4. Return clean, raw ISO strings that InfluxDB handles perfectly
  return { 
    start: startET.toISOString(), 
    end: endET.toISOString() 
  };
}

// ── Status classification ─────────────────────────────────────────────────────

const STATUS_THRESHOLDS = {
  co2:   [800, 1200, 1800],
  no2:   [0.05, 0.1, 0.2],
  pm2p5: [12, 35, 55],
  o3:    [50, 100, 150],
  voc:   [150, 250, 400],
  co:    [10, 25, 35],
};

function getStatus(key, value) {
  const t = STATUS_THRESHOLDS[key];
  if (!t || value == null) return 'good';
  if (value >= t[2]) return 'alert';
  if (value >= t[1]) return 'poor';
  if (value >= t[0]) return 'moderate';
  return 'good';
}

module.exports = {
  BUCKET, query, groupBySensor,
  mean, stdDev, round, arrMax, arrMin, arrMean, pearson,
  normalPDF, buildDistChart,
  cachedQuery, overnightRange, getStatus,
};
