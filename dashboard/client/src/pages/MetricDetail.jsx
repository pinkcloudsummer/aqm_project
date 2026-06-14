import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useMetricDetail } from '../hooks/useMetrics';
import { STATUS_COLORS, STATUS_DOT_COLORS, cToF, METRIC_NAV, hPaToInHg } from '../lib/constants';

function StatBox({ label, value, unit }) {
  return (
    <div className="bg-s2 rounded-lg p-3 flex flex-col gap-0.5">
      <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
      <span className="font-mono text-lg text-primary leading-none">{value} <span className="text-[10px] text-muted">{unit}</span></span>
    </div>
  );
}

function SpikeBox({ label, count }) {
  const hasSpike = count > 0;
  return (
    <div className={`rounded-lg p-3 flex flex-col gap-0.5 border ${hasSpike ? 'border-warn/40 bg-warn/5' : 'border-white/5 bg-s2'}`}>
      <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
      <span className={`font-mono text-lg leading-none ${hasSpike ? 'text-warn' : 'text-muted'}`}>{count ?? 0}</span>
    </div>
  );
}

function MoMRow({ label, thisVal, lastVal, pct, unit }) {
  const bad = pct > 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 gap-2">
      <span className="text-xs text-muted w-20 flex-shrink-0">{label}</span>
      <div className="flex gap-3 text-xs font-mono flex-1">
        <span className="text-muted">{lastVal} <span className="text-[10px]">{unit}</span></span>
        <span className="text-primary">→</span>
        <span className="text-primary">{thisVal} <span className="text-[10px]">{unit}</span></span>
      </div>
      <span className={`text-xs font-mono ${bad ? 'text-danger' : 'text-mint'}`}>
        {pct > 0 ? '↑' : '↓'}{Math.abs(pct)}%
      </span>
    </div>
  );
}

function TimeSeriesChart({ series, color = '#39ff14', label, isTemp }) {
  if (!series?.length) return null;
  const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const displayData = isTemp ? series.map(p => ({ ...p, value: cToF(p.value) })) : series;
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="timestamp" tickFormatter={fmtTime} tick={{ fontSize: 10, fill: '#666' }} interval={23} />
        <YAxis tick={{ fontSize: 10, fill: '#666' }} />
        <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 6, fontSize: 11 }}
          labelFormatter={fmtTime} formatter={v => [v, label]} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// SCALE_META drives the 3 distribution charts — each groups one statistic across time scales
const SCALE_CHARTS = [
  {
    key: 'avgDist',
    label: 'Average distribution',
    subtitle: 'Narrows as scale grows — Law of Large Numbers',
    curves: [
      { dataKey: 'sample', label: 'Sample',  color: '#60a5fa' },
      { dataKey: 'daily',  label: 'Daily',   color: '#39ff14' },
      { dataKey: 'weekly', label: 'Weekly',  color: '#f97316' },
    ],
    muKeys: ['sampleMu', 'dailyMu', 'weeklyMu'],
  },
  {
    key: 'highDist',
    label: 'Peak distribution',
    subtitle: 'Peaks shift right at larger aggregation scales',
    curves: [
      { dataKey: 'hourly', label: 'Hourly',  color: '#60a5fa' },
      { dataKey: 'daily',  label: 'Daily',   color: '#39ff14' },
      { dataKey: 'weekly', label: 'Weekly',  color: '#f97316' },
    ],
    muKeys: ['hourlyMu', 'dailyMu', 'weeklyMu'],
  },
  {
    key: 'lowDist',
    label: 'Trough distribution',
    subtitle: 'Troughs shift left at larger aggregation scales',
    curves: [
      { dataKey: 'hourly', label: 'Hourly',  color: '#60a5fa' },
      { dataKey: 'daily',  label: 'Daily',   color: '#39ff14' },
      { dataKey: 'weekly', label: 'Weekly',  color: '#f97316' },
    ],
    muKeys: ['hourlyMu', 'dailyMu', 'weeklyMu'],
  },
];

