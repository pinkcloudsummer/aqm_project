import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { useTrends } from '../hooks/useMetrics';
import { TREND_METRICS, NOXIOUS_KEYS, cToF } from '../lib/constants';

const CHART_COLORS = { co2: '#39ff14', pm2p5: '#60a5fa', o3: '#a78bfa', no2: '#00e5a0', voc: '#facc15', temperature: '#f97316' };

// ── Shared micro-components ──────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
      {tabs.map(({ id, label, badge }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 ${
            active === id ? 'border-neon text-neon' : 'border-white/10 text-muted hover:text-primary'
          }`}
        >
          {label}
          {badge != null && badge > 0 && (
            <span className="bg-danger text-white text-[9px] rounded-full px-1 leading-tight">{badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="text-xs text-muted uppercase tracking-wider mb-2">{children}</div>;
}

// ── Week-over-Week: 2-col grid of mini bar charts ────────────────────────────

function MiniWoWChart({ data, metricKey }) {
  const isTemp   = metricKey === 'temperature';
  const fmt      = v => isTemp ? cToF(v) : v;
  const unit     = isTemp ? '°F' : data.unit;
  const chartData = data.labels.map((label, i) => ({
    label,
    'This week': fmt(data.thisWeek[i]),
    'Last week': fmt(data.lastWeek[i]),
  }));
  return (
    <div className="bg-surface rounded-lg p-2.5">
      <div className="text-[10px] text-muted uppercase tracking-wider mb-1">{data.label} <span className="text-[9px]">({unit})</span></div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#666' }} />
          <YAxis tick={{ fontSize: 9, fill: '#666' }} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
          <Bar dataKey="This week" fill="#39ff14" radius={[1,1,0,0]} />
          <Bar dataKey="Last week" fill="#1a3a2a"  radius={[1,1,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeekTab({ weekly }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {TREND_METRICS.map(key => weekly[key] && (
        <MiniWoWChart key={key} metricKey={key} data={weekly[key]} />
      ))}
    </div>
  );
}

// ── Month-over-Month: pct change bar chart + mini MoM bars ───────────────────

function MoMBar({ label, pct }) {
  const positive = pct > 0;
  const color    = positive ? '#ff4444' : '#39ff14'; // up=bad for most air quality metrics
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/5">
      <span className="text-xs text-muted w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-s2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(Math.abs(pct), 50) * 2}%`, background: color }}
        />
      </div>
      <span className={`text-xs font-mono w-12 text-right ${positive ? 'text-danger' : 'text-mint'}`}>
        {pct > 0 ? '+' : ''}{pct}%
      </span>
    </div>
  );
}

function MonthTab({ mom }) {
  return (
    <div className="bg-surface rounded-lg px-4 py-3">
      <SectionLabel>Month-to-date vs last month (% change)</SectionLabel>
      {TREND_METRICS.map(key => mom[key] && (
        <MoMBar key={key} label={mom[key].label} pct={mom[key].pctMoM} />
      ))}
      <p className="text-[10px] text-muted mt-3">Red = higher than last month (worse for most air quality metrics). Green = lower.</p>
    </div>
  );
}

// ── Overnight trends ─────────────────────────────────────────────────────────

