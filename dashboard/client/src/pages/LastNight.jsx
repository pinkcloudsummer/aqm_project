import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useOvernight } from '../hooks/useMetrics';
import { cToF } from '../lib/constants';

const FROM = { from: '/night', fromLabel: 'Overnight', fromIcon: '◑' };

function fmtHour(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function SummaryBox({ label, value, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-lg p-3 flex flex-col gap-0.5 border border-white/5 ${onClick ? 'cursor-pointer hover:border-white/20 active:scale-[0.98] transition-all' : ''}`}
    >
      <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
      <span className="font-mono text-lg font-medium text-primary leading-none">{value}</span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

function SpikeBox({ label, count, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-3 flex flex-col gap-0.5 border ${count > 0 ? 'border-warn/40 bg-warn/5' : 'border-white/5 bg-surface'} ${onClick ? 'cursor-pointer hover:border-white/30 active:scale-[0.98] transition-all' : ''}`}
    >
      <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
      <span className={`font-mono text-lg font-medium leading-none ${count > 0 ? 'text-warn' : 'text-muted'}`}>{count}</span>
      <span className="text-[10px] text-muted">spikes</span>
    </div>
  );
}

function OvernightChart({ series, dataKey = 'value', label, color = '#00e5a0', height = 150, formatter, metricKey, navigate }) {
  if (!series?.length) return null;
  const displayData = formatter ? series.map(p => ({ ...p, value: formatter(p.value) })) : series;
  return (
    <div className="mb-5">
      <div
        className={`text-xs text-muted uppercase tracking-wider mb-2 ${metricKey ? 'cursor-pointer hover:text-primary transition-colors inline-block' : ''}`}
        onClick={metricKey ? () => navigate(`/metric/${metricKey}`, { state: FROM }) : undefined}
      >
        {label}{metricKey && <span className="ml-1 text-[9px] opacity-50">→</span>}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="timestamp" tickFormatter={fmtHour} tick={{ fontSize: 10, fill: '#666' }} interval={23} />
          <YAxis tick={{ fontSize: 10, fill: '#666' }} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 6, fontSize: 11 }}
            labelFormatter={fmtHour}
            formatter={v => [v, label]}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ParticulatesChart({ series, navigate }) {
  const keys   = ['pm1', 'pm2p5', 'pm4', 'pm10'];
  const colors  = { pm1: '#60a5fa', pm2p5: '#818cf8', pm4: '#a78bfa', pm10: '#c084fc' };
  const labels  = { pm1: 'PM1.0', pm2p5: 'PM2.5', pm4: 'PM4.0', pm10: 'PM10' };
  const base    = series.pm2p5 || series.pm1 || [];
  if (!base.length) return null;
  const combined = base.map((p, i) => ({
    timestamp: p.timestamp,
    pm1:   series.pm1?.[i]?.value,
    pm2p5: series.pm2p5?.[i]?.value,
    pm4:   series.pm4?.[i]?.value,
    pm10:  series.pm10?.[i]?.value,
  }));
  return (
    <div className="mb-5">
      <div className="text-xs text-muted uppercase tracking-wider mb-2">Particulate Matter (µg/m³)</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={combined} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="timestamp" tickFormatter={fmtHour} tick={{ fontSize: 10, fill: '#666' }} interval={23} />
          <YAxis tick={{ fontSize: 10, fill: '#666' }} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #ffffff1a', borderRadius: 6, fontSize: 11 }} labelFormatter={fmtHour} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {keys.map(k => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[k]} strokeWidth={1.5} dot={false} isAnimationActive={false} name={labels[k]} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HighlightCard({ text, type }) {
  const styles = {
    anomaly: 'border-danger/40 text-danger bg-danger/5',
    tip:     'border-g-dark text-mint',
    info:    'border-white/10 text-muted',
  };
  return <div className={`border rounded-lg px-3 py-2 text-xs ${styles[type] || styles.info}`}>{text}</div>;
}

export default function LastNight() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useOvernight();

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (isError)   return <div className="flex items-center justify-center h-64 text-danger text-sm">Failed to load data</div>;

  const { series, highlights, start, end, tempLow, tempAvg, humidHigh, humidLow, humidAvg, overnightSpikes } = data;

  const goMetric = key => () => navigate(`/metric/${key}`, { state: FROM });

  const startDate = new Date(start);
  const endDate   = new Date(end);
  const dateRange = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} 10pm – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} 6am`;

  // Map overnightSpike keys to metric keys (nox spikes tracked under 'nox', etc.)
  const spikeMetricKey = key => key; // keys match metric keys directly

  return (
    <div className="px-4 pb-4 pt-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-semibold">Overnight</h1>
        <span className="text-xs text-muted">{dateRange}</span>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <SummaryBox label="Temp Low"  value={`${cToF(tempLow)}°`}  sub="°F" onClick={goMetric('temperature')} />
        <SummaryBox label="Temp Avg"  value={`${cToF(tempAvg)}°`}  sub="°F" onClick={goMetric('temperature')} />
        <SummaryBox label="Humid High" value={`${humidHigh}%`}              onClick={goMetric('humidity')} />
        <SummaryBox label="Humid Avg"  value={`${humidAvg}%`}              onClick={goMetric('humidity')} />
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <SummaryBox label="Humid Low" value={`${humidLow}%`} onClick={goMetric('humidity')} />
        {Object.entries(overnightSpikes || {}).slice(0, 3).map(([key, s]) => (
          <SpikeBox key={key} label={s.label} count={s.count} onClick={goMetric(spikeMetricKey(key))} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-5">
        {Object.entries(overnightSpikes || {}).slice(3).map(([key, s]) => (
          <SpikeBox key={key} label={s.label} count={s.count} onClick={goMetric(spikeMetricKey(key))} />
        ))}
      </div>

      {/* Time series — labels are clickable */}
      <OvernightChart series={series.co2}         label="CO2 (ppm)"        color="#39ff14" metricKey="co2"         navigate={navigate} />
      <OvernightChart series={series.no2}         label="NO2 (ppm)"        color="#00e5a0" metricKey="no2"         navigate={navigate} />
      <OvernightChart series={series.temperature} label="Temperature (°F)" color="#39ff14" metricKey="temperature" navigate={navigate} formatter={cToF} />
      <OvernightChart series={series.humidity}    label="Humidity (%)"     color="#00e5a0" metricKey="humidity"    navigate={navigate} />
      <OvernightChart series={series.o3}          label="O3 (ppb)"         color="#a78bfa" metricKey="o3"          navigate={navigate} />
      <ParticulatesChart series={series} navigate={navigate} />
      <OvernightChart series={series.nox}         label="NOx (index)"      color="#f97316" metricKey="nox"         navigate={navigate} />

      {/* Highlights */}
      {highlights?.length > 0 && (
        <>
          <div className="text-xs text-muted uppercase tracking-wider mb-2 mt-2">Analysis</div>
          <div className="flex flex-col gap-2">
            {highlights.map((h, i) => <HighlightCard key={i} {...h} />)}
          </div>
        </>
      )}
    </div>
  );
}
