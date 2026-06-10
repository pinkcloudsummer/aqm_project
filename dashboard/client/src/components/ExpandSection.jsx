import { useState } from 'react';

export default function ExpandSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted hover:text-primary transition-colors"
      >
        <span className="uppercase tracking-wider text-xs">{title}</span>
        <span className={`transition-transform text-xs ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
