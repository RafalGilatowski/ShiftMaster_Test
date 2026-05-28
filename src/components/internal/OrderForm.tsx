import { useState, FormEvent } from 'react';
import { Send, CheckCircle, Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const PLANTS = ['Koło', 'Sokołów', 'Tarnów', 'Robakowo', 'Osie', 'Dębica', 'Czyżew', 'Jarosław'];
const DEPARTMENT_OPTIONS = [
  'Ubój wieprzowy', 'Ubój wołowy', 'Rozbiór wieprzowy', 'Rozbiór wołowy',
  'Konfekcja Mięsa', 'Konfekcja Wędlin', 'Przetwórnia', 'Grill',
  'Spedycja', 'Mroźnia', 'Inne',
];

const SHIFTS = [
  { value: '06:00 - 14:00', label: 'Zmiana I', hours: '6:00 – 14:00' },
  { value: '14:00 - 22:00', label: 'Zmiana II', hours: '14:00 – 22:00' },
] as const;

interface DeptRow {
  key: number;
  department: string;
  workersNeeded: number;
  daysCount: number;
  startDate: string;
  requiredShifts: string[];
}

type SendingState = 'idle' | 'sending' | 'done';

let nextKey = 1;
function makeDept(today: string): DeptRow {
  return { key: nextKey++, department: '', workersNeeded: 1, daysCount: 1, startDate: today, requiredShifts: [] };
}

interface OrderFormProps {
  onOrderCreated: () => void;
}

export default function OrderForm({ onOrderCreated }: OrderFormProps) {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [plant, setPlant] = useState('');
  const [depts, setDepts] = useState<DeptRow[]>([makeDept(today)]);
  const [offerDeadlineDate, setOfferDeadlineDate] = useState('');
  const [offerDeadlineTime, setOfferDeadlineTime] = useState('12:00');
  const [sendingState, setSendingState] = useState<SendingState>('idle');
  const [error, setError] = useState('');

  function updateDept(key: number, patch: Partial<DeptRow>) {
    setDepts(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d));
  }

  function toggleShift(key: number, value: string) {
    setDepts(prev => prev.map(d => {
      if (d.key !== key) return d;
      const shifts = d.requiredShifts.includes(value)
        ? d.requiredShifts.filter(s => s !== value)
        : [...d.requiredShifts, value];
      return { ...d, requiredShifts: shifts };
    }));
  }

  function addDept() {
    setDepts(prev => [...prev, makeDept(today)]);
  }

  function removeDept(key: number) {
    if (depts.length === 1) return;
    setDepts(prev => prev.filter(d => d.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const invalid = depts.find(d => !d.department || d.requiredShifts.length === 0);
    if (invalid) {
      setError('Uzupełnij nazwę wydziału i wybierz co najmniej jedną zmianę dla każdego wydziału.');
      return;
    }
    if (!offerDeadlineDate) {
      setError('Ustaw termin składania ofert (deadline).');
      return;
    }

    setError('');
    setSendingState('sending');

    // Create the plant-level order header
    const firstDept = depts[0];
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert({
        created_by: user.id,
        plant,
        department: depts.map(d => d.department).join(', '),
        workers_needed: depts.reduce((s, d) => s + d.workersNeeded, 0),
        start_date: firstDept.startDate,
        days_count: firstDept.daysCount,
        status: 'active',
        required_shifts: [...new Set(depts.flatMap(d => d.requiredShifts))],
        offer_deadline: `${offerDeadlineDate}T${offerDeadlineTime}:00`,
      })
      .select()
      .maybeSingle();

    if (orderErr || !orderData) {
      setError('Błąd podczas zapisywania zamówienia. Spróbuj ponownie.');
      setSendingState('idle');
      return;
    }

    // Insert department rows
    const deptRows = depts.map(d => ({
      order_id: orderData.id,
      department: d.department,
      workers_needed: d.workersNeeded,
      days_count: d.daysCount,
      start_date: d.startDate,
      required_shifts: d.requiredShifts,
    }));

    const { error: deptErr } = await supabase.from('order_departments').insert(deptRows);

    if (deptErr) {
      setError('Błąd podczas zapisywania wydziałów. Spróbuj ponownie.');
      setSendingState('idle');
      return;
    }

    // Notify suppliers
    try {
      console.log('Inicjuję wysyłkę maila o nowym zamówieniu do dostawców...');

      const { data: { session } } = await supabase.auth.getSession();
      console.log('Sesja pobrana, token:', session?.access_token ? 'OK' : 'BRAK');

      // Fetch all external profiles, then cross-check with invitations to keep only active suppliers.
      // A supplier is active when their email has status='accepted' in invitations.
      // Deleted suppliers have no invitations row and must be excluded.
      const { data: supplierProfiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'external')
        .neq('email', '');

      if (profilesErr) console.error('Błąd pobierania profili dostawców:', profilesErr);

      const allProfileEmails = (supplierProfiles ?? [])
        .map(p => p.email as string)
        .filter(Boolean);

      const { data: activeInvitations } = await supabase
        .from('invitations')
        .select('email')
        .in('email', allProfileEmails)
        .eq('status', 'accepted');

      const activeSet = new Set((activeInvitations ?? []).map(r => r.email as string));
      const supplierEmails = allProfileEmails.filter(e => activeSet.has(e));

      console.log('Lista aktywnych dostawców do wysyłki powiadomienia:', supplierEmails);

      const payload = {
        type: 'new_order',
        orderId: orderData.id,
        plant,
        departments: depts.map(d => ({
          department: d.department,
          workersNeeded: d.workersNeeded,
          daysCount: d.daysCount,
          startDate: d.startDate,
          requiredShifts: d.requiredShifts,
        })),
        offerDeadline: `${offerDeadlineDate}T${offerDeadlineTime}:00`,
        createdByName: user.user_metadata?.full_name ?? user.email ?? 'Organizator',
        appUrl: window.location.origin,
        supplierEmails,
      };

      console.log('Payload do Edge Function:', JSON.stringify(payload, null, 2));

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const resBody = await res.json().catch(() => null);
      console.log('Odpowiedź Edge Function (status', res.status + '):', resBody);

      if (!res.ok || resBody?.success === false) {
        const msg = resBody?.error ?? `HTTP ${res.status}`;
        console.error('BŁĄD WYSYŁKI RESEND:', msg);
        alert('Problem z wysyłką maila: ' + msg);
      } else {
        console.log('Maile wysłane pomyślnie do:', resBody?.sent);
      }
    } catch (error) {
      console.error('BŁĄD WYSYŁKI RESEND:', error);
      alert('Problem z wysyłką maila: ' + (error instanceof Error ? error.message : JSON.stringify(error)));
    }

    setSendingState('done');
    await new Promise(r => setTimeout(r, 1800));
    setPlant('');
    setDepts([makeDept(today)]);
    setOfferDeadlineDate('');
    setOfferDeadlineTime('12:00');
    setSendingState('idle');
    onOrderCreated();
  }

  const totalWorkers = depts.reduce((s, d) => s + d.workersNeeded, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-800">Nowe zapotrzebowanie zbiorcze</h2>
        <p className="text-slate-500 text-sm mt-0.5">Wybierz zakład i skonfiguruj wydziały — każdy wydział ma niezależne parametry</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Plant selector */}
        <div className="max-w-sm">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Zakład *</label>
          <select
            value={plant}
            onChange={e => setPlant(e.target.value)}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition bg-white"
          >
            <option value="">Wybierz zakład...</option>
            {PLANTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Offer deadline */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <label className="block text-sm font-semibold text-amber-900 mb-2">
            Termin składania ofert (Deadline) *
          </label>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-36">
              <label className="block text-xs font-medium text-amber-700 mb-1">Data</label>
              <input
                type="date"
                value={offerDeadlineDate}
                min={today}
                onChange={e => setOfferDeadlineDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-amber-300 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition bg-white"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-amber-700 mb-1">Godzina</label>
              <input
                type="time"
                value={offerDeadlineTime}
                onChange={e => setOfferDeadlineTime(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-amber-300 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition bg-white"
              />
            </div>
          </div>
          {offerDeadlineDate && (
            <p className="text-xs text-amber-700 mt-2">
              Oferty można składać do: <strong>{new Date(`${offerDeadlineDate}T${offerDeadlineTime}:00`).toLocaleString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
            </p>
          )}
        </div>

        {/* Department rows */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Wydziały</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{depts.length}</span>
            </div>
            {plant && (
              <button
                type="button"
                onClick={addDept}
                className="flex items-center gap-1.5 text-sm font-medium text-sokolow-600 hover:text-sokolow-700 px-3 py-1.5 rounded-lg hover:bg-sokolow-50 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Dodaj kolejny wydział
              </button>
            )}
          </div>

          {depts.map((dept, idx) => (
            <DeptCard
              key={dept.key}
              dept={dept}
              index={idx}
              canRemove={depts.length > 1}
              onUpdate={patch => updateDept(dept.key, patch)}
              onToggleShift={value => toggleShift(dept.key, value)}
              onRemove={() => removeDept(dept.key)}
              today={today}
            />
          ))}
        </div>

        {/* Summary */}
        {plant && depts.every(d => d.department && d.requiredShifts.length > 0) && (
          <div className="px-4 py-3 bg-sokolow-50 border border-sokolow-100 rounded-lg text-sm text-sokolow-800">
            <span className="font-semibold">Podsumowanie:</span>{' '}
            <span className="font-semibold">{totalWorkers}</span> pracowników łącznie,{' '}
            zakład <span className="font-semibold">{plant}</span>,{' '}
            {depts.length} {depts.length === 1 ? 'wydział' : depts.length < 5 ? 'wydziały' : 'wydziałów'}.
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sendingState !== 'idle'}
            className="flex items-center gap-2 bg-sokolow-600 hover:bg-sokolow-700 disabled:bg-sokolow-300 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm text-sm"
          >
            {sendingState === 'idle' && <><Send className="w-4 h-4" />Wyślij zamówienie do dostawców</>}
            {sendingState === 'sending' && <><Loader2 className="w-4 h-4 animate-spin" />Wysyłanie powiadomień e-mail...</>}
            {sendingState === 'done' && <><CheckCircle className="w-4 h-4" />Zamówienie wysłane!</>}
          </button>
        </div>
      </form>

      {sendingState === 'done' && (
        <div className="px-6 pb-5">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Powiadomienia wysłane pomyślnie!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Dostawcy zostali powiadomieni i mogą teraz składać oferty.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DeptCard ─────────────────────────────────────────────────────────────────

interface DeptCardProps {
  dept: DeptRow;
  index: number;
  canRemove: boolean;
  today: string;
  onUpdate: (patch: Partial<DeptRow>) => void;
  onToggleShift: (value: string) => void;
  onRemove: () => void;
}

function DeptCard({ dept, index, canRemove, today, onUpdate, onToggleShift, onRemove }: DeptCardProps) {
  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-sokolow-600 text-white text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-slate-700">
            {dept.department || `Wydział ${index + 1}`}
          </span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Department name */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Nazwa wydziału *</label>
          <select
            value={dept.department}
            onChange={e => onUpdate({ department: e.target.value })}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition bg-white"
          >
            <option value="">Wybierz wydział...</option>
            {DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Workers needed */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Liczba pracowników *</label>
          <input
            type="number"
            min={1}
            max={500}
            value={dept.workersNeeded}
            onChange={e => onUpdate({ workersNeeded: Number(e.target.value) })}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition bg-white"
          />
        </div>

        {/* Days count */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Liczba dni *</label>
          <input
            type="number"
            min={1}
            max={365}
            value={dept.daysCount}
            onChange={e => onUpdate({ daysCount: Number(e.target.value) })}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition bg-white"
          />
        </div>

        {/* Start date */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Data od kiedy *</label>
          <input
            type="date"
            value={dept.startDate}
            min={today}
            onChange={e => onUpdate({ startDate: e.target.value })}
            required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition bg-white"
          />
        </div>

        {/* Shifts */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Wymagane zmiany *</label>
          <div className="flex gap-2">
            {SHIFTS.map(shift => {
              const checked = dept.requiredShifts.includes(shift.value);
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
                    className="accent-sokolow-600 w-3.5 h-3.5 flex-shrink-0"
                  />
                  <div>
                    <p className={`text-xs font-semibold ${checked ? 'text-sokolow-700' : 'text-slate-700'}`}>{shift.label}</p>
                    <p className={`text-xs ${checked ? 'text-sokolow-500' : 'text-slate-400'}`}>{shift.hours}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
