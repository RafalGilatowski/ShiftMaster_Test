import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, FileText, ChevronDown, ChevronUp, Building2 } from 'lucide-react';
import { supabase, Offer, OfferDepartment } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../StatusBadge';

interface OfferDeptWithName extends OfferDepartment {
  department_name?: string;
  days_count?: number;
  workers_needed?: number;
}

interface OfferWithOrder extends Offer {
  orders: {
    plant: string;
    department: string;
    workers_needed: number;
    start_date: string;
    days_count: number;
  } | null;
  offerDepts: OfferDeptWithName[];
  expanded: boolean;
}

const SHIFT_LABELS: Record<string, string> = {
  '06:00 - 14:00': 'Zmiana I',
  '14:00 - 22:00': 'Zmiana II',
};

function formatPLN(v: number) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(v);
}

export default function MyOffers() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<OfferWithOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('offers')
      .select('*, orders(plant, department, workers_needed, start_date, days_count)')
      .eq('supplier_id', user.id)
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const enriched = await Promise.all(
      data.map(async (offer) => {
        const { data: depts } = await supabase
          .from('offer_departments')
          .select('*, order_departments(department, days_count, workers_needed)')
          .eq('offer_id', offer.id);

        const offerDepts: OfferDeptWithName[] = (depts ?? []).map((d: any) => ({
          ...d,
          department_name: d.order_departments?.department,
          days_count: d.order_departments?.days_count,
          workers_needed: d.order_departments?.workers_needed,
        }));

        return { ...offer, orders: (offer as any).orders ?? null, offerDepts, expanded: false };
      })
    );

    setOffers(enriched as OfferWithOrder[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('my-offers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  function toggle(id: string) {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, expanded: !o.expanded } : o));
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-sokolow-600 animate-spin" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <FileText className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-slate-600 font-medium">Brak złożonych ofert</p>
        <p className="text-slate-400 text-sm mt-1">Przejdź do zakładki "Zapotrzebowania", aby złożyć swoją pierwszą ofertę.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Moje oferty</h2>
          <p className="text-slate-500 text-sm mt-0.5">Historia złożonych ofert i ich statusy</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Odśwież
        </button>
      </div>

      <div className="space-y-3">
        {offers.map(offer => {
          const totalCost = offer.offerDepts.length > 0
            ? offer.offerDepts.reduce((sum, od) => {
                const shifts = od.selected_shifts?.length || 1;
                return sum + od.confirmed_workers * (od.days_count ?? 1) * 8 * Number(od.rate_per_hour) * shifts;
              }, 0)
            : 0;

          return (
            <div key={offer.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden
              ${offer.status === 'accepted' ? 'border-emerald-200' : offer.status === 'rejected' ? 'border-red-100' : 'border-slate-200'}`}>
              <div className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">{offer.orders?.plant ?? '—'}</span>
                      <StatusBadge status={offer.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                      {offer.offerDepts.length > 0 ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" />
                          {offer.offerDepts.length} {offer.offerDepts.length === 1 ? 'wydział' : 'wydziałów'}
                        </span>
                      ) : (
                        <span>{offer.orders?.department ?? '—'}</span>
                      )}
                      <span className="text-slate-300">·</span>
                      <span>{new Date(offer.availability_date).toLocaleDateString('pl-PL')}</span>
                      <span className="text-slate-300">·</span>
                      <span>{new Date(offer.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                  {totalCost > 0 && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-400">Wartość oferty</p>
                      <p className="text-sm font-bold text-slate-800">{formatPLN(totalCost)}</p>
                    </div>
                  )}
                </div>

                {offer.offerDepts.length > 0 && (
                  <button
                    onClick={() => toggle(offer.id)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-sokolow-600 hover:text-sokolow-700 font-medium"
                  >
                    {offer.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {offer.expanded ? 'Ukryj' : 'Pokaż'} szczegóły wydziałów
                  </button>
                )}
              </div>

              {offer.expanded && offer.offerDepts.length > 0 && (
                <div className="border-t border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-5 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Wydział</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Pracownicy</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Zmiany</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Stawka RBH</th>
                          <th className="text-right px-5 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Koszt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {offer.offerDepts.map(od => {
                          const shifts = od.selected_shifts?.length || 1;
                          const cost = od.confirmed_workers * (od.days_count ?? 1) * 8 * Number(od.rate_per_hour) * shifts;
                          return (
                            <tr key={od.id} className="hover:bg-slate-50 bg-white">
                              <td className="px-5 py-2.5 font-medium text-slate-700">{od.department_name ?? '—'}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="font-semibold text-slate-800">{od.confirmed_workers}</span>
                                {od.workers_needed && (
                                  <span className="text-slate-400 ml-1">/ {od.workers_needed}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex gap-1">
                                  {(od.selected_shifts ?? []).map(s => {
                                    const isI = s.startsWith('06');
                                    return (
                                      <span key={s} className={`px-1.5 py-0.5 rounded font-semibold
                                        ${isI ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {SHIFT_LABELS[s] ?? s}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                                {Number(od.rate_per_hour).toFixed(2)} PLN
                              </td>
                              <td className="px-5 py-2.5 text-right font-bold text-slate-800">
                                {formatPLN(cost)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
