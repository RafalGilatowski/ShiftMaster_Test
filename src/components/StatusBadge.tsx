interface StatusBadgeProps {
  status: string;
  label?: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: 'Aktywne', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  fulfilled: { label: 'Sfinalizowane', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Anulowano', className: 'bg-red-50 text-red-700 border-red-200' },
  deadline_passed: { label: 'Zakończono składanie ofert', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending: { label: 'Oczekuje', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  sent: { label: 'Wysłano ofertę', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  accepted: { label: 'Zaakceptowana', className: 'bg-green-50 text-green-800 border-green-300' },
  rejected: { label: 'Odrzucona', className: 'bg-red-50 text-red-700 border-red-200' },
  finalized: { label: 'Sfinalizowane', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? { label: status, className: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
      {label ?? config.label}
    </span>
  );
}
