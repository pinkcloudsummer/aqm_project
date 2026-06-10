import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Current      from './pages/Current';
import DailySummary from './pages/DailySummary';
import LastNight    from './pages/LastNight';
import Trends       from './pages/Trends';
import MetricDetail from './pages/MetricDetail';
import Correlations from './pages/Correlations';
import { NAV_ITEMS, METRIC_NAV } from './lib/constants';

function BottomNav() {
  const location = useLocation();
  const navigate  = useNavigate();

  const isMetricPage = location.pathname.startsWith('/metric/');
  const metricKey    = isMetricPage ? location.pathname.split('/')[2] : null;
  const metricInfo   = metricKey ? (METRIC_NAV[metricKey] || { icon: '◎', label: metricKey }) : null;

  // Which main tab to transform into the back button (default to Now if no state)
  const fromPath = location.state?.from ?? (isMetricPage ? '/' : null);

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-surface border-t border-white/10 flex">
      {NAV_ITEMS.map(({ to, label, icon }) => {
        const isBackSlot = isMetricPage && fromPath === to;

        if (isBackSlot) {
          return (
            <button
              key={to}
              onClick={() => navigate(-1)}
              className="flex-1 flex flex-col items-center py-3 gap-0.5 text-xs text-neon"
            >
              <span className="text-sm leading-none font-mono tracking-tight">{metricInfo.icon}</span>
              <span className="text-[9px] leading-tight">{metricInfo.label}</span>
            </button>
          );
        }

        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors ` +
              (isActive && !isMetricPage ? 'text-neon' : 'text-muted hover:text-primary')
            }
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function App() {
  return (
    <div className="flex flex-col min-h-screen max-w-2xl mx-auto">
      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/"             element={<Current />} />
          <Route path="/daily"        element={<DailySummary />} />
          <Route path="/night"        element={<LastNight />} />
          <Route path="/trends"       element={<Trends />} />
          <Route path="/metric/:name" element={<MetricDetail />} />
          <Route path="/correlations" element={<Correlations />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
