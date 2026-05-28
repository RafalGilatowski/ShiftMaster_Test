import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Mail, Send, RefreshCw, Clock, CheckCircle2, AlertCircle, Users, Copy, Check, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Invitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted';
  created_at: string;
  expires_at: string;
}

export default function SuppliersPanel() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Invitation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('invitations')
      .select('id, email, status, created_at, expires_at')
      .order('created_at', { ascending: false });
    setInvitations(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvitations(); }, [fetchInvitations]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setSuccess('');
    setSending(true);

    const appUrl = window.location.origin + window.location.pathname;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invitation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: email.trim(), appUrl }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Błąd podczas wysyłania zaproszenia.');
    } else {
      const msg = data.emailWarning
        ? `Zaproszenie zapisane. Uwaga: ${data.emailWarning}`
        : `Zaproszenie wysłane na adres ${email.trim()}.`;
      setSuccess(msg);
      setEmail('');
      await fetchInvitations();
    }

    setSending(false);
  }

  async function copyLink(token: string) {
    const link = `${window.location.origin}${window.location.pathname}?token=${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 2000);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');

    const { error: deleteError, count } = await supabase
      .from('invitations')
      .delete({ count: 'exact' })
      .eq('id', deleteTarget.id);

    if (deleteError) {
      setError(`Nie można usunąć dostawcy z bazy: ${deleteError.message}`);
      setDeleting(false);
      setDeleteTarget(null);
      return;
    }

    if (count === 0) {
      setError('Nie można usunąć dostawcy z bazy: brak uprawnień lub wiersz nie istnieje.');
      setDeleting(false);
      setDeleteTarget(null);
      return;
    }

    setSuccess(`Dostawca ${deleteTarget.email} został pomyślnie usunięty.`);
    setInvitations(prev => prev.filter(i => i.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Send invitation form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Zaproś dostawcę</h2>
          <p className="text-slate-500 text-sm mt-0.5">Wyślij unikalny link rejestracyjny na adres e-mail dostawcy.</p>
        </div>
        <div className="p-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4 text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@dostawca.pl"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 bg-sokolow-600 hover:bg-sokolow-700 disabled:bg-sokolow-300 text-white font-semibold px-5 py-2.5 rounded-lg transition text-sm shadow-sm flex-shrink-0"
            >
              {sending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? 'Wysyłanie...' : 'Wyślij zaproszenie'}
            </button>
          </form>
        </div>
      </div>

      {/* Invitations list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Historia zaproszeń</h2>
            <p className="text-slate-500 text-sm mt-0.5">Lista wszystkich wysłanych zaproszeń</p>
          </div>
          <button
            onClick={fetchInvitations}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Odśwież
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-sokolow-600 animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">Brak zaproszeń</p>
            <p className="text-slate-400 text-sm mt-1">Wyślij pierwsze zaproszenie korzystając z formularza powyżej</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">E-mail dostawcy</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data wysłania</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Wygasa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Link</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map(inv => {
                  const expired = new Date(inv.expires_at) < new Date() && inv.status === 'pending';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-3.5 font-medium text-slate-800">{inv.email}</td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">
                        {new Date(inv.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">
                        {new Date(inv.expires_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3.5">
                        {inv.status === 'accepted' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Zaakceptowane
                          </span>
                        ) : expired ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                            <Clock className="w-3 h-3" /> Wygasłe
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                            <Clock className="w-3 h-3" /> Oczekuje
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {inv.status === 'pending' && !expired && (
                          <button
                            onClick={() => copyLink(inv.id)}
                            className="flex items-center gap-1.5 text-xs text-sokolow-600 hover:text-sokolow-800 hover:bg-sokolow-50 px-2.5 py-1.5 rounded-lg transition"
                          >
                            {copiedToken === inv.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedToken === inv.id ? 'Skopiowano!' : 'Kopiuj link'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setDeleteTarget(inv)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Usuń
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-4.5 h-4.5 text-red-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-800">Usuwanie dostawcy</h3>
              </div>
              <button
                onClick={() => !deleting && setDeleteTarget(null)}
                disabled={deleting}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1.5 transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5">
              <p className="text-slate-600 text-sm leading-relaxed">
                Czy na pewno chcesz bezpowrotnie usunąć dostawcę{' '}
                <span className="font-semibold text-slate-800">{deleteTarget.email}</span>{' '}
                z systemu? Ta akcja może wpłynąć na powiązane z nim oferty. Operacji nie można cofnąć.
              </p>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm disabled:opacity-50"
              >
                {deleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {deleting ? 'Usuwanie...' : 'Tak, usuń dostawcę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
