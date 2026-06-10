import { useNavigate, useLocation } from 'react-router-dom';
import SparkLine from './SparkLine';
import { STATUS_COLORS, STATUS_DOT_COLORS, NAV_CONTEXT } from '../lib/constants';

const SPARK_COLORS = { good: '#00e5a0', moderate: '#ffaa00', poor: '#fb923c', alert: '#ff4444' };

// pct delta badge — for most metrics up is bad; for temp/humidity it's neutral
function DeltaBadge({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  const color = Math.abs(pct) < 2 ? 'text-muted' : up ? 'text-danger' : 'text-mint';
  return (
    <span className={`text-[10px] font-mono ${color}`}>
      {up ? '↑' : '↓'}{Math.abs(pct)}%
    </span>
  );
}

export default function MetricCard({ metricKey, label, value, unit, status = 'good', sparkline = [], pctDelta, dayAvg }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ctx = NAV_CONTEXT[location.pathname];

  return (
    <button
      onClick={() => navigate(`/metric/${metricKey}`, {
        state: { from: location.pathname, fromLabel: ctx?.label ?? 'Back', fromIcon: ctx?.icon },
      })}
      className="w-full text-left bg-surface rounded-lg px-3 py-2.5 flex flex-col gap-1.5 border border-white/5 hover:border-white/20 active:scale-[0.98] transition-all"
    >
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted uppercase tracking-wider leading-none">{label}</span>
        <div className="flex items-center gap-1.5">
          <DeltaBadge pct={pctDelta} />
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
        </div>
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-1">
        <span className={`font-mono text-xl font-medium leading-none ${STATUS_COLORS[status]}`}>{value}</span>
        <span className="text-muted text-[10px]">{unit}</span>
      </div>

      {/* Sparkline */}
      {sparkline.length > 0 && (
        <SparkLine data={sparkline} color={SPARK_COLORS[status]} />
      )}
    </button>
  );
}
