import { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw, ChevronDown, ChevronUp, Users, Calendar, Clock,
  TrendingDown, CheckCircle2, XCircle, Award, CheckCheck, AlertCircle,
  Building2, Ban, History, AlertTriangle, ShieldCheck, FileDown, Pencil, X,
} from 'lucide-react';
import { supabase, Order, OrderDepartment, Offer, OfferDepartment, OfferHistoryLog } from '../../lib/supabase';
import StatusBadge from '../StatusBadge';

// ─── Active-supplier filter ───────────────────────────────────────────────────
// A supplier is "active" when their email exists in the invitations table with
// status='accepted'. If the manager deleted the invitation row the supplier is
// considered removed and must NOT receive any email notifications.

async function getActiveSupplierEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const { data } = await supabase
    .from('invitations')
    .select('email')
    .in('email', emails)
    .eq('status', 'accepted');
  const activeSet = new Set((data ?? []).map(r => r.email as string));
  return emails.filter(e => activeSet.has(e));
}

// Same but resolves supplier profile IDs → emails, then filters actives.
async function getActiveEmailsForSupplierIds(supplierIds: string[]): Promise<string[]> {
  if (supplierIds.length === 0) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', supplierIds)
    .neq('email', '');
  const allEmails = (profiles ?? []).map(p => p.email as string).filter(Boolean);
  return getActiveSupplierEmails(allEmails);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfferWithDepts extends Offer {
  offerDepts: OfferDepartment[];
  historyLogs: OfferHistoryLog[];
}

interface OrderWithData extends Order {
  departments: OrderDepartment[];
  offers: OfferWithDepts[];
  expanded: boolean;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPLN(v: number) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(v);
}

function formatDeadline(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SHIFT_META: Record<string, { label: string; short: string }> = {
  '06:00 - 14:00': { label: 'Zmiana I', short: '6:00–14:00' },
  '14:00 - 22:00': { label: 'Zmiana II', short: '14:00–22:00' },
};

function calcDeptCost(od: OfferDepartment, dept: OrderDepartment): number {
  const shifts = od.selected_shifts?.length || 1;
  return od.confirmed_workers * dept.days_count * 8 * Number(od.rate_per_hour) * shifts;
}

function calcOfferTotal(offer: OfferWithDepts, depts: OrderDepartment[]): number {
  if (offer.offerDepts.length > 0) {
    return offer.offerDepts.reduce((sum, od) => {
      const dept = depts.find(d => d.id === od.order_department_id);
      return dept ? sum + calcDeptCost(od, dept) : sum;
    }, 0);
  }
  const shifts = offer.selected_shifts?.length || 1;
  const days = depts[0]?.days_count ?? 1;
  return offer.confirmed_workers * days * 8 * Number(offer.rate_per_hour) * shifts;
}

// Dashboard shows only 'active' orders (and those awaiting decision after deadline, up to 5 days).
// 'fulfilled' and 'cancelled' orders are NEVER shown on the dashboard regardless of deadline.
function isOrderVisibleOnDashboard(order: OrderWithData): boolean {
  if (order.status === 'fulfilled' || order.status === 'cancelled') return false;
  if (order.status !== 'active') return false;
  if (!order.offer_deadline) return true;
  const deadline = new Date(order.offer_deadline).getTime();
  const now = Date.now();
  if (now <= deadline) return true;
  const fiveDays = 5 * 24 * 60 * 60 * 1000;
  return now - deadline <= fiveDays;
}

// History shows only orders with terminal statuses.
function isOrderInHistory(order: OrderWithData): boolean {
  if (order.status === 'fulfilled' || order.status === 'cancelled') return true;
  // Also include active orders that are past the 5-day grace window
  if (order.status === 'active' && order.offer_deadline) {
    const fiveDays = 5 * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(order.offer_deadline).getTime() > fiveDays;
  }
  return false;
}

function isDeadlinePassed(order: Order): boolean {
  if (!order.offer_deadline) return false;
  return Date.now() > new Date(order.offer_deadline).getTime();
}

// ─── Confirmation modals ──────────────────────────────────────────────────────

interface CancelModalProps {
  plantName: string;
  offersCount: number;
  onConfirm: () => void;
  onClose: () => void;
}

function CancelConfirmModal({ plantName, offersCount, onConfirm, onClose }: CancelModalProps) {
  const hasOffers = offersCount > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-7 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">
              {hasOffers
                ? 'Anulowanie postępowania ze złożonymi ofertami'
                : 'Czy na pewno chcesz anulować to postępowanie?'}
            </h2>
          </div>
        </div>

        {hasOffers ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-red-700">Uwaga!</p>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Na to zapytanie ofertowe dostawcy złożyli już{' '}
              <span className="font-bold text-slate-800">{offersCount} {offersCount === 1 ? 'ofertę' : offersCount < 5 ? 'oferty' : 'ofert'}</span>.
              Czy na pewno chcesz anulować to postępowanie? Wszystkie złożone oferty zostaną odrzucone,
              a system automatycznie wyśle powiadomienia mailowe do zaangażowanych agencji.{' '}
              <span className="font-semibold">Akcji nie można cofnąć.</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600 leading-relaxed">
            Ta akcja przeniesie zamówienie dla zakładu{' '}
            <span className="font-semibold text-slate-800">{plantName}</span> do Historii ze statusem{' '}
            <span className="font-semibold text-red-700">Anulowano</span>. Dostawcy nie będą mogli już składać ofert.{' '}
            <span className="font-semibold">Akcji nie można cofnąć.</span>
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Wróć
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition shadow-sm"
          >
            {hasOffers ? 'Potwierdzam, anuluj i powiadom agencje' : 'Tak, anuluj postępowanie'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AcceptModalProps {
  supplierName: string;
  totalValue: number;
  onConfirm: () => void;
  onClose: () => void;
}

function AcceptConfirmModal({ supplierName, totalValue, onConfirm, onClose }: AcceptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-7 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">
              Potwierdzenie wyboru dostawcy
            </h2>
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Czy na pewno chcesz zaakceptować ofertę firmy{' '}
          <span className="font-semibold text-slate-800">{supplierName}</span> na kwotę{' '}
          <span className="font-semibold text-emerald-700">{formatPLN(totalValue)}</span>?
          Wszystkie pozostałe oferty w tym postępowaniu zostaną automatycznie odrzucone, a zamówienie zostanie sfinalizowane.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Wróć
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition shadow-sm"
          >
            Zatwierdź i wybierz dostawcę
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportHistoryToCSV(orders: OrderWithData[]) {
  const HEADERS = [
    'ID Postępowania',
    'Zakład',
    'Wydział',
    'Liczba Pracowników',
    'Liczba Dni',
    'Data Startu',
    'Wnioskowane Zmiany',
    'Nazwa Agencji',
    'Stawka za 1 RBH (PLN)',
    'Oferowane Zmiany',
    'Koszt Całkowity Oferty (PLN)',
    'Decyzja',
    'Wersja Oferty',
    'Data Modyfikacji',
  ];

  const rows: string[][] = [];

  function pushRow(
    order: OrderWithData,
    dept: OrderDepartment,
    supplierName: string,
    rate: number,
    offeredShifts: string[],
    workers: number,
    decision: string,
    versionLabel: string,
    modifiedAt: string,
  ) {
    const requiredShiftsLabel = (dept.required_shifts ?? []).map(s => SHIFT_META[s]?.label ?? s).join(', ');
    const offeredShiftsLabel = offeredShifts.map(s => SHIFT_META[s]?.label ?? s).join(', ');
    const days = dept.days_count || 1;
    const shiftsCount = offeredShifts.length || 1;
    const totalCost = workers * days * 8 * shiftsCount * rate;
    rows.push([
      csvCell(order.id), csvCell(order.plant), csvCell(dept.department),
      csvCell(workers), csvCell(days),
      csvCell(dept.start_date ? new Date(dept.start_date).toLocaleDateString('pl-PL') : ''),
      csvCell(requiredShiftsLabel),
      csvCell(supplierName),
      csvCell(rate.toFixed(2)), csvCell(offeredShiftsLabel),
      csvCell(totalCost.toFixed(2)),
      csvCell(decision),
      csvCell(versionLabel),
      csvCell(modifiedAt),
    ]);
  }

  for (const order of orders) {
    const isCancelled = order.status === 'cancelled';
    const depts = order.departments;

    const deptList = depts.length > 0 ? depts : [{
      id: '',
      department: order.department ?? '',
      workers_needed: order.workers_needed,
      days_count: 0,
      start_date: order.start_date,
      required_shifts: order.required_shifts ?? [],
    } as unknown as OrderDepartment];

    if (order.offers.length === 0) {
      for (const dept of deptList) {
        const requiredShiftsLabel = (dept.required_shifts ?? []).map(s => SHIFT_META[s]?.label ?? s).join(', ');
        rows.push([
          csvCell(order.id), csvCell(order.plant), csvCell(dept.department),
          csvCell(dept.workers_needed), csvCell(dept.days_count),
          csvCell(dept.start_date ? new Date(dept.start_date).toLocaleDateString('pl-PL') : ''),
          csvCell(requiredShiftsLabel),
          csvCell(''), csvCell(''), csvCell(''), csvCell(''),
          csvCell(isCancelled ? 'Anulowano (Brak ofert)' : ''),
          csvCell(''), csvCell(''),
        ]);
      }
      continue;
    }

    for (const offer of order.offers) {
      const supplierName = (offer.profiles as any)?.company_name || (offer.profiles as any)?.full_name || '';

      let currentDecision: string;
      if (isCancelled) currentDecision = 'Postępowanie anulowane';
      else if (offer.status === 'accepted') currentDecision = 'Wybrana';
      else currentDecision = 'Odrzucona';

      // Compute current version number = max history version + 1 (or 1 if no edits)
      const maxHistVer = offer.historyLogs.length > 0
        ? Math.max(...offer.historyLogs.map(h => h.version))
        : 0;
      const currentVersion = maxHistVer + 1;
      const currentModifiedAt = offer.updated_at
        ? new Date(offer.updated_at).toLocaleString('pl-PL')
        : new Date(offer.created_at).toLocaleString('pl-PL');

      for (const dept of deptList) {
        // ── Historical rows for this dept ──
        const deptHistory = offer.historyLogs.filter(h => h.order_department_id === dept.id);
        for (const hlog of deptHistory) {
          pushRow(
            order, dept, supplierName,
            Number(hlog.rate_per_hour),
            hlog.selected_shifts ?? [],
            hlog.confirmed_workers,
            'Archiwalna wersja oferty',
            `Wersja ${hlog.version}`,
            new Date(hlog.recorded_at).toLocaleString('pl-PL'),
          );
        }

        // ── Current (active) row ──
        const od = offer.offerDepts.find(d => d.order_department_id === dept.id);

        if (!od && offer.offerDepts.length > 0) {
          const requiredShiftsLabel = (dept.required_shifts ?? []).map(s => SHIFT_META[s]?.label ?? s).join(', ');
          rows.push([
            csvCell(order.id), csvCell(order.plant), csvCell(dept.department),
            csvCell(dept.workers_needed), csvCell(dept.days_count),
            csvCell(dept.start_date ? new Date(dept.start_date).toLocaleDateString('pl-PL') : ''),
            csvCell(requiredShiftsLabel),
            csvCell(supplierName),
            csvCell(''), csvCell(''), csvCell(''),
            csvCell('Brak oferty od tej agencji'),
            csvCell(`Wersja ${currentVersion}`), csvCell(currentModifiedAt),
          ]);
          continue;
        }

        const rate = od ? Number(od.rate_per_hour) : Number(offer.rate_per_hour);
        const offeredShifts = od ? (od.selected_shifts ?? []) : (offer.selected_shifts ?? []);
        const workers = od ? od.confirmed_workers : offer.confirmed_workers;

        pushRow(
          order, dept, supplierName,
          rate, offeredShifts, workers,
          currentDecision,
          `Wersja ${currentVersion}`,
          currentModifiedAt,
        );
      }
    }
  }

  const csvContent = '\uFEFF'
    + HEADERS.join(';')
    + '\n'
    + rows.map(r => r.join(';')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historia_zamowien_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OffersTableProps {
  view: 'active' | 'history';
}

interface PendingAccept {
  offerId: string;
  order: OrderWithData;
  supplierName: string;
  totalValue: number;
}

export default function OffersTable({ view }: OffersTableProps) {
  const [orders, setOrders] = useState<OrderWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<OrderWithData | null>(null);
  const [acceptConfirm, setAcceptConfirm] = useState<PendingAccept | null>(null);
  const toastId = useRef(0);

  function addToast(message: string, type: Toast['type'] = 'success') {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, profiles(full_name, company_name)')
      .order('created_at', { ascending: false });

    if (!ordersData) { setLoading(false); return; }

    const enriched = await Promise.all(
      ordersData.map(async (order) => {
        const [{ data: depts }, { data: offersRaw }] = await Promise.all([
          supabase.from('order_departments').select('*').eq('order_id', order.id).order('created_at', { ascending: true }),
          supabase.from('offers').select('*, profiles(full_name, company_name)').eq('order_id', order.id),
        ]);

        const offers: OfferWithDepts[] = await Promise.all(
          (offersRaw ?? []).map(async (offer) => {
            const [{ data: offerDepts }, { data: historyLogs }] = await Promise.all([
              supabase.from('offer_departments').select('*').eq('offer_id', offer.id),
              supabase.from('offer_history_logs').select('*').eq('offer_id', offer.id).order('version', { ascending: true }).order('recorded_at', { ascending: true }),
            ]);
            return { ...offer, offerDepts: offerDepts ?? [], historyLogs: historyLogs ?? [] };
          })
        );

        return {
          ...order,
          departments: depts ?? [],
          offers,
          expanded: true,
        };
      })
    );

    setOrders(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Separate channels per table — avoids a single-channel event flood and
    // ensures DELETE+INSERT on offer_departments each trigger a reload.
    const chOffers = supabase
      .channel('rt-offers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'offers' }, fetchData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'offers' }, fetchData)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'offers' }, fetchData)
      .subscribe();

    const chOrders = supabase
      .channel('rt-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .subscribe();

    const chDepts = supabase
      .channel('rt-offer-depts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'offer_departments' }, fetchData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'offer_departments' }, fetchData)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'offer_departments' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(chOffers);
      supabase.removeChannel(chOrders);
      supabase.removeChannel(chDepts);
    };
  }, [fetchData]);

  function toggleExpand(id: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, expanded: !o.expanded } : o));
  }

  function requestAccept(offerId: string, order: OrderWithData) {
    const offer = order.offers.find(o => o.id === offerId);
    const supplierName = (offer?.profiles as any)?.company_name
      || (offer?.profiles as any)?.full_name
      || 'Dostawca';
    const totalValue = offer ? calcOfferTotal(offer as OfferWithDepts, order.departments) : 0;
    setAcceptConfirm({ offerId, order, supplierName, totalValue });
  }

  async function confirmAccept() {
    if (!acceptConfirm) return;
    const { offerId, order, supplierName, totalValue } = acceptConfirm;
    setAcceptConfirm(null);
    setAccepting(offerId);

    const { error: e1 } = await supabase.from('offers').update({ status: 'accepted' }).eq('id', offerId);
    if (e1) { addToast('Błąd: ' + e1.message, 'error'); setAccepting(null); return; }

    const otherOffers = order.offers.filter(o => o.id !== offerId);
    const otherIds = otherOffers.map(o => o.id);
    if (otherIds.length > 0) {
      await supabase.from('offers').update({ status: 'rejected' }).in('id', otherIds);
    }

    await supabase.from('orders').update({ status: 'fulfilled' }).eq('id', order.id);
    addToast(`Oferta zaakceptowana. Postępowanie sfinalizowane — dostawca: ${supplierName}.`);

    try {
      const winnerOffer = order.offers.find(o => o.id === offerId);
      const winnerId = winnerOffer?.supplier_id;

      const { data: { session } } = await supabase.auth.getSession();

      // Resolve all supplier emails and filter out removed suppliers
      const allSupplierIds = [...new Set(order.offers.map(o => o.supplier_id).filter(Boolean))];
      const { data: supplierProfiles } = await supabase
        .from('profiles').select('id, email').in('id', allSupplierIds).neq('email', '');

      const profileMap = new Map((supplierProfiles ?? []).map(p => [p.id, p.email as string]));

      const rawWinnerEmail = winnerId ? (profileMap.get(winnerId) ?? '') : '';
      const rawLoserEmails = otherOffers
        .map(o => o.supplier_id ? profileMap.get(o.supplier_id) ?? '' : '')
        .filter(Boolean);

      const allRawEmails = [...new Set([rawWinnerEmail, ...rawLoserEmails].filter(Boolean))];
      const activeEmails = await getActiveSupplierEmails(allRawEmails);
      const activeSet = new Set(activeEmails);

      const winnerEmail = activeSet.has(rawWinnerEmail) ? rawWinnerEmail : '';
      const loserEmails = rawLoserEmails.filter(e => activeSet.has(e));

      console.log('Lista aktywnych dostawców do wysyłki powiadomienia (accept):', activeEmails);

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          type: 'accept',
          orderId: order.id,
          plant: order.plant,
          winnerEmail,
          winnerName: supplierName,
          loserEmails,
          departments: order.departments.map(d => ({
            department: d.department,
            workersNeeded: d.workers_needed,
            daysCount: d.days_count,
            startDate: d.start_date,
            requiredShifts: d.required_shifts ?? [],
          })),
          totalValue,
        }),
      });
    } catch (_) {}

    setAccepting(null);
    fetchData();
  }

  function requestCancel(order: OrderWithData) {
    setCancelConfirm(order);
  }

  async function confirmCancel() {
    if (!cancelConfirm) return;
    const order = cancelConfirm;
    setCancelConfirm(null);
    setCancelling(order.id);

    // Cancel the order
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    if (error) {
      addToast('Błąd podczas anulowania: ' + error.message, 'error');
      setCancelling(null);
      return;
    }

    // Mark all pending offers on this order as rejected
    const offerIds = order.offers.map(o => o.id);
    if (offerIds.length > 0) {
      await supabase
        .from('offers')
        .update({ status: 'rejected' })
        .in('id', offerIds)
        .eq('status', 'pending');
    }

    addToast(
      order.offers.length > 0
        ? 'Postępowanie anulowane. Powiadomienia wysłane do agencji, które złożyły oferty.'
        : 'Postępowanie zostało anulowane i przeniesione do Historii zamówień.'
    );

    // Send cancellation emails only to active suppliers who submitted offers
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const supplierIds = [...new Set(order.offers.map(o => o.supplier_id).filter(Boolean))];
      const recipientEmails = await getActiveEmailsForSupplierIds(supplierIds);

      console.log('Lista aktywnych dostawców do wysyłki powiadomienia (cancel):', recipientEmails);

      if (recipientEmails.length > 0) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            type: 'cancel_with_offers',
            orderId: order.id,
            plant: order.plant,
            recipientEmails,
          }),
        });
      }
    } catch (_) {}

    setCancelling(null);
    fetchData();
  }

  // Partition orders by view
  const visibleOrders = orders.filter(o =>
    view === 'active' ? isOrderVisibleOnDashboard(o) : isOrderInHistory(o)
  );

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-sokolow-600 animate-spin" />
      </div>
    );
  }

  if (visibleOrders.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          {view === 'history'
            ? <History className="w-6 h-6 text-slate-400" />
            : <Users className="w-6 h-6 text-slate-400" />
          }
        </div>
        <p className="text-slate-600 font-medium">
          {view === 'history' ? 'Brak zamówień w historii' : 'Brak aktywnych postępowań'}
        </p>
        <p className="text-slate-400 text-sm mt-1">
          {view === 'history'
            ? 'Sfinalizowane i anulowane zamówienia pojawią się tutaj.'
            : 'Złóż pierwsze zamówienie korzystając z formularza.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view === 'history' && visibleOrders.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => exportHistoryToCSV(visibleOrders)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            <FileDown className="w-4 h-4" />
            Eksportuj historię do Excela
          </button>
        </div>
      )}
      {visibleOrders.map(order => (
        <OrderCard
          key={order.id}
          order={order}
          view={view}
          onToggle={() => toggleExpand(order.id)}
          onAccept={id => requestAccept(id, order)}
          onCancel={() => requestCancel(order)}
          accepting={accepting}
          cancelling={cancelling}
        />
      ))}

      {cancelConfirm && (
        <CancelConfirmModal
          plantName={cancelConfirm.plant}
          offersCount={cancelConfirm.offers.length}
          onConfirm={confirmCancel}
          onClose={() => setCancelConfirm(null)}
        />
      )}

      {acceptConfirm && (
        <AcceptConfirmModal
          supplierName={acceptConfirm.supplierName}
          totalValue={acceptConfirm.totalValue}
          onConfirm={confirmAccept}
          onClose={() => setAcceptConfirm(null)}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-start gap-3 px-5 py-4 rounded-xl shadow-xl border text-sm font-medium max-w-sm pointer-events-auto
            ${t.type === 'success' ? 'bg-white border-emerald-200 text-slate-800' : 'bg-white border-red-200 text-red-700'}`}>
            {t.type === 'success'
              ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            }
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HistoryPopover ───────────────────────────────────────────────────────────

interface HistoryPopoverProps {
  offer: OfferWithDepts;
  departments: OrderDepartment[];
  onClose: () => void;
}

function HistoryPopover({ offer, departments, onClose }: HistoryPopoverProps) {
  const supplierName = (offer.profiles as any)?.company_name || (offer.profiles as any)?.full_name || '—';

  // Group history by version
  const byVersion = new Map<number, OfferHistoryLog[]>();
  for (const log of offer.historyLogs) {
    if (!byVersion.has(log.version)) byVersion.set(log.version, []);
    byVersion.get(log.version)!.push(log);
  }
  const maxHistVer = offer.historyLogs.length > 0
    ? Math.max(...offer.historyLogs.map(h => h.version))
    : 0;
  const currentVersion = maxHistVer + 1;

  const versions = [...byVersion.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Historia edycji oferty</h3>
            <p className="text-xs text-slate-500 mt-0.5">{supplierName} · {versions.length} edycj{versions.length === 1 ? 'a' : 'i'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Current version */}
          <div className="border border-emerald-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">Wersja {currentVersion} — Aktualna</span>
              <span className="text-xs text-slate-400 ml-auto">
                {offer.updated_at
                  ? new Date(offer.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : new Date(offer.created_at).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold text-slate-500">Wydział</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-500">Pracownicy</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-500">Stawka RBH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {departments.map(dept => {
                  const od = offer.offerDepts.find(d => d.order_department_id === dept.id);
                  return (
                    <tr key={dept.id} className={!od ? 'opacity-40' : ''}>
                      <td className="px-4 py-2 font-medium text-slate-700">{dept.department}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{od ? od.confirmed_workers : '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-700">{od ? `${Number(od.rate_per_hour).toFixed(2)} PLN` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Historical versions — newest first */}
          {versions.map(([ver, logs]) => {
            const sampleLog = logs[0];
            return (
              <div key={ver} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">Wersja {ver} — Archiwalna</span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {new Date(sampleLog.recorded_at).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">Wydział</th>
                      <th className="text-center px-3 py-2 font-semibold text-slate-500">Pracownicy</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-500">Stawka RBH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {departments.map(dept => {
                      const log = logs.find(l => l.order_department_id === dept.id);
                      return (
                        <tr key={dept.id} className={!log ? 'opacity-40' : ''}>
                          <td className="px-4 py-2 font-medium text-slate-600">{dept.department}</td>
                          <td className="px-3 py-2 text-center text-slate-500">{log ? log.confirmed_workers : '—'}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-500">{log ? `${Number(log.rate_per_hour).toFixed(2)} PLN` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── OrderCard ────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: OrderWithData;
  view: 'active' | 'history';
  onToggle: () => void;
  onAccept: (id: string) => void;
  onCancel: () => void;
  accepting: string | null;
  cancelling: string | null;
}

function OrderCard({ order, view, onToggle, onAccept, onCancel, accepting, cancelling }: OrderCardProps) {
  const [expandedOfferIds, setExpandedOfferIds] = useState<Set<string>>(new Set());
  const [historyOffer, setHistoryOffer] = useState<OfferWithDepts | null>(null);

  const isActive = order.status === 'active';
  const isCancelled = order.status === 'cancelled';
  const isFulfilled = order.status === 'fulfilled';
  const deadlinePassed = isDeadlinePassed(order);

  const acceptedOffer = order.offers.find(o => o.status === 'accepted');
  const acceptedSupplierName = (acceptedOffer?.profiles as any)?.company_name
    || (acceptedOffer?.profiles as any)?.full_name
    || '';
  const acceptedTotal = acceptedOffer ? calcOfferTotal(acceptedOffer, order.departments) : 0;

  const sortedOffers = [...order.offers].sort(
    (a, b) => calcOfferTotal(a, order.departments) - calcOfferTotal(b, order.departments)
  );
  const lowestId = sortedOffers[0]?.id;

  const totalWorkersNeeded = order.departments.length > 0
    ? order.departments.reduce((s, d) => s + d.workers_needed, 0)
    : order.workers_needed;

  function toggleOfferDrilldown(id: string) {
    setExpandedOfferIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const cardBorder = isCancelled
    ? 'border-red-200'
    : isFulfilled
      ? 'border-emerald-200'
      : deadlinePassed && isActive
        ? 'border-amber-200'
        : 'border-slate-200';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${cardBorder}`}>
      {/* Order header */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-start gap-4 text-left transition hover:bg-slate-50/60"
      >
        <div className={`w-1 self-stretch rounded-full flex-shrink-0
          ${isCancelled ? 'bg-red-400' : isFulfilled ? 'bg-emerald-400' : deadlinePassed ? 'bg-amber-400' : 'bg-sokolow-500'}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{order.plant}</span>

            {/* Status annotation */}
            {isCancelled && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                <Ban className="w-3 h-3" />
                Anulowano
              </span>
            )}
            {isFulfilled && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <Award className="w-3 h-3" />
                Sfinalizowane · {acceptedSupplierName}{acceptedTotal > 0 ? ` · ${formatPLN(acceptedTotal)}` : ''}
              </span>
            )}
            {isActive && deadlinePassed && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 animate-pulse">
                <Clock className="w-3 h-3" />
                Zakończono składanie ofert
              </span>
            )}
            {isActive && !deadlinePassed && <StatusBadge status="active" />}
          </div>
          <div className="flex items-center gap-5 mt-2 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {order.departments.length > 0
                ? `${order.departments.length} ${order.departments.length === 1 ? 'wydział' : 'wydziałów'}`
                : order.department}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <strong className="text-slate-700">{totalWorkersNeeded}</strong>&nbsp;pracowników
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Od {new Date(order.start_date).toLocaleDateString('pl-PL')}
            </span>
            {order.offer_deadline && (
              <span className={`flex items-center gap-1.5 ${deadlinePassed ? 'text-amber-600 font-medium' : ''}`}>
                <Clock className="w-3.5 h-3.5" />
                Deadline: {formatDeadline(order.offer_deadline)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              Ofert: <strong className="text-slate-700 ml-0.5">{order.offers.length}</strong>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <span className="text-xs text-slate-400">
            {new Date(order.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          {order.expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Cancel button — visible for all active orders (incl. post-deadline) */}
      {view === 'active' && isActive && (
        <div className="px-6 pb-4 flex justify-end border-t border-slate-50 pt-3 -mt-2">
          <button
            onClick={onCancel}
            disabled={cancelling === order.id}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-transparent hover:border-red-200 transition disabled:opacity-50"
          >
            {cancelling === order.id
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Ban className="w-3.5 h-3.5" />
            }
            Anuluj postępowanie
          </button>
        </div>
      )}

      {/* Offers comparison */}
      {order.expanded && (
        <div className="border-t border-slate-100">
          {sortedOffers.length === 0 ? (
            <div className="px-6 py-6 text-center">
              <div className="inline-flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2.5 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Oczekiwanie na oferty od dostawców…
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Dostawca</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pracownicy</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Dostępność od</th>
                    <th className="text-right px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Suma kosztów zakładu</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    {isActive && <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Akcja</th>}
                    <th className="px-4 py-3.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOffers.map((offer, idx) => {
                    const total = calcOfferTotal(offer, order.departments);
                    const isLowest = offer.id === lowestId;
                    const isAccepted = offer.status === 'accepted';
                    const isRejected = offer.status === 'rejected';
                    const supplierName = (offer.profiles as any)?.company_name || (offer.profiles as any)?.full_name || '—';
                    const contactName = (offer.profiles as any)?.full_name;
                    const drillOpen = expandedOfferIds.has(offer.id);
                    const totalOfferedWorkers = offer.offerDepts.length > 0
                      ? offer.offerDepts.reduce((s, od) => s + od.confirmed_workers, 0)
                      : offer.confirmed_workers;
                    const isFullStaffing = totalOfferedWorkers >= totalWorkersNeeded;
                    const maxHistVer = offer.historyLogs.length > 0
                      ? Math.max(...offer.historyLogs.map(h => h.version))
                      : 0;
                    const currentVersion = maxHistVer + 1;
                    const wasEdited = offer.historyLogs.length > 0;

                    return (
                      <>
                        <tr
                          key={offer.id}
                          className={`transition-colors border-t border-slate-100
                            ${isAccepted ? 'bg-emerald-50/60' : ''}
                            ${isRejected ? 'bg-slate-50 opacity-60' : ''}
                            ${!isAccepted && !isRejected && isActive ? 'hover:bg-slate-50/80' : ''}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0
                                ${idx === 0 && isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {idx + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-800">{supplierName}</span>
                                  {isLowest && isActive && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                      <TrendingDown className="w-3 h-3" />Najniższy koszt
                                    </span>
                                  )}
                                  {isFullStaffing && isActive && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700 border border-sky-200">
                                      <CheckCheck className="w-3 h-3" />100% kadr
                                    </span>
                                  )}
                                  {wasEdited && (
                                    <button
                                      onClick={() => setHistoryOffer(offer)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 transition"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      Edytowano (wersja {currentVersion})
                                    </button>
                                  )}
                                  {isAccepted && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
                                      <Award className="w-3 h-3" />Wybrana
                                    </span>
                                  )}
                                </div>
                                {contactName && supplierName !== contactName && (
                                  <p className="text-xs text-slate-400 mt-0.5">{contactName}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`font-bold text-base ${isFullStaffing ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {totalOfferedWorkers}
                            </span>
                            <span className="text-slate-400 text-xs block">/ {totalWorkersNeeded} wym.</span>
                          </td>
                          <td className="px-4 py-4 text-slate-700 font-medium">
                            {new Date(offer.availability_date).toLocaleDateString('pl-PL')}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className={`text-base font-bold ${isAccepted ? 'text-emerald-700' : isLowest && isActive ? 'text-emerald-700' : 'text-slate-800'}`}>
                              {formatPLN(total)}
                            </span>
                            <span className="block text-xs text-slate-400 mt-0.5">suma {order.departments.length || 1} wydziałów</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <StatusBadge status={offer.status} />
                          </td>
                          {isActive && (
                            <td className="px-4 py-4 text-center">
                              {isAccepted ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-4 h-4" />Zaakceptowana
                                </span>
                              ) : isRejected ? (
                                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                  <XCircle className="w-4 h-4" />Odrzucona
                                </span>
                              ) : (
                                <button
                                  onClick={() => onAccept(offer.id)}
                                  disabled={accepting !== null}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sokolow-600 hover:bg-sokolow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition shadow-sm"
                                >
                                  {accepting === offer.id
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />
                                  }
                                  Akceptuj
                                </button>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-4 text-center">
                            {offer.offerDepts.length > 0 && (
                              <button
                                onClick={() => toggleOfferDrilldown(offer.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition mx-auto"
                              >
                                {drillOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Department drilldown */}
                        {drillOpen && offer.offerDepts.length > 0 && (
                          <tr key={`${offer.id}-drill`} className={`${isAccepted ? 'bg-emerald-50/40' : 'bg-slate-50/70'}`}>
                            <td colSpan={isActive ? 7 : 6} className="px-8 pb-4 pt-0">
                              <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                      <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Wydział</th>
                                      <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Pracownicy</th>
                                      <th className="text-left px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Zmiany</th>
                                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Stawka RBH</th>
                                      <th className="text-right px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Koszt wydziału</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {order.departments.map(dept => {
                                      const od = offer.offerDepts.find(d => d.order_department_id === dept.id);
                                      if (!od) {
                                        return (
                                          <tr key={dept.id} className="bg-slate-50/60 opacity-60">
                                            <td className="px-4 py-2.5 font-medium text-slate-500">{dept.department}</td>
                                            <td colSpan={3} className="px-3 py-2.5 text-center text-slate-400 italic">
                                              Brak oferty od tej agencji
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                                          </tr>
                                        );
                                      }
                                      const deptCost = calcDeptCost(od, dept);
                                      return (
                                        <tr key={od.id} className="hover:bg-slate-50">
                                          <td className="px-4 py-2.5 font-medium text-slate-700">{dept.department}</td>
                                          <td className="px-3 py-2.5 text-center">
                                            <span className="font-semibold text-slate-800">{od.confirmed_workers}</span>
                                            <span className="text-slate-400 ml-1">/ {dept.workers_needed}</span>
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <div className="flex gap-1 flex-wrap">
                                              {od.selected_shifts.map(s => {
                                                const isI = s.startsWith('06');
                                                return (
                                                  <span key={s} className={`px-1.5 py-0.5 rounded font-semibold
                                                    ${isI ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {SHIFT_META[s]?.label ?? s}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">
                                            {Number(od.rate_per_hour).toFixed(2)} PLN
                                          </td>
                                          <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                                            {formatPLN(deptCost)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                      <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-slate-500">
                                        Suma łączna zakładu
                                        {offer.offerDepts.length < order.departments.length && (
                                          <span className="ml-1 text-amber-600 font-normal">
                                            (oferta częściowa: {offer.offerDepts.length}/{order.departments.length} wydziałów)
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold text-slate-800">{formatPLN(total)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                {sortedOffers.length > 1 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={isActive ? 3 : 2} className="px-6 py-3 text-xs text-slate-500 font-medium">
                        Zakres wartości ofert (suma zakładu)
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {formatPLN(Math.min(...sortedOffers.map(o => calcOfferTotal(o, order.departments))))}
                        {' '}—{' '}
                        {formatPLN(Math.max(...sortedOffers.map(o => calcOfferTotal(o, order.departments))))}
                      </td>
                      <td colSpan={isActive ? 3 : 2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {historyOffer && (
        <HistoryPopover
          offer={historyOffer}
          departments={order.departments}
          onClose={() => setHistoryOffer(null)}
        />
      )}
    </div>
  );
}