function OvernightTrendChart({ data, metricKey }) {
  const isTemp   = metricKey === 'temperature';
  const fmt      = v => isTemp ? cToF(v) : v;
  const baseline = isTemp ? cToF(data.baseline) : data.baseline;
  const recent   = isTemp ? cToF(data.recent)   : data.recent;
  const unit     = isTemp ? '°F' : data.unit;
  const displayData = data.data.map(p => ({ ...p, avg: fmt(p.avg) }));
  const anomaly  = Math.abs(data.pctChange) >= 8;

  return (
    <div className={`rounded-lg p-3 mb-3 border ${anomaly ? 'border-warn/30 bg-warn/5' : 'border-white/5 bg-surface'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted uppercase tracking-wider">{data.label} overnight avg ({unit})</span>
        {anomaly && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${data.pctChange > 0 ? 'bg-danger/20 text-danger' : 'bg-mint/20 text-mint'}`}>
            {data.pctChange > 0 ? '↑' : '↓'}{Math.abs(data.pctChange)}% recent
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 9, fill: '#666' }} interval={6} />
          <YAxis tick={{ fontSize: 9, fill: '#666' }} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
          <Line type="monotone" dataKey="avg" stroke={CHART_COLORS[metricKey] || '#39ff14'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <ReferenceLine y={baseline} stroke="#555" strokeDasharray="4 2" label={{ value: `Hist avg`, position: 'insideTopLeft', fontSize: 9, fill: '#555' }} />
          {anomaly && <ReferenceLine y={recent} stroke={data.pctChange > 0 ? '#ff4444' : '#39ff14'} strokeDasharray="3 2" label={{ value: `Recent`, position: 'insideBottomRight', fontSize: 9, fill: data.pctChange > 0 ? '#ff4444' : '#39ff14' }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OvernightTab({ overnightTrends }) {
  return (
    <div>
      <SectionLabel>30-day overnight averages (10pm–6am) — reference lines show historical vs recent</SectionLabel>
      {Object.entries(overnightTrends).map(([key, d]) => (
        <OvernightTrendChart key={key} metricKey={key} data={d} />
      ))}
    </div>
  );
}

// ── Insights: anomaly cards with deviation time series ───────────────────────

function AnomalyChart({ anomaly }) {
  const isTemp = anomaly.key === 'temperature';
  const fmt    = v => isTemp ? cToF(v) : v;
  const unit   = isTemp ? '°F' : anomaly.unit;
  const bad    = anomaly.pctChange > 0;
  const displayData = anomaly.series.map(p => ({ ...p, avg: fmt(p.avg) }));
  const baseline = fmt(anomaly.baseline);
  const recent   = fmt(anomaly.recent);

  return (
    <div className={`rounded-lg p-3 mb-4 border ${bad ? 'border-danger/30 bg-danger/5' : 'border-mint/20 bg-mint/5'}`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className={`text-sm font-medium ${bad ? 'text-danger' : 'text-mint'}`}>{anomaly.label}</span>
          <span className="text-xs text-muted ml-2">7-day avg is significantly {bad ? 'higher' : 'lower'} than baseline</span>
        </div>
        <span className={`text-sm font-mono font-medium ${bad ? 'text-danger' : 'text-mint'}`}>
          {bad ? '↑' : '↓'}{Math.abs(anomaly.pctChange)}%
        </span>
      </div>
      <div className="flex gap-4 mb-2 text-[10px] text-muted">
        <span>Baseline (23-day avg): <span className="font-mono text-primary">{baseline} {unit}</span></span>
        <span>Recent (7-day avg): <span className={`font-mono ${bad ? 'text-danger' : 'text-mint'}`}>{recent} {unit}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 9, fill: '#666' }} interval={6} />
          <YAxis tick={{ fontSize: 9, fill: '#666' }} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
          <Line type="monotone" dataKey="avg" stroke={bad ? '#ff4444' : '#39ff14'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <ReferenceLine y={baseline} stroke="#555" strokeDasharray="4 2"
            label={{ value: `Baseline ${baseline}`, position: 'insideTopLeft', fontSize: 9, fill: '#666' }} />
          <ReferenceLine y={recent} stroke={bad ? '#ff4444' : '#39ff14'} strokeDasharray="3 1"
            label={{ value: `Recent ${recent}`, position: 'insideBottomRight', fontSize: 9, fill: bad ? '#ff4444' : '#39ff14' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpikeAnomalyChart({ anomaly }) {
  const bad = true; // elevated spikes are always concerning
  return (
    <div className="rounded-lg p-3 mb-4 border border-warn/30 bg-warn/5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="text-sm font-medium text-warn">{anomaly.label}</span>
          <span className="text-xs text-muted ml-2">spike frequency elevated in recent 7 days</span>
        </div>
        {anomaly.pctChange != null && (
          <span className="text-sm font-mono font-medium text-warn">↑{anomaly.pctChange}%</span>
        )}
      </div>
      <div className="flex gap-4 mb-2 text-[10px] text-muted">
        <span>Baseline avg/day: <span className="font-mono text-primary">{anomaly.baseline}</span></span>
        <span>Recent avg/day: <span className="font-mono text-warn">{anomaly.recent}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={anomaly.series} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
          <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 9, fill: '#666' }} interval={6} />
          <YAxis tick={{ fontSize: 9, fill: '#666' }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
          <Bar dataKey="count" fill="#ffaa00" radius={[2,2,0,0]} />
          {anomaly.baseline > 0 && (
            <ReferenceLine y={anomaly.baseline} stroke="#555" strokeDasharray="4 2"
              label={{ value: `Baseline ${anomaly.baseline}`, position: 'insideTopLeft', fontSize: 9, fill: '#666' }} />
          )}
          <ReferenceLine y={anomaly.recent} stroke="#ffaa00" strokeDasharray="3 1"
            label={{ value: `Recent ${anomaly.recent}`, position: 'insideBottomRight', fontSize: 9, fill: '#ffaa00' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightsTab({ anomalies, spikeAnomalies }) {
  const hasConc  = anomalies?.length > 0;
  const hasSpike = spikeAnomalies?.length > 0;
  if (!hasConc && !hasSpike) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="text-mint text-2xl">✓</span>
        <p className="text-sm text-muted">No anomalies detected</p>
        <p className="text-xs text-muted">All metrics are within normal historical ranges.</p>
      </div>
    );
  }
  return (
    <div>
      {hasConc && (
        <>
          <SectionLabel>Concentration anomalies — 7-day avg vs 23-day historical baseline</SectionLabel>
          {anomalies.map(a => <AnomalyChart key={a.key} anomaly={a} />)}
        </>
      )}
      {hasSpike && (
        <>
          <SectionLabel className="mt-4">Spike frequency anomalies — noxious gas events</SectionLabel>
          {spikeAnomalies.map(a => <SpikeAnomalyChart key={a.key} anomaly={a} />)}
        </>
      )}
    </div>
  );
}

// ── Spike count charts ───────────────────────────────────────────────────────

function SpikesSection({ spikesByDay }) {
  const [activeGas, setActiveGas] = useState('co');
  const gas = spikesByDay[activeGas];
  if (!gas) return null;
  const weekData = gas.week.labels.map((label, i) => ({ label, spikes: gas.week.data[i]?.count ?? 0 }));

  return (
    <div className="mt-6">
      <SectionLabel>Noxious gas spike counts</SectionLabel>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {NOXIOUS_KEYS.map(key => (
          <button key={key} onClick={() => setActiveGas(key)}
            className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${activeGas === key ? 'border-warn text-warn' : 'border-white/10 text-muted'}`}>
            {spikesByDay[key]?.label || key}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-surface rounded-lg p-2.5">
          <div className="text-[10px] text-muted mb-1">Spikes this week — {gas.label}</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={weekData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#666' }} />
              <YAxis tick={{ fontSize: 9, fill: '#666' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
              <Bar dataKey="spikes" fill="#ffaa00" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Trends() {
  const { data, isLoading, isError } = useTrends();
  const [tab, setTab] = useState('week');

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (isError)   return <div className="flex items-center justify-center h-64 text-danger text-sm">Failed to load data</div>;

  const { weekly, monthly, mom, spikesByDay, overnightTrends, anomalies, spikeAnomalies } = data;

  const tabs = [
    { id: 'week',      label: 'Week over Week' },
    { id: 'month',     label: 'Month over Month' },
    { id: 'overnight', label: 'Overnight' },
    { id: 'insights',  label: 'Insights', badge: (anomalies?.length ?? 0) + (spikeAnomalies?.length ?? 0) },
  ];

  return (
    <div className="px-4 pb-4 pt-6">
      <h1 className="text-lg font-semibold mb-4">Trends</h1>
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'week'      && <WeekTab weekly={weekly} />}
      {tab === 'week'      && <SpikesSection spikesByDay={spikesByDay} />}
      {tab === 'month'     && <MonthTab mom={mom} />}
      {tab === 'overnight' && <OvernightTab overnightTrends={overnightTrends} />}
      {tab === 'insights'  && <InsightsTab anomalies={anomalies} spikeAnomalies={spikeAnomalies} />}
    </div>
  );
}
