import { useNavigate, useLocation } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useCorrelations } from '../hooks/useMetrics';

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Per-chart-type renderers ─────────────────────────────────────────────────

function ScatterCorr({ item }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ScatterChart margin={{ top: 4, right: 8, left: -20, bottom: 16 }}>
        <XAxis type="number" dataKey="x" name="x" tick={{ fontSize: 9, fill: '#666' }}
          label={{ value: item.xLabel, position: 'insideBottom', offset: -8, fontSize: 9, fill: '#555' }} />
        <YAxis type="number" dataKey="y" name="y" tick={{ fontSize: 9, fill: '#666' }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }}
          formatter={(v, n) => [v, n === 'x' ? item.xLabel : item.yLabel]} />
        <Scatter data={item.data} fill="#39ff14" opacity={0.65} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function BarHour({ item }) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={item.data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#666' }} interval={3} />
        <YAxis tick={{ fontSize: 9, fill: '#666' }} />
        <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
        <Bar dataKey="avg" name={item.yLabel} fill="#facc15" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineThreshold({ item }) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <LineChart data={item.data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 9, fill: '#666' }} interval={6} />
        <YAxis tick={{ fontSize: 9, fill: '#666' }} domain={[40, 75]} />
        <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
        <ReferenceLine y={item.threshold} stroke="#ff4444" strokeDasharray="4 2"
          label={{ value: `${item.threshold}% mold risk`, position: 'insideTopRight', fontSize: 9, fill: '#ff4444' }} />
        <Line type="monotone" dataKey="humidity" name="Overnight RH %" stroke="#00e5a0"
          strokeWidth={1.5} dot={{ r: 2, fill: '#00e5a0' }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarDow({ item }) {
  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={item.data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666' }} />
        <YAxis tick={{ fontSize: 9, fill: '#666' }} allowDecimals={false} />
        <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }} />
        <Bar dataKey="spikes" name="VOC spikes" fill="#a78bfa" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VpdChart({ item }) {
  const ZONE_COLORS = { 0: '#60a5fa', 0.4: '#39ff14', 0.8: '#facc15', 1.2: '#f97316', 1.6: '#ff4444' };
  return (
    <div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
        {item.zones.map(z => (
          <span key={z.y} className="text-[9px] flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: z.color, opacity: 0.7 }} />
            <span className="text-muted">{z.label}</span>
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={item.data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="timestamp" tickFormatter={fmtTime} tick={{ fontSize: 9, fill: '#666' }} interval={23} />
          <YAxis tick={{ fontSize: 9, fill: '#666' }} domain={[0, 2.2]} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 4, fontSize: 10 }}
            labelFormatter={fmtTime} formatter={v => [`${v} kPa`, 'VPD']} />
          {item.zones.slice(1).map(z => (
            <ReferenceLine key={z.y} y={z.y} stroke={z.color} strokeDasharray="3 2" strokeOpacity={0.45} />
          ))}
          <Line type="monotone" dataKey="vpd" stroke="#39ff14" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CorrelationChart({ item }) {
  switch (item.chartType) {
    case 'scatter':         return <ScatterCorr item={item} />;
    case 'bar_hour':        return <BarHour item={item} />;
    case 'line_threshold':  return <LineThreshold item={item} />;
    case 'bar_dow':         return <BarDow item={item} />;
    case 'vpd':             return <VpdChart item={item} />;
    default: return null;
  }
}

function CorrelationCard({ item }) {
  return (
    <div className="bg-surface rounded-xl p-4 mb-4 border border-white/5">
      <div className="flex items-start justify-between mb-1 gap-2">
        <h2 className="text-sm font-semibold leading-tight">{item.title}</h2>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {item.r != null && (
            <span className="text-xs font-mono text-mint">ρ={item.r > 0 ? '+' : ''}{item.r}</span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/8 text-muted border border-white/10">{item.badge}</span>
        </div>
      </div>
      <p className="text-xs text-muted mb-3 leading-relaxed">{item.description}</p>
      <CorrelationChart item={item} />
      <p className="text-[10px] text-muted italic mt-2 leading-relaxed border-t border-white/5 pt-2">{item.interpretation}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Correlations() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading, isError } = useCorrelations();
  const fromLabel = location.state?.fromLabel;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (isError)   return <div className="flex items-center justify-center h-64 text-danger text-sm">Failed to load</div>;

  return (
    <div className="px-4 pb-4 pt-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="text-muted hover:text-primary text-sm">
          ← {fromLabel || 'Back'}
        </button>
        <div>
          <h1 className="text-lg font-semibold">Correlations</h1>
          <p className="text-[10px] text-muted">Cross-metric relationships &amp; environmental patterns</p>
        </div>
      </div>

      <div className="bg-surface/50 rounded-lg px-3 py-2 mb-5 border border-white/5">
        <p className="text-[10px] text-muted leading-relaxed">
          ρ (rho) is the Pearson correlation coefficient: +1 = perfect positive, −1 = perfect inverse, 0 = no linear relationship.
          Correlations here are computed from Phase 0 fixture data and annotated with real-world interpretation.
        </p>
      </div>

      {data.map(item => <CorrelationCard key={item.id} item={item} />)}
    </div>
  );
}
