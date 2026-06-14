import { useNavigate } from 'react-router-dom';
import { useDaily } from '../hooks/useMetrics';
import { cToF, hPaToInHg } from '../lib/constants';

const FROM = { from: '/daily', fromLabel: 'Daily', fromIcon: '◈' };

function PctBadge({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <span className={`text-xs font-mono ${up ? 'text-danger' : 'text-mint'}`}>
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  );
}

function SpikeCard({ label, count, lastAt, onClick }) {
  const t = lastAt ? new Date(lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-lg p-3 border ${count > 0 ? 'border-warn/40' : 'border-white/5'} ${onClick ? 'cursor-pointer hover:border-white/20 active:scale-[0.98] transition-all' : ''}`}
    >
      <div className="text-xs text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-xl ${count > 0 ? 'text-warn' : 'text-muted'}`}>{count}</div>
      {count > 0 && t && <div className="text-xs text-muted mt-0.5">last at {t}</div>}
      {count === 0 && <div className="text-xs text-muted mt-0.5">no spikes</div>}
    </div>
  );
}

const COLS = ['Current', '1hr Avg', '6hr Avg', '12hr Avg'];

export default function DailySummary() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useDaily();

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (isError)   return <div className="flex items-center justify-center h-64 text-danger text-sm">Failed to load data</div>;

  const { metrics, spikes } = data;
  const rows = Object.entries(metrics);

  const goMetric = key => () => navigate(`/metric/${key}`, { state: FROM });

  return (
    <div className="px-4 pb-4 pt-6">
      <h1 className="text-lg font-semibold mb-4">Daily Summary</h1>

      <div className="overflow-x-auto -mx-4 px-4 mb-6">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="text-muted border-b border-white/10">
              <th className="text-left pb-2 pr-3 uppercase tracking-wider">Metric</th>
              {COLS.map(c => <th key={c} className="text-right pb-2 px-2 uppercase tracking-wider">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, m]) => (
              <tr
                key={key}
                onClick={goMetric(key)}
                className="border-b border-white/5 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <td className="py-2 pr-3 text-muted">{m.label}</td>
                <td className="py-2 px-2 text-right font-mono text-primary">{m.label == 'Temperature' ? cToF(m.current) : (m.label == 'Pressure' ? hPaToInHg(m.current) : m.current)} <span className="text-muted">{m.unit}</span></td>
                <td className="py-2 px-2 text-right font-mono text-muted">{m.label == 'Temperature' ? cToF(m.avg1h) : (m.label == 'Pressure' ? hPaToInHg(m.avg1h) : m.avg1h)}</td>
                <td className="py-2 px-2 text-right font-mono text-muted">{m.label == 'Temperature' ? cToF(m.avg6h) : (m.label == 'Pressure' ? hPaToInHg(m.avg6h) : m.avg6h)}</td>
                <td className="py-2 px-2 text-right font-mono text-muted">{m.label == 'Temperature' ? cToF(m.avg12h) : (m.label == 'Pressure' ? hPaToInHg(m.avg12h) : m.avg12h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm text-muted uppercase tracking-wider mb-3">Spike Events (24h)</h2>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(spikes).map(([key, s]) => (
          <SpikeCard key={key} label={s.label} count={s.count} lastAt={s.lastAt} onClick={goMetric(key)} />
        ))}
      </div>
    </div>
  );
}
