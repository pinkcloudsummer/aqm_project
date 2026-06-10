export default function AlertBanner({ alerts = [] }) {
  if (!alerts.length) return null;

  return (
    <div className="bg-danger/10 border border-danger/40 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
      <span className="text-danger text-lg leading-none mt-0.5">⚠</span>
      <div className="flex flex-col gap-1">
        {alerts.map((a, i) => (
          <p key={i} className="text-sm text-danger">{a}</p>
        ))}
      </div>
    </div>
  );
}
