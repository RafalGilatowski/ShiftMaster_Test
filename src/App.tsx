import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './components/LoginScreen';
import InternalDashboard from './components/internal/InternalDashboard';
import ExternalDashboard from './components/external/ExternalDashboard';

function AppContent() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Ładowanie...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Prefer DB profile role; fall back to JWT user_metadata while profile loads
  const role = profile?.role ?? user.user_metadata?.role;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Konfigurowanie konta...</span>
        </div>
      </div>
    );
  }

  if (role === 'internal') {
    return <InternalDashboard />;
  }

  return <ExternalDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
