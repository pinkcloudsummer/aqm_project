import { useNavigate } from 'react-router-dom';
import MetricCard    from '../components/MetricCard';
import AlertBanner   from '../components/AlertBanner';
import { useCurrent } from '../hooks/useMetrics';
import { PRIMARY_METRICS, PARTICULATE_METRICS, MICS_METRICS, SEN0132_METRICS, BMP388_METRICS, cToF } from '../lib/constants';

const FROM = { from: '/', fromLabel: 'Now', fromIcon: '◉' };

function SpikeCountCard({ label, count, onClick }) {
  const hasSpike = count > 0;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg px-3 py-2 border transition-all active:scale-[0.98] ${hasSpike ? 'border-warn/40 bg-warn/5' : 'border-white/5 bg-surface'} hover:border-white/20`}
    >
      <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`font-mono text-lg font-medium leading-none ${hasSpike ? 'text-warn' : 'text-muted'}`}>{count}</div>
      <div className="text-[10px] text-muted mt-0.5">spikes today</div>
    </button>
  );
}

export default function Current() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCurrent();

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (isError)   return <div className="flex items-center justify-center h-64 text-danger text-sm">Failed to load data</div>;

  const { metrics, alerts, timestamp, noxiousSpikes } = data;
  const t = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  const card = key => {
    const m = metrics[key];
    if (!m) return null;
    const isTemp = key === 'temperature';
    const displayValue = isTemp ? cToF(m.value) : m.value;
    const displayUnit  = isTemp ? '°F' : m.unit;
    return (
      <MetricCard
        key={key}
        metricKey={key}
        label={m.label}
        value={displayValue}
        unit={displayUnit}
        status={m.status}
        sparkline={m.sparkline}
        pctDelta={m.pctDelta}
        dayAvg={isTemp ? cToF(m.dayAvg) : m.dayAvg}
      />
    );
  };

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between pt-6 pb-3">
        <h1 className="text-lg font-semibold">Air Quality</h1>
        <span className="text-xs text-muted">Updated {t}</span>
      </div>

      <AlertBanner alerts={alerts} />

      {/* Primary 2-col grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {PRIMARY_METRICS.map(card)}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-muted">Particulates</div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {PARTICULATE_METRICS.map(card)}
          </div>
        </div>

        {/* MICS: spike counts, not concentrations */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-muted">Multi-Gas (MiCS-4514)</div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {MICS_METRICS.map(key => {
              const spike = noxiousSpikes?.[key] ?? metrics[key];
              const label = spike?.label || key.toUpperCase();
              const count = spike?.count ?? 0;
              return <SpikeCountCard key={key} label={label} count={count}
                onClick={() => navigate(`/metric/${key}`, { state: FROM })} />;
            })}
          </div>
        </div>

        {/* Analog NO2 sensor */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-muted">NO2 Analog (SEN0574)</div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {['no2_rs', 'no2_ratio'].map(card)}
          </div>
        </div>

        {/* Dedicated CO sensor */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-muted">CO Analog (SEN0132)</div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {SEN0132_METRICS.map(card)}
          </div>
        </div>

        {/* Barometric pressure */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-muted">Barometric (BMP388)</div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {BMP388_METRICS.map(card)}
          </div>
        </div>
      </div>
    </div>
  );
}
