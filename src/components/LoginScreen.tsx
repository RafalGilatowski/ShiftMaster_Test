import { useState, useEffect, FormEvent } from 'react';
import { Lock, Mail, AlertCircle, Eye, EyeOff, User, Briefcase, ChevronRight, CheckCircle2, ShieldAlert, Building2 } from 'lucide-react';
import ShiftMasterLogo from './ShiftMasterLogo';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'register';

interface InvitationInfo {
  id: string;
  email: string;
  token: string;
  status: string;
  expires_at: string;
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Invitation token state
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [tokenChecking, setTokenChecking] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  // On mount: read ?token= from URL and validate it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    setInviteToken(token);
    setMode('register');
    setTokenChecking(true);

    (async () => {
      const { data } = await supabase
        .from('invitations')
        .select('id, email, token, status, expires_at')
        .eq('token', token)
        .maybeSingle();

      if (!data || data.status !== 'pending' || new Date(data.expires_at) < new Date()) {
        setTokenInvalid(true);
      } else {
        setInvitation(data);
        setEmail(data.email);
      }
      setTokenChecking(false);
    })();
  }, []);

  async function quickLogin(devEmail: string, devPassword: string) {
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: devEmail, password: devPassword });
    if (error) setError('BŁĄD SUPABASE AUTH: ' + error.message);
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('BŁĄD SUPABASE AUTH: ' + error.message);
      }
    } else {
      if (!inviteToken || !invitation) {
        setError('Rejestracja jest możliwa wyłącznie poprzez link z zaproszenia.');
        setLoading(false);
        return;
      }
      if (!fullName.trim()) {
        setError('Imię i nazwisko jest wymagane.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
            role: 'external',
          },
        },
      });

      if (error) {
        alert('BŁĄD SUPABASE AUTH: ' + error.message);
        setError('BŁĄD SUPABASE AUTH: ' + error.message);
      } else if (data.user) {
        // Update invitation status in Supabase
        const { error: inviteError } = await supabase
          .from('invitations')
          .update({ status: 'accepted' })
          .eq('token', inviteToken)
          .eq('status', 'pending');

        if (inviteError) {
          setError('Konto utworzone, ale błąd aktualizacji zaproszenia: ' + inviteError.message);
          setLoading(false);
          return;
        }

        // Sign in immediately so the session is active
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError('Konto utworzone. Zaloguj się ręcznie.');
        }

        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    setLoading(false);
  }

  function switchMode(m: Mode) {
    // Only allow switching to register via invitation link
    if (m === 'register' && !inviteToken) return;
    setMode(m);
    setError('');
    if (!inviteToken) {
      setEmail('');
      setPassword('');
      setFullName('');
      setCompanyName('');
    }
  }

  const canRegister = !!inviteToken && !tokenInvalid;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sokolow-950 to-slate-900 flex items-center justify-center p-4">
      {/* Subtle dot grid overlay */}
      <div className="absolute inset-0 opacity-20"
        style={{ backgroundImage: 'radial-gradient(circle, #ffffff22 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />
      {/* Red accent bar at top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-sokolow-600" />

      <div className="relative w-full max-w-md">
        {/* ShiftMaster logotype */}
        <div className="text-center mb-8">
          {/* Large logotype on dark background — invert text colors */}
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-sokolow-600 flex items-center justify-center shadow-lg shadow-sokolow-900/40 flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="text-left">
              <div className="text-4xl font-bold leading-none tracking-tight">
                <span className="text-white">Shift</span>
                <span className="text-sokolow-400">Master</span>
              </div>
              <p className="text-white/50 text-xs mt-1 tracking-wider uppercase">Portal Zakupowy</p>
            </div>
          </div>
        </div>

        {/* Token checking state */}
        {tokenChecking && (
          <div className="bg-white rounded-xl shadow-2xl p-10 text-center">
            <span className="w-8 h-8 border-2 border-sokolow-100 border-t-sokolow-600 rounded-full animate-spin inline-block mb-4" />
            <p className="text-slate-600 font-medium">Weryfikacja zaproszenia...</p>
          </div>
        )}

        {/* Invalid token */}
        {!tokenChecking && inviteToken && tokenInvalid && (
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7 text-sokolow-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Nieprawidłowe zaproszenie</h2>
            <p className="text-slate-500 text-sm mb-6">Link zaproszenia jest nieważny, wygasł lub został już użyty. Skontaktuj się z pracownikiem organizacji.</p>
            <button
              onClick={() => { setInviteToken(null); setTokenInvalid(false); setMode('login'); window.history.replaceState({}, '', window.location.pathname); }}
              className="text-sokolow-600 hover:text-sokolow-800 text-sm font-semibold transition"
            >
              Przejdź do logowania
            </button>
          </div>
        )}

        {/* Main card */}
        {!tokenChecking && !(inviteToken && tokenInvalid) && (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            {/* Red top accent */}
            <div className="h-1 bg-sokolow-600" />

            {/* Invitation banner */}
            {invitation && (
              <div className="flex items-center gap-3 bg-emerald-50 border-b border-emerald-100 px-6 py-3.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Aktywne zaproszenie</p>
                  <p className="text-xs text-emerald-600">Rejestrujesz się jako Dostawca Zewnętrzny dla: <strong>{invitation.email}</strong></p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => switchMode('login')}
                className={`flex-1 py-4 text-sm font-semibold transition ${mode === 'login' ? 'text-sokolow-600 border-b-2 border-sokolow-600 bg-sokolow-50/40' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Zaloguj się
              </button>
              <button
                onClick={() => switchMode('register')}
                disabled={!canRegister}
                title={!canRegister ? 'Rejestracja wymaga ważnego linku z zaproszeniem' : undefined}
                className={`flex-1 py-4 text-sm font-semibold transition ${mode === 'register' ? 'text-sokolow-600 border-b-2 border-sokolow-600 bg-sokolow-50/40' : canRegister ? 'text-slate-500 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}
              >
                Zarejestruj się
              </button>
            </div>

            <div className="p-8">
              {mode === 'login' && !inviteToken && (
                <p className="text-slate-500 text-sm mb-6">Wprowadź dane dostępowe do systemu ShiftMaster</p>
              )}
              {mode === 'register' && (
                <p className="text-slate-500 text-sm mb-6">Utwórz konto dostawcy w systemie ShiftMaster</p>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full name — register only */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Imię i nazwisko *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Jan Kowalski"
                        required
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Company name — register only */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nazwa firmy</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        placeholder="np. Agencja Pracy Tempus"
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Adres e-mail *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="twoj@email.pl"
                      required
                      readOnly={mode === 'register' && !!invitation}
                      className={`w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition text-sm ${mode === 'register' && invitation ? 'bg-slate-50 text-slate-500' : ''}`}
                    />
                  </div>
                  {mode === 'register' && invitation && (
                    <p className="text-xs text-slate-400 mt-1">Adres e-mail jest zablokowany — wynika z zaproszenia.</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Hasło *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sokolow-500 focus:border-transparent transition text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === 'register' && (
                    <p className="text-xs text-slate-400 mt-1">Minimum 6 znaków</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-sokolow-600 hover:bg-sokolow-700 disabled:bg-sokolow-300 text-white font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mt-2 shadow-sm"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {mode === 'login' ? 'Logowanie...' : 'Rejestracja...'}
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Notice for login mode without token */}
              {mode === 'login' && !inviteToken && (
                <p className="text-center text-xs text-slate-400 mt-5">
                  Rejestracja dostępna wyłącznie przez link z zaproszenia.
                </p>
              )}

              {/* Dev quick login */}
              {mode === 'login' && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <p className="text-xs text-slate-400 text-center mb-3 font-medium uppercase tracking-wide">Szybkie logowanie deweloperskie</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => quickLogin('test.internal@vms.pl', 'Test1234!')}
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition disabled:opacity-50"
                    >
                      <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                      Pracownik (Test)
                    </button>
                    <button
                      type="button"
                      onClick={() => quickLogin('test.external@vms.pl', 'Test1234!')}
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold transition disabled:opacity-50"
                    >
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                      Dostawca (Test)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-white/30 text-xs mt-6">
          &copy; 2026 ShiftMaster &middot; Wszelkie prawa zastrzeżone
        </p>
      </div>
    </div>
  );
}