function DistributionChart({ dist, meta, unit, isTemp }) {
  if (!dist?.data?.length) return null;
  const fmtMu = v => v != null ? (isTemp ? cToF(v) : v) : '—';
  const displayData = isTemp
    ? dist.data.map(p => ({ ...p, x: Math.round(cToF(p.x) * 10) / 10 }))
    : dist.data;
  const nameMap = Object.fromEntries(meta.curves.map(c => [c.dataKey, `${c.label} density`]));
  return (
    <div className="mb-4">
      <div className="text-xs text-muted uppercase tracking-wider mb-0.5">{meta.label}</div>
      <div className="text-[9px] text-muted/60 italic mb-1.5">{meta.subtitle}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5 text-[9px] text-muted">
        {meta.curves.map((c, i) => (
          <span key={c.dataKey} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-px" style={{ background: c.color }} />
            {c.label} ({fmtMu(dist[meta.muKeys[i]])} {unit})
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="x" tick={{ fontSize: 9, fill: '#666' }} interval="preserveStartEnd" />
          <YAxis hide />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }}
            formatter={(v, name) => [v.toFixed(4), nameMap[name] || name]} />
          {meta.curves.map(c => (
            <Area key={c.dataKey} type="monotone" dataKey={c.dataKey}
              stroke={c.color} fill={`${c.color}18`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MetricDetail() {
  const { name }   = useParams();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { data, isLoading, isError } = useMetricDetail(name);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (isError)   return <div className="flex items-center justify-center h-64 text-danger text-sm">Failed to load</div>;

  const { metric, daily, series, overnight, monthly, stats } = data;
  const isTemp      = name === 'temperature';
  const isPressure  = name === 'pressure';
  const displayVal  = isTemp ? cToF(metric.value) : (isPressure ? hPaToInHg(metric.value) : metric.value);
  const displayUnit = isTemp ? '°F' : (isPressure ? 'inHg' : metric.unit);
  const fmtVal      = v => v != null ? (isTemp ? cToF(v) : (isPressure ? hPaToInHg(v) : v)) : '—';
  const fromLabel   = location.state?.fromLabel;
  const metricInfo  = METRIC_NAV[name];

  return (
    <div className="px-4 pb-4 pt-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-muted hover:text-primary text-sm">
          ← {fromLabel || 'Back'}
        </button>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[metric.status]}`} />
          <h1 className="text-lg font-semibold">{metric.label}</h1>
        </div>
      </div>

      {/* Current big readout */}
      <div className="bg-surface rounded-xl p-6 mb-4 text-center border border-white/5">
        <div className={`font-mono text-5xl font-medium ${STATUS_COLORS[metric.status]}`}>{displayVal}</div>
        <div className="text-muted text-sm mt-1">{displayUnit}</div>
      </div>

      {/* Daily stats */}
      {daily && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatBox label="1hr Avg"    value={fmtVal(daily.avg1h)}    unit={displayUnit} />
          <StatBox label="6hr Avg"    value={fmtVal(daily.avg6h)}    unit={displayUnit} />
          <StatBox label="12hr Avg"   value={fmtVal(daily.avg12h)}   unit={displayUnit} />
          <StatBox label="Daily High" value={fmtVal(daily.dailyHigh)} unit={displayUnit} />
        </div>
      )}

      {/* 24h time series */}
      {series?.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Last 24 hours</div>
          <TimeSeriesChart series={series} color="#39ff14" label={metric.label} isTemp={isTemp} />
        </div>
      )}

      {/* Overnight */}
      {overnight?.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Last night (10pm–6am)</div>
          <TimeSeriesChart series={overnight} color="#00e5a0" label={metric.label} isTemp={isTemp} />
        </div>
      )}

      {/* 30-day trend */}
      {monthly?.data?.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-2">30-day average</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart
              data={isTemp ? monthly.data.map(p => ({ ...p, avg: cToF(p.avg) })) : monthly.data}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 10, fill: '#666' }} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: '#666' }} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 6, fontSize: 11 }} />
              <Line type="monotone" dataKey="avg" stroke="#39ff14" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month-over-Month comparison */}
      {(metric.mtdAvg != null || metric.lastMonthAvg != null) && (
        <div className="mb-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Month over Month</div>
          <div className="bg-surface rounded-lg px-3 py-1">
            <MoMRow
              label="Value avg"
              thisVal={fmtVal(metric.mtdAvg)}
              lastVal={fmtVal(metric.lastMonthAvg)}
              pct={metric.pctMoM}
              unit={displayUnit}
            />
          </div>
        </div>
      )}

      {/* Spike counts — bottom of page */}
      <div className="text-xs text-muted uppercase tracking-wider mb-2">Spike events</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <SpikeBox label="Last 24h"      count={metric.spikes24h}       />
        <SpikeBox label="This month"    count={metric.spikesThisMonth} />
        <SpikeBox label="Last month"    count={metric.spikesLastMonth} />
        <SpikeBox label="30-day total"  count={metric.spikesMonth}     />
      </div>

      {/* Statistics section */}
      {stats && (
        <div className="mt-5 border-t border-white/5 pt-5">
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Statistics</div>

          {/* σ and ρ row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface rounded-lg p-3 flex flex-col gap-0.5">
              <span className="text-[10px] text-muted">Std Deviation (σ)</span>
              <span className="font-mono text-lg text-primary leading-none">
                {isTemp ? cToF(stats.stdDev) : stats.stdDev}
                <span className="text-[10px] text-muted ml-1">{displayUnit}</span>
              </span>
            </div>
            {stats.primaryCorrelation ? (
              <button
                onClick={() => navigate('/correlations', {
                  state: { from: location.pathname, fromLabel: metric.label, fromIcon: metricInfo?.icon },
                })}
                className="bg-surface rounded-lg p-3 flex flex-col gap-0.5 hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-[10px] text-muted">Correlation (ρ)</span>
                <span className="font-mono text-lg text-primary leading-none">
                  {stats.primaryCorrelation.r > 0 ? '+' : ''}{stats.primaryCorrelation.r}
                </span>
                <span className="text-[10px] text-mint">↔ {stats.primaryCorrelation.label} — view all →</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/correlations', {
                  state: { from: location.pathname, fromLabel: metric.label, fromIcon: metricInfo?.icon },
                })}
                className="bg-surface rounded-lg p-3 flex flex-col gap-0.5 hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-[10px] text-muted">Correlations (ρ)</span>
                <span className="text-xs text-mint mt-1">View all →</span>
              </button>
            )}
          </div>

          <DistributionChart dist={stats.avgDist}  meta={SCALE_CHARTS[0]} unit={displayUnit} isTemp={isTemp} />
          <DistributionChart dist={stats.highDist} meta={SCALE_CHARTS[1]} unit={displayUnit} isTemp={isTemp} />
          <DistributionChart dist={stats.lowDist}  meta={SCALE_CHARTS[2]} unit={displayUnit} isTemp={isTemp} />
        </div>
      )}
    </div>
  );
}
