import { LogOut, User, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ShiftMasterLogo from './ShiftMasterLogo';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  navItems: { id: string; icon: React.ReactNode; label: string }[];
}

export default function Sidebar({ activeTab, onTabChange, navItems }: SidebarProps) {
  const { profile, signOut } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 flex flex-col min-h-screen">
      {/* Red top border accent */}
      <div className="h-1 bg-sokolow-600" />

      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sokolow-600 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5 w-[18px] h-[18px]">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div className="text-base font-bold leading-none tracking-tight">
              <span className="text-white">Shift</span>
              <span className="text-sokolow-400">Master</span>
            </div>
            <p className="text-slate-500 text-[10px] mt-0.5 tracking-wider uppercase">Portal Zakupowy</p>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-4 py-3 mx-4 mt-4 bg-slate-800 rounded-lg border border-slate-700/50">
        <p className="text-slate-400 text-xs mb-1">Zalogowany jako</p>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${profile?.role === 'internal' ? 'bg-sokolow-400' : 'bg-emerald-400'}`} />
          <span className="text-white text-sm font-medium truncate">
            {profile?.role === 'internal' ? 'Pracownik Wewnętrzny' : 'Dostawca Zewnętrzny'}
          </span>
        </div>
        {profile?.company_name && (
          <p className="text-slate-500 text-xs mt-1 truncate">{profile.company_name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 mt-6 space-y-0.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
              activeTab === item.id
                ? 'bg-sokolow-600 text-white shadow-lg shadow-sokolow-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {activeTab === item.id && <ChevronRight className="w-4 h-4 opacity-70" />}
          </button>
        ))}
      </nav>

      {/* User info & logout */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{profile?.full_name || 'Użytkownik'}</p>
            <p className="text-slate-500 text-xs truncate">{profile?.role === 'internal' ? 'Organizator' : 'Dostawca'}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm transition"
        >
          <LogOut className="w-4 h-4" />
          Wyloguj się
        </button>
      </div>
    </aside>
  );
}
