import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Users, Calendar, Send, CheckCircle, ChevronDown, ChevronUp, Building2, Clock, Lock, Pencil } from 'lucide-react';
import { supabase, Order, OrderDepartment, Offer, OfferDepartment } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../StatusBadge';
import OfferForm from './OfferForm';

interface ExistingOffer {
  id: string;
  availability_date: string;
  offerDepts: OfferDepartment[];
}

interface OrderWithDepts extends Order {
  departments: OrderDepartment[];
  myOffer: Offer | null;
  myOfferDepts: OfferDepartment[];
  expanded: boolean;
}

const SHIFT_LABELS: Record<string, string> = {
  '06:00 - 14:00': 'Zmiana I',
  '14:00 - 22:00': 'Zmiana II',
};

function isDeadlinePassed(order: Order): boolean {
  if (!order.offer_deadline) return false;
  return Date.now() > new Date(order.offer_deadline).getTime();
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithDepts[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDepts | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!ordersData) { setLoading(false); return; }

    const enriched = await Promise.all(
      ordersData.map(async (order) => {
        const [{ data: depts }, { data: offer }] = await Promise.all([
          supabase.from('order_departments').select('*').eq('order_id', order.id).order('created_at', { ascending: true }),
          supabase.from('offers').select('*').eq('order_id', order.id).eq('supplier_id', user.id).maybeSingle(),
        ]);

        let myOfferDepts: OfferDepartment[] = [];
        if (offer) {
          const { data: offerDepts } = await supabase
            .from('offer_departments')
            .select('*')
            .eq('offer_id', offer.id);
          myOfferDepts = offerDepts ?? [];
        }

        return {
          ...order,
          departments: depts ?? [],
          myOffer: offer ?? null,
          myOfferDepts,
          expanded: false,
        };
      })
    );

    setOrders(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('supplier-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offer_departments' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  function toggle(id: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, expanded: !o.expanded } : o));
  }

  function handleOfferSent() {
    fetchData();
    setSelectedOrder(null);
  }

  function openForm(order: OrderWithDepts) {
    setSelectedOrder(order);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-sokolow-600 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Users className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-slate-600 font-medium">Brak aktywnych zapotrzebowań</p>
        <p className="text-slate-400 text-sm mt-1">Aktualnie nie ma żadnych otwartych zleceń. Sprawdź ponownie później.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Aktywne zapotrzebowania</h2>
            <p className="text-slate-500 text-sm mt-0.5">Otwarte zlecenia oczekujące na Twoją ofertę</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Odśwież
          </button>
        </div>

        {orders.map(order => {
          const totalWorkers = order.departments.length > 0
            ? order.departments.reduce((s, d) => s + d.workers_needed, 0)
            : order.workers_needed;
          const deadlinePassed = isDeadlinePassed(order);
          const hasOffer = !!order.myOffer;
          const canEdit = hasOffer && !deadlinePassed;

          const coveredDeptIds = new Set(order.myOfferDepts.map(od => od.order_department_id));
          const coveredCount = order.departments.length > 0
            ? order.departments.filter(d => coveredDeptIds.has(d.id)).length
            : (hasOffer ? 1 : 0);
          const isPartial = hasOffer && order.departments.length > 0 && coveredCount < order.departments.length;

          return (
            <div
              key={order.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200
                ${hasOffer ? 'border-emerald-200' : deadlinePassed ? 'border-amber-200' : 'border-slate-200'}`}
            >
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800">{order.plant}</h3>
                      <StatusBadge status={order.status} />
                      {hasOffer && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          {isPartial ? `Oferta częściowa (${coveredCount}/${order.departments.length} wydziałów)` : 'Oferta złożona'}
                        </span>
                      )}
                      {deadlinePassed && !hasOffer && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                          <Lock className="w-3 h-3" />
                          Zakończono przyjmowanie ofert
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        {order.departments.length > 0
                          ? `${order.departments.length} ${order.departments.length === 1 ? 'wydział' : 'wydziałów'}`
                          : order.department}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <strong className="text-slate-700">{totalWorkers}</strong>&nbsp;pracowników łącznie
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Od {new Date(order.start_date).toLocaleDateString('pl-PL')}
                      </span>
                      {order.offer_deadline && (
                        <span className={`flex items-center gap-1 ${deadlinePassed ? 'text-amber-600 font-medium' : ''}`}>
                          <Clock className="w-3.5 h-3.5" />
                          Deadline: {formatDeadline(order.offer_deadline)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex flex-col gap-2 items-end">
                    {hasOffer ? (
                      <>
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium">
                          <CheckCircle className="w-4 h-4" />
                          Złożono ofertę
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => openForm(order)}
                            className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 hover:text-amber-800 font-semibold px-4 py-1.5 rounded-lg text-xs transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edytuj ofertę
                          </button>
                        )}
                        {deadlinePassed && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Edycja zablokowana (deadline minął)
                          </span>
                        )}
                      </>
                    ) : deadlinePassed ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium">
                        <Lock className="w-4 h-4" />
                        Termin minął
                      </div>
                    ) : (
                      <button
                        onClick={() => openForm(order)}
                        className="flex items-center gap-2 bg-sokolow-600 hover:bg-sokolow-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition shadow-sm"
                      >
                        <Send className="w-4 h-4" />
                        Złóż ofertę
                      </button>
                    )}
                  </div>
                </div>

                {/* My offer summary */}
                {hasOffer && order.myOfferDepts.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5">
                    {order.departments.map(dept => {
                      const od = order.myOfferDepts.find(d => d.order_department_id === dept.id);
                      return (
                        <div key={dept.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs
                          ${od ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100 opacity-60'}`}
                        >
                          <span className={`font-medium ${od ? 'text-slate-700' : 'text-slate-400'}`}>{dept.department}</span>
                          {od ? (
                            <span className="text-emerald-700 font-semibold">
                              {od.confirmed_workers} os. · {Number(od.rate_per_hour).toFixed(2)} PLN/RBH
                              {od.selected_shifts.map(s => (
                                <span key={s} className="ml-1 px-1.5 py-0.5 bg-emerald-100 rounded text-emerald-600">
                                  {s.startsWith('06') ? 'I' : 'II'}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">brak oferty na ten wydział</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {order.departments.length > 0 && !hasOffer && (
                  <button
                    onClick={() => toggle(order.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-sokolow-600 hover:text-sokolow-700 font-medium"
                  >
                    {order.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {order.expanded ? 'Ukryj' : 'Pokaż'} podział na wydziały
                  </button>
                )}
              </div>

              {order.expanded && order.departments.length > 0 && !hasOffer && (
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 space-y-2">
                  {order.departments.map((dept, idx) => (
                    <div key={dept.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-100">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-800">{dept.department}</span>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                          <span><strong className="text-slate-700">{dept.workers_needed}</strong> os.</span>
                          <span><strong className="text-slate-700">{dept.days_count}</strong> dni</span>
                          <span>od {new Date(dept.start_date).toLocaleDateString('pl-PL')}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {dept.required_shifts.map(s => {
                          const isI = s.startsWith('06');
                          return (
                            <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-semibold
                              ${isI ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                              {SHIFT_LABELS[s] ?? s}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-6 pb-4">
                <span className="text-xs text-slate-400">
                  Zamówiono: {new Date(order.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedOrder && (
        <OfferForm
          order={selectedOrder}
          departments={selectedOrder.departments}
          existingOffer={
            selectedOrder.myOffer
              ? { id: selectedOrder.myOffer.id, availability_date: selectedOrder.myOffer.availability_date, offerDepts: selectedOrder.myOfferDepts }
              : null
          }
          onClose={() => setSelectedOrder(null)}
          onOfferSent={handleOfferSent}
        />
      )}
    </>
  );
}
