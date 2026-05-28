import { useState, FormEvent } from 'react';
import { Send, CheckCircle, X, AlertCircle, Lock, Pencil } from 'lucide-react';
import { supabase, Order, OrderDepartment, OfferDepartment } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

async function getNextVersion(offerId: string): Promise<number> {
  const { data } = await supabase
    .from('offer_history_logs')
    .select('version')
    .eq('offer_id', offerId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

interface ExistingOffer {
  id: string;
  availability_date: string;
  offerDepts: OfferDepartment[];
}

interface OfferFormProps {
  order: Order;
  departments: OrderDepartment[];
  existingOffer?: ExistingOffer | null;
  onClose: () => void;
  onOfferSent: () => void;
}

const SHIFTS = [
  { value: '06:00 - 14:00', label: 'Zmiana I', hours: '6:00–14:00' },
  { value: '14:00 - 22:00', label: 'Zmiana II', hours: '14:00–22:00' },
] as const;

interface DeptBid {
  orderDeptId: string;
  active: boolean;
  confirmedWorkers: number;
  ratePerHour: string;
  selectedShifts: string[];
  workerError: string;
}

function formatPLN(v: number) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(v);
}

function calcDeptCost(bid: DeptBid, dept: OrderDepartment): number {
  if (!bid.active || !bid.ratePerHour || bid.selectedShifts.length === 0) return 0;
  return bid.confirmedWorkers * dept.days_count * 8 * parseFloat(bid.ratePerHour) * bid.selectedShifts.length;
}

function buildInitialBids(departments: OrderDepartment[], existingOffer: ExistingOffer | null | undefined): DeptBid[] {
  return departments.map(d => {
    const existing = existingOffer?.offerDepts.find(od => od.order_department_id === d.id);
    if (existing) {
      return {
        orderDeptId: d.id,
        active: true,
        confirmedWorkers: existing.confirmed_workers,
        ratePerHour: String(existing.rate_per_hour),
        selectedShifts: existing.selected_shifts ?? [],
        workerError: '',
      };
    }
    // If offer exists but this dept wasn't covered → inactive
    if (existingOffer && !existing) {
      return {
        orderDeptId: d.id,
        active: false,
        confirmedWorkers: d.workers_needed,
        ratePerHour: '',
        selectedShifts: d.required_shifts.length > 0 ? [...d.required_shifts] : [],
        workerError: '',
      };
    }
    return {
      orderDeptId: d.id,
      active: true,
      confirmedWorkers: d.workers_needed,
      ratePerHour: '',
      selectedShifts: d.required_shifts.length > 0 ? [...d.required_shifts] : [],
      workerError: '',
    };
  });
}

export default function OfferForm({ order, departments, existingOffer, onClose, onOfferSent }: OfferFormProps) {
  const { user } = useAuth();
  const isEditMode = !!existingOffer;
  const deadlinePassed = order.offer_deadline ? Date.now() > new Date(order.offer_deadline).getTime() : false;

  const [availabilityDate, setAvailabilityDate] = useState(
    existingOffer?.availability_date ?? order.start_date
  );
  const [bids, setBids] = useState<DeptBid[]>(() => buildInitialBids(departments, existingOffer));
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function updateBid(deptId: string, patch: Partial<DeptBid>) {
    setBids(prev => prev.map(b => b.orderDeptId === deptId ? { ...b, ...patch } : b));
  }

  function toggleActive(deptId: string) {
    setBids(prev => prev.map(b => {
      if (b.orderDeptId !== deptId) return b;
      const next = !b.active;
      return { ...b, active: next, ratePerHour: next ? b.ratePerHour : '', workerError: '' };
    }));
  }

  function handleWorkersChange(deptId: string, value: number, dept: OrderDepartment) {
    const workerError = value > dept.workers_needed
      ? `Maks. ${dept.workers_needed} osób`
      : '';
    updateBid(deptId, { confirmedWorkers: value, workerError });
  }

  function toggleShift(deptId: string, value: string) {
    setBids(prev => prev.map(b => {
      if (b.orderDeptId !== deptId) return b;
      const shifts = b.selectedShifts.includes(value)
        ? b.selectedShifts.filter(s => s !== value)
        : [...b.selectedShifts, value];
      return { ...b, selectedShifts: shifts };
    }));
  }

  const activeBids = bids.filter(b => b.active);
  const totalCost = bids.reduce((sum, bid) => {
    const dept = departments.find(d => d.id === bid.orderDeptId);
    return dept ? sum + calcDeptCost(bid, dept) : sum;
  }, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (order.offer_deadline && Date.now() > new Date(order.offer_deadline).getTime()) {
      setError('Zakończono przyjmowanie ofert dla tego postępowania. Termin składania ofert minął.');
      return;
    }

    if (activeBids.length === 0) {
      setError('Musisz wycenić co najmniej jeden wydział.');
      return;
    }

    const workerViolation = activeBids.find(b => b.workerError);
    if (workerViolation) return;

    const incomplete = activeBids.find(b => !b.ratePerHour || b.selectedShifts.length === 0);
    if (incomplete) {
      setError('Podaj stawkę RBH i wybierz co najmniej jedną zmianę dla każdego wycenianego wydziału.');
      return;
    }

    setError('');
    setLoading(true);

    const firstActiveBid = activeBids[0];
    const totalWorkers = activeBids.reduce((s, b) => s + b.confirmedWorkers, 0);

    if (isEditMode && existingOffer) {
      // UPDATE existing offer header
      const updatedData = {
        confirmed_workers: totalWorkers,
        availability_date: availabilityDate,
        availability_time: firstActiveBid.selectedShifts.join(', '),
        rate_per_hour: parseFloat(firstActiveBid.ratePerHour) || 0,
        selected_shifts: firstActiveBid.selectedShifts,
        updated_at: new Date().toISOString(),
      };
      console.log('Zapisuję zaktualizowaną ofertę dostawcy:', updatedData);

      const { error: offerErr } = await supabase
        .from('offers')
        .update(updatedData)
        .eq('id', existingOffer.id)
        .eq('supplier_id', user.id);

      if (offerErr) {
        setError(`Błąd zapisu w bazie danych: ${offerErr.message}`);
        setLoading(false);
        return;
      }

      // --- Audit trail: snapshot current dept rows BEFORE overwriting them ---
      if (existingOffer.offerDepts.length > 0) {
        const nextVer = await getNextVersion(existingOffer.id);
        const historyRows = existingOffer.offerDepts.map(od => ({
          offer_id: existingOffer.id,
          order_department_id: od.order_department_id,
          version: nextVer,
          confirmed_workers: od.confirmed_workers,
          rate_per_hour: Number(od.rate_per_hour),
          selected_shifts: od.selected_shifts ?? [],
          recorded_at: new Date().toISOString(),
        }));
        await supabase.from('offer_history_logs').insert(historyRows);
      }

      // Remove all existing dept rows for this offer, then re-insert active ones.
      // DELETE policy on offer_departments was added in migration fix_offer_departments_rls_update_delete.
      const { error: delErr } = await supabase
        .from('offer_departments')
        .delete()
        .eq('offer_id', existingOffer.id);

      if (delErr) {
        setError(`Błąd zapisu w bazie danych: ${delErr.message}`);
        setLoading(false);
        return;
      }

      const deptRows = activeBids.map(bid => ({
        offer_id: existingOffer.id,
        order_department_id: bid.orderDeptId,
        confirmed_workers: bid.confirmedWorkers,
        rate_per_hour: parseFloat(bid.ratePerHour),
        selected_shifts: bid.selectedShifts,
      }));

      const { error: deptErr } = await supabase.from('offer_departments').insert(deptRows);
      if (deptErr) {
        setError(`Błąd zapisu w bazie danych: ${deptErr.message}`);
        setLoading(false);
        return;
      }
    } else {
      // INSERT new offer
      const { data: offerData, error: offerErr } = await supabase
        .from('offers')
        .insert({
          order_id: order.id,
          supplier_id: user.id,
          confirmed_workers: totalWorkers,
          availability_date: availabilityDate,
          availability_time: firstActiveBid.selectedShifts.join(', '),
          rate_per_hour: parseFloat(firstActiveBid.ratePerHour) || 0,
          selected_shifts: firstActiveBid.selectedShifts,
          status: 'sent',
        })
        .select()
        .maybeSingle();

      if (offerErr || !offerData) {
        setError('Błąd podczas wysyłania oferty. Spróbuj ponownie.');
        setLoading(false);
        return;
      }

      const deptRows = activeBids.map(bid => ({
        offer_id: offerData.id,
        order_department_id: bid.orderDeptId,
        confirmed_workers: bid.confirmedWorkers,
        rate_per_hour: parseFloat(bid.ratePerHour),
        selected_shifts: bid.selectedShifts,
      }));

      const { error: deptErr } = await supabase.from('offer_departments').insert(deptRows);
      if (deptErr) {
        setError(`Błąd zapisu w bazie danych: ${deptErr.message}`);
        setLoading(false);
        return;
      }
    }

    setSent(true);
    setLoading(false);
    await new Promise(r => setTimeout(r, 1800));
    onOfferSent();
    onClose();
  }

  const coveredCount = bids.filter(b => b.active).length;
  const subtitle = isEditMode
    ? `Edycja oferty · ${coveredCount} z ${departments.length} wydziałów`
    : `${departments.length} ${departments.length === 1 ? 'wydział' : 'wydziałów'} · wybierz te, które chcesz wycenić`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <div className="flex items-center gap-2">
              {isEditMode && <Pencil className="w-4 h-4 text-amber-500" />}
              <h3 className="text-base font-semibold text-slate-800">
                {isEditMode ? 'Edytuj ofertę' : 'Złóż ofertę'} — {order.plant}
              </h3>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {deadlinePassed ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-600" />
            </div>
            <h4 className="text-lg font-semibold text-slate-800">Zakończono przyjmowanie ofert</h4>
            <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
              Termin składania ofert dla tego postępowania minął. Nie można już modyfikować oferty.
            </p>
            {order.offer_deadline && (
              <p className="text-xs text-amber-600 font-medium mt-2">
                Deadline: {new Date(order.offer_deadline).toLocaleString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-6 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
            >
              Zamknij
            </button>
          </div>
        ) : sent ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h4 className="text-lg font-semibold text-slate-800">
              {isEditMode ? 'Oferta zaktualizowana!' : 'Oferta wysłana!'}
            </h4>
            <p className="text-slate-500 text-sm mt-1">
              {isEditMode
                ? 'Twoja oferta została pomyślnie zaktualizowana w bazie danych.'
                : 'Organizator otrzymał Twoją ofertę i wkrótce się z nią zapozna.'
              }
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-slate-500">Termin dostępności</p>
                  <input
                    type="date"
                    value={availabilityDate}
                    onChange={e => setAvailabilityDate(e.target.value)}
                    required
                    className="mt-1 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 bg-white"
                  />
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-slate-500">
                    Łączna wartość oferty
                    {coveredCount < departments.length && (
                      <span className="ml-1 text-amber-600">({coveredCount}/{departments.length} wydziałów)</span>
                    )}
                  </p>
                  <p className="text-xl font-bold text-slate-800 mt-0.5">{formatPLN(totalCost)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {activeBids.length === 0 && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Zaznacz co najmniej jeden wydział, aby móc złożyć ofertę.
                </div>
              )}

              {departments.map((dept, idx) => {
                const bid = bids.find(b => b.orderDeptId === dept.id)!;
                const deptCost = calcDeptCost(bid, dept);
                return (
                  <DeptBidCard
                    key={dept.id}
                    dept={dept}
                    bid={bid}
                    index={idx}
                    deptCost={deptCost}
                    onToggleActive={() => toggleActive(dept.id)}
                    onWorkersChange={v => handleWorkersChange(dept.id, v, dept)}
                    onRateChange={v => updateBid(dept.id, { ratePerHour: v })}
                    onToggleShift={v => toggleShift(dept.id, v)}
                  />
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={loading || activeBids.length === 0 || bids.some(b => !!b.workerError)}
                className="flex items-center gap-2 bg-sokolow-600 hover:bg-sokolow-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg transition shadow-sm text-sm"
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Wysyłanie...</>
                ) : isEditMode ? (
                  <><Pencil className="w-4 h-4" />Zapisz zmiany ({formatPLN(totalCost)})</>
                ) : (
                  <><Send className="w-4 h-4" />Wyślij ofertę ({formatPLN(totalCost)})</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── DeptBidCard ──────────────────────────────────────────────────────────────

interface DeptBidCardProps {
  dept: OrderDepartment;
  bid: DeptBid;
  index: number;
  deptCost: number;
  onToggleActive: () => void;
  onWorkersChange: (v: number) => void;
  onRateChange: (v: string) => void;
  onToggleShift: (v: string) => void;
}

function DeptBidCard({ dept, bid, index, deptCost, onToggleActive, onWorkersChange, onRateChange, onToggleShift }: DeptBidCardProps) {
  const SHIFTS_LIST = [
    { value: '06:00 - 14:00', label: 'Zmiana I', hours: '6:00–14:00' },
    { value: '14:00 - 22:00', label: 'Zmiana II', hours: '14:00–22:00' },
  ] as const;

  const availableShifts = SHIFTS_LIST.filter(s =>
    !dept.required_shifts?.length || dept.required_shifts.includes(s.value)
  );

  return (
    <div className={`border rounded-xl p-4 transition-all ${bid.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
      {/* Card header with toggle checkbox */}
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={bid.active}
            onChange={onToggleActive}
            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
          />
          <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {index + 1}
          </span>
          <span className={`text-sm font-semibold ${bid.active ? 'text-slate-800' : 'text-slate-400'}`}>
            {dept.department}
          </span>
          {!bid.active && (
            <span className="text-xs text-slate-400 italic">— pominięty</span>
          )}
        </label>
        <div className="text-right">
          <p className="text-xs text-slate-400">Koszt wydziału</p>
          <p className={`text-sm font-bold ${deptCost > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
            {deptCost > 0 ? formatPLN(deptCost) : '—'}
          </p>
        </div>
      </div>

      {/* Dept info pills */}
      <div className="flex gap-2 flex-wrap mb-3">
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
          Zapotrzeb.: {dept.workers_needed} os.
        </span>
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
          {dept.days_count} dni · od {new Date(dept.start_date).toLocaleDateString('pl-PL')}
        </span>
        {dept.required_shifts.map(s => {
          const isI = s.startsWith('06');
          return (
            <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${isI ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
              {isI ? 'Zmiana I' : 'Zmiana II'}
            </span>
          );
        })}
      </div>

      {bid.active && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {/* Workers */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Pracownicy / zmianę *</label>
              <input
                type="number"
                min={1}
                max={dept.workers_needed}
                value={bid.confirmedWorkers}
                onChange={e => onWorkersChange(Number(e.target.value))}
                required
                className={`w-full px-3 py-2 border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 transition bg-white
                  ${bid.workerError ? 'border-red-400 focus:ring-red-400 bg-red-50' : 'border-slate-200 focus:ring-sokolow-500'}`}
              />
              {bid.workerError && (
                <p className="text-xs text-red-600 mt-1 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {bid.workerError}
                </p>
              )}
            </div>

            {/* Rate */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stawka RBH (PLN) *</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                placeholder="np. 28.50"
                value={bid.ratePerHour}
                onChange={e => onRateChange(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 transition bg-white"
              />
            </div>
          </div>

          {/* Shifts */}
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Zabezpieczane zmiany *</label>
            <div className="flex gap-2">
              {availableShifts.map(shift => {
                const checked = bid.selectedShifts.includes(shift.value);
                return (
                  <label
                    key={shift.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all flex-1 select-none
                      ${checked ? 'border-sokolow-500 bg-sokolow-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleShift(shift.value)}
                      className="accent-sokolow-600 w-3.5 h-3.5"
                    />
                    <div>
                      <p className={`text-xs font-semibold ${checked ? 'text-sokolow-700' : 'text-slate-700'}`}>{shift.label}</p>
                      <p className={`text-xs ${checked ? 'text-sokolow-500' : 'text-slate-400'}`}>{shift.hours}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {bid.selectedShifts.length === 2 && (
              <p className="text-xs text-sokolow-600 mt-1.5">
                Podana liczba pracowników i stawka dotyczą każdej zmiany z osobna.
              </p>
            )}
          </div>
        </>
      )}

      {!bid.active && (
        <p className="text-xs text-slate-400 italic">
          Odznaczony — Twoja oferta nie obejmuje tego wydziału.
        </p>
      )}
    </div>
  );
}
