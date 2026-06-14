const { Router } = require('express');
const {
  BUCKET, query, groupBySensor,
  mean, stdDev, round, arrMax, arrMin, arrMean, pearson,
  buildDistChart, cachedQuery, overnightRange, getStatus,
} = require('./influx');
const {
  SENSOR_MAP, METRIC_META, SPIKE_THRESHOLDS,
  ALL_KEYS, NOXIOUS_KEYS, OVERNIGHT_KEYS, TREND_METRICS, INSIGHT_METRICS,
  PRIMARY_CORRELATIONS,
} = require('./sensorMap');

const router = Router();

// ── Flux query strings ────────────────────────────────────────────────────────

const Q = {
  latest: () => `
    from(bucket: "${BUCKET}")
      |> range(start: -15m)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> last()`,

  series24h: () => `
    from(bucket: "${BUCKET}")
      |> range(start: -24h)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 10m, fn: mean, createEmpty: false)`,

  seriesYesterday: () => `
    from(bucket: "${BUCKET}")
      |> range(start: -48h, stop: -24h)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 10m, fn: mean, createEmpty: false)`,

  seriesOvernight: (start, end) => `
    from(bucket: "${BUCKET}")
      |> range(start: time(v: "${start}"), stop: time(v: "${end}"))
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)`,

  dailyMeans: (days) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)`,

  dailyMax: (days) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 1d, fn: max, createEmpty: false)`,

  dailyMin: (days) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 1d, fn: min, createEmpty: false)`,

  weeklyMeans: (weeks) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${weeks * 7}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 7d, fn: mean, createEmpty: false)`,

  weeklyMax: (weeks) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${weeks * 7}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 7d, fn: max, createEmpty: false)`,

  weeklyMin: (weeks) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${weeks * 7}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r._field == "value")
      |> aggregateWindow(every: 7d, fn: min, createEmpty: false)`,

  hourlyMeans: (sensor, days) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r.sensor == "${sensor}" and r._field == "value")
      |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)`,

  dailySpikeCount: (sensor, threshold, days) => `
    from(bucket: "${BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r.sensor == "${sensor}" and r._field == "value")
      |> filter(fn: (r) => r._value > ${threshold})
      |> aggregateWindow(every: 1d, fn: count, createEmpty: true)`,

  vocByHour: () => `
    import "date"
    from(bucket: "${BUCKET}")
      |> range(start: -30d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r.sensor == "${SENSOR_MAP.voc}" and r._field == "value")
      |> map(fn: (r) => ({ r with _field: "voc", hour: date.hour(t: r._time) }))
      |> group(columns: ["hour"])
      |> mean()`,

  vocByWeekday: (threshold) => `
    import "date"
    from(bucket: "${BUCKET}")
      |> range(start: -30d)
      |> filter(fn: (r) => r._measurement == "air_quality" and r.sensor == "${SENSOR_MAP.voc}" and r._field == "value")
      |> filter(fn: (r) => r._value > ${threshold})
      |> map(fn: (r) => ({ r with _field: "spike", weekday: date.weekDay(t: r._time) }))
      |> group(columns: ["weekday"])
      |> count()`,
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function sensorPts(grouped, key) {
  return grouped.get(SENSOR_MAP[key]) || [];
}

function metricFromSeries(key, latestPt, series24) {
  const meta = METRIC_META[key];
  if (!meta) return null;
  const dp        = meta.dp;
  const vals      = series24.map(p => p.value);
  const value     = latestPt ? round(latestPt.value, dp) : (vals.length ? round(vals[vals.length - 1], dp) : null);
  const dayAvg    = round(mean(vals), dp);
  const pctDelta  = dayAvg ? round(((value - dayAvg) / dayAvg) * 100, 1) : null;
  const sparkline = series24.slice(-6).map(p => ({ t: p.timestamp, v: round(p.value, dp) }));
  const threshold = SPIKE_THRESHOLDS[key];
  const spikes24h = threshold ? vals.filter(v => v > threshold).length : 0;
  return { value, unit: meta.unit, label: meta.label, status: getStatus(key, value), sparkline, dayAvg, pctDelta, spikes24h };
}

// ── Cached expensive queries ──────────────────────────────────────────────────

async function getMoMData() {
  return cachedQuery('mom_38d', 30 * 60_000, async () => {
    const rows = await query(Q.dailyMeans(38));
    return groupBySensor(rows);
  });
}

function computeMoM(pts, dp) {
  if (!pts || pts.length < 10) return { mtdAvg: null, lastMonthAvg: null, pctMoM: null };
  const sorted       = [...pts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const last9        = sorted.slice(-9).map(p => p.value);
  const prev30       = sorted.slice(-39, -9).map(p => p.value);
  if (!last9.length || !prev30.length) return { mtdAvg: null, lastMonthAvg: null, pctMoM: null };
  const mtdAvg       = round(mean(last9),  dp);
  const lastMonthAvg = round(mean(prev30), dp);
  const pctMoM       = lastMonthAvg ? round(((mtdAvg - lastMonthAvg) / lastMonthAvg) * 100, 1) : null;
  return { mtdAvg, lastMonthAvg, pctMoM };
}

async function getMonthlySpikeCounts() {
  return cachedQuery('monthly_spikes', 60 * 60_000, async () => {
    const results = {};
    await Promise.all(ALL_KEYS.map(async (key) => {
      const threshold = SPIKE_THRESHOLDS[key];
      if (!threshold) { results[key] = { sThis: 0, sLast: 0, sMonth: 0 }; return; }
      const rows   = await query(Q.dailySpikeCount(SENSOR_MAP[key], threshold, 38));
      const sorted = rows.sort((a, b) => new Date(a._time) - new Date(b._time));
      const thisM  = sorted.slice(-9).reduce((s, r)  => s + (r._value || 0), 0);
      const lastM  = sorted.slice(-39, -9).reduce((s, r) => s + (r._value || 0), 0);
      results[key] = { sThis: thisM, sLast: lastM, sMonth: thisM + lastM };
    }));
    return results;
  });
}

async function getDailyAggregates(days = 30) {
  return cachedQuery(`daily_agg_${days}`, 30 * 60_000, async () => {
    const [means, maxs, mins] = await Promise.all([
      query(Q.dailyMeans(days)),
      query(Q.dailyMax(days)),
      query(Q.dailyMin(days)),
    ]);
    return { means: groupBySensor(means), maxs: groupBySensor(maxs), mins: groupBySensor(mins) };
  });
}

async function getWeeklyAggregates() {
  return cachedQuery('weekly_agg_8', 60 * 60_000, async () => {
    const [means, maxs, mins] = await Promise.all([
      query(Q.weeklyMeans(8)),
      query(Q.weeklyMax(8)),
      query(Q.weeklyMin(8)),
    ]);
    return { means: groupBySensor(means), maxs: groupBySensor(maxs), mins: groupBySensor(mins) };
  });
}

// ── /api/current ─────────────────────────────────────────────────────────────

router.get('/current', async (_req, res) => {
  try {
    const [[latestRows, series24Rows], momGrouped, spikeCounts] = await Promise.all([
      Promise.all([query(Q.latest()), query(Q.series24h())]),
      getMoMData(),
      getMonthlySpikeCounts(),
    ]);

    const latest  = groupBySensor(latestRows);
    const series  = groupBySensor(series24Rows);
    const metrics = {};

    for (const key of ALL_KEYS) {
      const meta = METRIC_META[key]; if (!meta) continue;
      const base = metricFromSeries(key, sensorPts(latest, key)[0], sensorPts(series, key));
      if (!base) continue;
      const mom = computeMoM(sensorPts(momGrouped, key), meta.dp);
      const sc  = spikeCounts[key] || {};
      metrics[key] = { ...base, spikesThisMonth: sc.sThis ?? 0, spikesLastMonth: sc.sLast ?? 0, spikesMonth: sc.sMonth ?? 0, ...mom };
    }

    const noxiousSpikes = {};
    for (const key of NOXIOUS_KEYS) {
      if (metrics[key]) noxiousSpikes[key] = { label: metrics[key].label, count: metrics[key].spikes24h };
    }

    res.json({ timestamp: new Date().toISOString(), metrics, noxiousSpikes, alerts: [] });
  } catch (err) {
    console.error('/api/current:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/daily ───────────────────────────────────────────────────────────────

router.get('/daily', async (_req, res) => {
  try {
    const [todayRows, yesterdayRows] = await Promise.all([query(Q.series24h()), query(Q.seriesYesterday())]);
    const today     = groupBySensor(todayRows);
    const yesterday = groupBySensor(yesterdayRows);
    const metrics   = {}, spikes = {};

    for (const key of ALL_KEYS) {
      const meta = METRIC_META[key]; if (!meta) continue;
      const dp   = meta.dp;
      const pts  = sensorPts(today, key);
      if (!pts.length) continue;
      const vals      = pts.map(p => p.value);
      const ypts      = sensorPts(yesterday, key);
      const yavg      = ypts.length ? mean(ypts.map(p => p.value)) : null;
      const todayAvg  = mean(vals);
      const threshold = SPIKE_THRESHOLDS[key];

      metrics[key] = {
        label: meta.label, unit: meta.unit,
        current:          round(vals[vals.length - 1], dp),
        avg1h:            round(mean(vals.slice(-6)),  dp),
        avg6h:            round(mean(vals.slice(-36)), dp),
        avg12h:           round(mean(vals.slice(-72)), dp),
        dailyHigh:        round(Math.max(...vals),     dp),
        dailyLow:         round(Math.min(...vals),     dp),
        pctDiffYesterday: yavg ? round(((todayAvg - yavg) / yavg) * 100, 1) : null,
      };

      if (threshold) {
        const count  = vals.filter(v => v > threshold).length;
        const lastPt = pts.filter(p => p.value > threshold).slice(-1)[0];
        spikes[key]  = { label: meta.label, count, lastAt: lastPt?.timestamp ?? null };
      }
    }

    res.json({ metrics, spikes });
  } catch (err) {
    console.error('/api/daily:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/overnight ───────────────────────────────────────────────────────────

router.get('/overnight', async (_req, res) => {
  try {
    const { start, end } = overnightRange();
    const rows    = await query(Q.seriesOvernight(start, end));
    const grouped = groupBySensor(rows);

    const get = key => sensorPts(grouped, key);
    const tempSeries  = get('temperature');
    const humidSeries = get('humidity');
    const pressureSeries = get('pressure');

    const tempLow   = tempSeries.length  ? round(arrMin(tempSeries),     1) : null;
    const tempAvg   = tempSeries.length  ? arrMean(tempSeries,           1) : null;
    const tempDelta = tempSeries.length  ? round(tempSeries[tempSeries.length - 1].value - tempSeries[0].value, 1) : null;
    const humidHigh = humidSeries.length ? round(arrMax(humidSeries),    0) : null;
    const humidLow  = humidSeries.length ? round(arrMin(humidSeries),    0) : null;
    const humidAvg  = humidSeries.length ? arrMean(humidSeries,          0) : null;
    const pressureLow = pressureSeries.length ? round(arrMin(pressureSeries), 2) : null;
    const pressureHigh = pressureSeries.length ? round(arrMax(pressureSeries), 2) : null;
    const pressureAvg = pressureSeries.length ? round(arrMean(pressureSeries, 1), 2) : null;

    const overnightSpikes = {};
    for (const key of [...NOXIOUS_KEYS, 'voc']) {
      const pts = get(key), threshold = SPIKE_THRESHOLDS[key];
      const count = (pts.length && threshold) ? pts.filter(p => p.value > threshold).length : 0;
      if (METRIC_META[key]) overnightSpikes[key] = { label: METRIC_META[key].label, count };
    }

    const series = {};
    for (const key of OVERNIGHT_KEYS) {
      const pts = get(key);
      series[key] = pts.map(p => ({ timestamp: p.timestamp, value: round(p.value, METRIC_META[key]?.dp ?? 1) }));
    }

    const highlights = [];
    const co2Pts = get('co2');
    if (co2Pts.length) {
      const fmt    = iso => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
      const minCo2 = co2Pts.reduce((m, p) => p.value < m.value ? p : m);
      const maxCo2 = co2Pts.reduce((m, p) => p.value > m.value ? p : m);
      highlights.push({ type: 'info', text: `CO2 lowest at ${fmt(minCo2.timestamp)} (${round(minCo2.value, 0)} ppm)` });
      highlights.push({ type: 'info', text: `CO2 peaked at ${fmt(maxCo2.timestamp)} (${round(maxCo2.value, 0)} ppm)` });
      if (co2Pts.length >= 24) {
        const co2First = mean(co2Pts.slice(0, 24).map(p => p.value));
        const co2Last  = mean(co2Pts.slice(-24).map(p => p.value));
        if (co2Last - co2First > 80)
          highlights.push({ type: 'anomaly', text: `CO2 rose ${round(co2Last - co2First, 0)} ppm overnight — expected to fall. Check ventilation.` });
      }
    }
    if (tempDelta != null) {
      if (tempDelta > 0.5)       highlights.push({ type: 'anomaly', text: `Temperature rose ${tempDelta}°C overnight — typically falls.` });
      else if (tempDelta < -0.5) highlights.push({ type: 'info',    text: `Temperature fell ${Math.abs(tempDelta)}°C overnight (normal).` });
      else                       highlights.push({ type: 'info',    text: `Temperature stable overnight (< 0.5°C variation).` });
    }

    res.json({ start, end, tempLow, tempAvg, tempDelta, humidHigh, humidLow, humidAvg, pressureLow, pressureHigh, pressureAvg, overnightSpikes, series, highlights });
  } catch (err) {
    console.error('/api/overnight:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/trends ──────────────────────────────────────────────────────────────

router.get('/trends', async (_req, res) => {
  try {
    const { start: oStart, end: oEnd } = overnightRange();

    const spikeQueries = NOXIOUS_KEYS.map(key => {
      const threshold = SPIKE_THRESHOLDS[key];
      return threshold ? query(Q.dailySpikeCount(SENSOR_MAP[key], threshold, 30)) : Promise.resolve([]);
    });

    const [dailyAgg, momGrouped, spikeCountsArr] = await Promise.all([
      getDailyAggregates(30),
      getMoMData(),
      Promise.all(spikeQueries),
    ]);

    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Monthly trend (30-day daily means)
    const monthly = {};
    for (const key of TREND_METRICS) {
      const pts = sensorPts(dailyAgg.means, key), meta = METRIC_META[key];
      if (!pts.length || !meta) continue;
      monthly[key] = { label: meta.label, unit: meta.unit, data: [...pts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map(p => ({ date: p.timestamp.slice(0, 10), avg: round(p.value, meta.dp) })) };
    }

    // Weekly comparison (last 7 vs prev 7)
    const weekly = {};
    for (const key of TREND_METRICS) {
      const pts = sensorPts(dailyAgg.means, key), meta = METRIC_META[key];
      if (pts.length < 14 || !meta) continue;
      const sorted = [...pts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      weekly[key] = { labels: DAY_LABELS, thisWeek: sorted.slice(-7).map(p => round(p.value, meta.dp)), lastWeek: sorted.slice(-14, -7).map(p => round(p.value, meta.dp)), unit: meta.unit, label: meta.label };
    }

    // MoM
    const mom = {};
    for (const key of TREND_METRICS) {
      const meta = METRIC_META[key]; if (!meta) continue;
      mom[key] = { ...computeMoM(sensorPts(momGrouped, key), meta.dp), unit: meta.unit, label: meta.label };
    }

    // Anomaly detection
    const anomalies = [];
    for (const key of INSIGHT_METRICS) {
      const pts = sensorPts(dailyAgg.means, key), meta = METRIC_META[key];
      if (pts.length < 10 || !meta) continue;
      const sorted    = [...pts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const data      = sorted.map(p => ({ date: p.timestamp.slice(0, 10), avg: round(p.value, meta.dp) }));
      const baseline  = round(mean(data.slice(0, -7).map(d => d.avg)), meta.dp);
      const recent    = round(mean(data.slice(-7).map(d => d.avg)),    meta.dp);
      const pctChange = baseline ? round(((recent - baseline) / baseline) * 100, 1) : null;
      if (pctChange != null && Math.abs(pctChange) >= 8)
        anomalies.push({ key, label: meta.label, unit: meta.unit, baseline, recent, pctChange, direction: pctChange > 0 ? 'up' : 'down', series: data });
    }

    // Spike by day
    const spikesByDay = {};
    NOXIOUS_KEYS.forEach((key, i) => {
      const meta = METRIC_META[key], rows = spikeCountsArr[i]; if (!meta || !rows.length) return;
      const sorted = rows.sort((a, b) => new Date(a._time) - new Date(b._time));
      const data30 = sorted.map(r => ({ date: r._time.slice(0, 10), count: r._value || 0 }));
      spikesByDay[key] = { label: meta.label, week: { labels: DAY_LABELS, data: data30.slice(-7) }, month: { data: data30 } };
    });

    // Spike anomalies
    const spikeAnomalies = [];
    NOXIOUS_KEYS.forEach((key, i) => {
      const meta = METRIC_META[key], rows = spikeCountsArr[i]; if (!meta || !rows.length) return;
      const sorted   = rows.sort((a, b) => new Date(a._time) - new Date(b._time));
      const baseline = mean(sorted.slice(0, -7).map(r => r._value || 0));
      const recent   = mean(sorted.slice(-7).map(r => r._value || 0));
      if (recent > 0 && (baseline === 0 || recent / baseline >= 1.5))
        spikeAnomalies.push({ key, label: meta.label, unit: meta.unit, type: 'spike_frequency', baseline: round(baseline, 1), recent: round(recent, 1), pctChange: baseline === 0 ? null : round(((recent - baseline) / baseline) * 100, 0) });
    });

    // Overnight trends (use daily means as proxy for nightly averages)
    const overnightTrends = {};
    for (const key of ['co2', 'no2', 'temperature', 'o3', 'pm2p5']) {
      const pts = sensorPts(dailyAgg.means, key), meta = METRIC_META[key];
      if (!pts.length || !meta) continue;
      const sorted    = [...pts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const data      = sorted.map(p => ({ date: p.timestamp.slice(0, 10), avg: round(p.value, meta.dp) }));
      const baseline  = round(mean(data.slice(0, -7).map(d => d.avg)), meta.dp);
      const recent    = round(mean(data.slice(-7).map(d => d.avg)),    meta.dp);
      overnightTrends[key] = { label: meta.label, unit: meta.unit, data, baseline, recent, pctChange: baseline ? round(((recent - baseline) / baseline) * 100, 1) : null };
    }

    res.json({ weekly, monthly, mom, spikesByDay, overnightTrends, anomalies, spikeAnomalies });
  } catch (err) {
    console.error('/api/trends:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/metric/:name ────────────────────────────────────────────────────────

router.get('/metric/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const meta = METRIC_META[name];
    if (!meta || !SENSOR_MAP[name]) return res.status(404).json({ error: 'Unknown metric' });

    const { start: oStart, end: oEnd } = overnightRange();
    const dp = meta.dp;

    const [latestRows, series24Rows, overnightRows, dailyAgg, weeklyAgg, momGrouped, sc] = await Promise.all([
      query(Q.latest()),
      query(Q.series24h()),
      query(Q.seriesOvernight(oStart, oEnd)),
      getDailyAggregates(30),
      getWeeklyAggregates(),
      getMoMData(),
      getMonthlySpikeCounts(),
    ]);

    const latestG   = groupBySensor(latestRows);
    const series24G = groupBySensor(series24Rows);
    const nightG    = groupBySensor(overnightRows);

    const series24  = sensorPts(series24G, name);
    const overnight = sensorPts(nightG, name);
    const base      = metricFromSeries(name, sensorPts(latestG, name)[0], series24);

    const vals = series24.map(p => p.value);
    const daily = vals.length ? {
      avg1h: round(mean(vals.slice(-6)), dp), avg6h: round(mean(vals.slice(-36)), dp),
      avg12h: round(mean(vals.slice(-72)), dp), dailyHigh: round(Math.max(...vals), dp), dailyLow: round(Math.min(...vals), dp),
    } : null;

    const dailyMeanPts = sensorPts(dailyAgg.means, name);
    const monthly = dailyMeanPts.length ? {
      data: [...dailyMeanPts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map(p => ({ date: p.timestamp.slice(0, 10), avg: round(p.value, dp) })),
    } : null;

    const mom  = computeMoM(sensorPts(momGrouped, name), dp);
    const sc_n = sc[name] || {};

    const metric = { ...base, spikesThisMonth: sc_n.sThis ?? 0, spikesLastMonth: sc_n.sLast ?? 0, spikesMonth: sc_n.sMonth ?? 0, ...mom };

    // ── Statistics ────────────────────────────────────────────────────────────
    let stats = null;
    if (vals.length >= 2) {
      const sampleSd = Math.max(stdDev(vals), Math.abs(mean(vals)) * 0.02 + 0.01);
      const minSd    = sampleSd * 0.04 + 0.01;

      const dailyMaxPts = sensorPts(dailyAgg.maxs, name);
      const dailyMinPts = sensorPts(dailyAgg.mins, name);
      const wkMeanPts   = sensorPts(weeklyAgg.means, name);
      const wkMaxPts    = sensorPts(weeklyAgg.maxs, name);
      const wkMinPts    = sensorPts(weeklyAgg.mins, name);

      const dMeans = dailyMeanPts.map(p => p.value);
      const dMaxes = dailyMaxPts.map(p => p.value);
      const dMins  = dailyMinPts.map(p => p.value);
      const wMeans = wkMeanPts.map(p => p.value);
      const wMaxes = wkMaxPts.map(p => p.value);
      const wMins  = wkMinPts.map(p => p.value);

      // Hourly highs/lows from 24h series (1-hour = 6 × 10-min windows)
      const hourBlocks  = [];
      for (let i = 0; i + 6 <= series24.length; i += 6) hourBlocks.push(series24.slice(i, i + 6));
      const hourHighs = hourBlocks.map(b => Math.max(...b.map(p => p.value)));
      const hourLows  = hourBlocks.map(b => Math.min(...b.map(p => p.value)));

      const sampleMu  = round(mean(vals), dp);
      const dayAvgMu  = dMeans.length ? round(mean(dMeans), dp) : sampleMu;
      const dayHighMu = dMaxes.length ? round(mean(dMaxes), dp) : sampleMu;
      const dayLowMu  = dMins.length  ? round(mean(dMins),  dp) : sampleMu;
      const wkAvgMu   = wMeans.length ? round(mean(wMeans), dp) : sampleMu;
      const wkHighMu  = wMaxes.length ? round(mean(wMaxes), dp) : dayHighMu;
      const wkLowMu   = wMins.length  ? round(mean(wMins),  dp) : dayLowMu;
      const hourHighMu = hourHighs.length ? round(mean(hourHighs), dp) : dayHighMu;
      const hourLowMu  = hourLows.length  ? round(mean(hourLows),  dp) : dayLowMu;

      const sd = (arr) => arr.length >= 2 ? stdDev(arr) : 0;
      const dayAvgSd  = Math.max(sd(dMeans), sampleSd * 0.12, minSd);
      const dayHighSd = Math.max(sd(dMaxes), minSd * 1.4);
      const dayLowSd  = Math.max(sd(dMins),  minSd * 1.4);
      const wkAvgSd   = Math.max(sd(wMeans), sampleSd * 0.06, minSd * 0.5);
      const wkHighSd  = Math.max(sd(wMaxes), minSd);
      const wkLowSd   = Math.max(sd(wMins),  minSd);
      const hourHighSd = Math.max(sd(hourHighs), minSd * 1.1);
      const hourLowSd  = Math.max(sd(hourLows),  minSd * 1.1);

      stats = {
        stdDev: round(sampleSd, Math.max(dp, 1)),
        primaryCorrelation: PRIMARY_CORRELATIONS[name] || null,
        avgDist: {
          data: buildDistChart([
            { name: 'sample', mu: sampleMu, sigma: sampleSd },
            { name: 'daily',  mu: dayAvgMu, sigma: dayAvgSd  },
            { name: 'weekly', mu: wkAvgMu,  sigma: wkAvgSd   },
          ], dp),
          sampleMu, dailyMu: dayAvgMu, weeklyMu: wkAvgMu,
        },
        highDist: {
          data: buildDistChart([
            { name: 'hourly', mu: hourHighMu, sigma: hourHighSd },
            { name: 'daily',  mu: dayHighMu,  sigma: dayHighSd  },
            { name: 'weekly', mu: wkHighMu,   sigma: wkHighSd   },
          ], dp),
          hourlyMu: hourHighMu, dailyMu: dayHighMu, weeklyMu: wkHighMu,
        },
        lowDist: {
          data: buildDistChart([
            { name: 'hourly', mu: hourLowMu, sigma: hourLowSd },
            { name: 'daily',  mu: dayLowMu,  sigma: dayLowSd  },
            { name: 'weekly', mu: wkLowMu,   sigma: wkLowSd   },
          ], dp),
          hourlyMu: hourLowMu, dailyMu: dayLowMu, weeklyMu: wkLowMu,
        },
      };
    }

    res.json({
      name, metric, daily, stats,
      series:    series24.map(p  => ({ timestamp: p.timestamp, value: round(p.value, dp) })),
      overnight: overnight.map(p => ({ timestamp: p.timestamp, value: round(p.value, dp) })),
      monthly,
    });
  } catch (err) {
    console.error('/api/metric:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/correlations ────────────────────────────────────────────────────────

router.get('/correlations', async (_req, res) => {
  try {
    const result = await cachedQuery('correlations', 30 * 60_000, buildCorrelations);
    res.json(result);
  } catch (err) {
    console.error('/api/correlations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function buildCorrelations() {
  const [
    co2HourlyRows, noxHourlyRows,
    humidDailyRows,
    vocHourRows,
    vocWeekdayRows,
    pm25HourlyRows, humidHourlyRows,
    vpd24Rows,
    noxiousDailyCounts,
  ] = await Promise.all([
    query(Q.hourlyMeans(SENSOR_MAP.co2,      30)),
    query(Q.hourlyMeans(SENSOR_MAP.nox,      30)),
    query(Q.dailyMeans(30)),
    query(Q.vocByHour()),
    query(Q.vocByWeekday(SPIKE_THRESHOLDS.voc)),
    query(Q.hourlyMeans(SENSOR_MAP.pm2p5,    30)),
    query(Q.hourlyMeans(SENSOR_MAP.humidity, 30)),
    query(Q.series24h()),
    Promise.all(NOXIOUS_KEYS.map(key => {
      const t = SPIKE_THRESHOLDS[key];
      return t ? query(Q.dailySpikeCount(SENSOR_MAP[key], t, 30)) : Promise.resolve([]);
    })),
  ]);

  const humidDaily  = groupBySensor(humidDailyRows);
  const humidDailyPts = humidDaily.get(SENSOR_MAP.humidity) || [];

  // 1. CO2 vs NOx scatter
  const co2Hourly = (groupBySensor(co2HourlyRows)).get(SENSOR_MAP.co2) || [];
  const noxHourly = (groupBySensor(noxHourlyRows)).get(SENSOR_MAP.nox) || [];
  const co2NoxPairs = zipByTime(co2Hourly, noxHourly);
  const co2NoxR = pearson(co2NoxPairs.map(p => p.x), co2NoxPairs.map(p => p.y));

  // 2. Humidity vs noxious spike frequency
  const totalDailySpikes  = aggregateNoxiousDailySpikes(noxiousDailyCounts);
  const humidSpikePairs   = zipByDate(humidDailyPts, totalDailySpikes);
  const humidSpikeR = pearson(humidSpikePairs.map(p => p.x), humidSpikePairs.map(p => p.y));

  // 3. VOC by hour of day
  const vocHourData = vocHourRows.map(r => ({ hour: r.hour, avg: round(r._value, 0) })).sort((a, b) => a.hour - b.hour);

  // 4. Overnight humidity per night (daily means as proxy)
  const humidMeans = [...humidDailyPts].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map(p => ({ date: p.timestamp.slice(0, 10), humidity: round(p.value, 0) }));

  // 5. VOC weekday spikes
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const vocWdMap  = new Map(vocWeekdayRows.map(r => [r.weekday, r._value || 0]));
  const vocWeekData = DOW.map((day, i) => ({ day, spikes: vocWdMap.get(i) || 0 }));

  // 6. PM2.5 vs Humidity scatter
  const pm25Hourly    = (groupBySensor(pm25HourlyRows)).get(SENSOR_MAP.pm2p5)    || [];
  const humidHourly   = (groupBySensor(humidHourlyRows)).get(SENSOR_MAP.humidity) || [];
  const pm25HumidPairs = zipByTime(pm25Hourly, humidHourly);
  const pm25HumidR    = pearson(pm25HumidPairs.map(p => p.x), pm25HumidPairs.map(p => p.y));

  // 7. VPD (live 24h)
  const vpd24G    = groupBySensor(vpd24Rows);
  const tempPts24 = vpd24G.get(SENSOR_MAP.temperature) || [];
  const humidPts24 = vpd24G.get(SENSOR_MAP.humidity) || [];
  const vpdData   = zipByTime(tempPts24, humidPts24).map(p => {
    const tc = p.x, rh = p.y;
    const svp = 0.6108 * Math.exp(17.27 * tc / (tc + 237.3));
    return { timestamp: p.ts, vpd: round(svp * (1 - rh / 100), 3) };
  });

  const VPD_ZONES = [
    { y: 0,   label: 'Damp / mold risk', color: '#60a5fa' },
    { y: 0.4, label: 'Ideal',            color: '#39ff14' },
    { y: 0.8, label: 'Moderate stress',  color: '#facc15' },
    { y: 1.2, label: 'High stress',      color: '#f97316' },
    { y: 1.6, label: 'Severe stress',    color: '#ff4444' },
  ];

  return [
    { id: 'co2_nox', chartType: 'scatter', title: 'CO2 vs NOx Index', badge: 'Inverse', r: co2NoxR, xLabel: 'CO2 (ppm)', yLabel: 'NOx Index', data: co2NoxPairs.slice(0, 120), description: 'When CO2 rises (occupancy), NOx index tends to fall — combustion and occupancy peak at different times.', interpretation: 'Inverse relationship between indoor respiratory CO2 and outdoor-linked NOx infiltration.' },
    { id: 'humidity_spikes', chartType: 'scatter', title: 'Humidity vs Noxious Spike Frequency', badge: 'Positive', r: humidSpikeR, xLabel: 'Humidity (%)', yLabel: 'Spikes/day', data: humidSpikePairs.slice(0, 60), description: 'Higher humidity correlates with more noxious gas spike events — likely reduced ventilation in humid conditions.', interpretation: 'High humidity may suppress window-opening behavior, allowing CO, CH4, and H2 to accumulate.' },
    { id: 'voc_hour', chartType: 'bar_hour', title: 'VOC Index by Hour of Day', badge: 'Pattern', r: null, yLabel: 'VOC Index', data: vocHourData, description: 'Average VOC index by hour of day over the last 30 days.', interpretation: 'Evening peaks reflect cooking, cleaning products, or reduced ventilation. Morning dip reflects sleeping hours.' },
    { id: 'overnight_humidity_mold', chartType: 'line_threshold', title: 'Overnight Humidity — 30 Nights', badge: 'Mold Risk', r: null, threshold: 60, data: humidMeans, description: 'Daily average humidity over the last 30 days. Sustained levels above 60% create mold-risk conditions.', interpretation: 'Nights above 60% RH warrant attention — repeated high-humidity nights correlate with mold spore activity.' },
    { id: 'voc_weekday', chartType: 'bar_dow', title: 'VOC Spike Frequency by Weekday', badge: 'Behavioral', r: null, data: vocWeekData, description: `VOC spikes (>${SPIKE_THRESHOLDS.voc} index) by day of week over last 30 days.`, interpretation: 'Weekend spikes may reflect cleaning products or cooking. Weekday patterns suggest occupant routines.' },
    { id: 'pm25_humidity', chartType: 'scatter', title: 'PM2.5 vs Humidity', badge: 'Infiltration', r: pm25HumidR, xLabel: 'Humidity (%)', yLabel: 'PM2.5 (µg/m³)', data: pm25HumidPairs.slice(0, 120), description: 'Elevated humidity correlates with higher PM2.5 — hygroscopic growth and outdoor infiltration under humid weather.', interpretation: 'Humidity-driven particle growth increases apparent PM2.5 concentration at the sensor.' },
    { id: 'vpd', chartType: 'vpd', title: 'Vapor Pressure Deficit (VPD)', badge: 'Plant Health', r: null, zones: VPD_ZONES, data: vpdData, description: 'VPD computed from live temperature and humidity. Drives transpiration and indicates mold risk.', interpretation: 'VPD < 0.4 kPa = mold risk. > 1.2 kPa = plant stress. 0.4–0.8 kPa is the ideal growth zone.' },
  ];
}

// ── Correlation helpers ───────────────────────────────────────────────────────

function zipByTime(aPts, bPts) {
  const bMap = new Map(bPts.map(p => [new Date(p.timestamp).setMinutes(0, 0, 0), p]));
  return aPts.map(a => {
    const bucket = new Date(a.timestamp).setMinutes(0, 0, 0);
    const b = bMap.get(bucket);
    return b ? { x: round(a.value, 2), y: round(b.value, 2), ts: a.timestamp } : null;
  }).filter(Boolean);
}

function zipByDate(humidPts, spikesByDate) {
  const spikeMap = new Map(spikesByDate.map(s => [s.date, s.count]));
  return humidPts.map(p => {
    const date = p.timestamp.slice(0, 10);
    const count = spikeMap.get(date);
    return count != null ? { x: round(p.value, 0), y: count } : null;
  }).filter(Boolean);
}

function aggregateNoxiousDailySpikes(countsArrays) {
  const dateMap = new Map();
  for (const rows of countsArrays) {
    for (const r of rows) {
      const date = r._time.slice(0, 10);
      dateMap.set(date, (dateMap.get(date) || 0) + (r._value || 0));
    }
  }
  return Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));
}

module.exports = router;
