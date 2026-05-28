import { useState } from 'react';
import { PlusCircle, LayoutDashboard, FileText, Users, History } from 'lucide-react';
import Sidebar from '../Sidebar';
import ShiftMasterLogo from '../ShiftMasterLogo';
import OrderForm from './OrderForm';
import OffersTable from './OffersTable';
import SuppliersPanel from './SuppliersPanel';
import { useAuth } from '../../context/AuthContext';

type Tab = 'dashboard' | 'new-order' | 'history' | 'suppliers';

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Przegląd ofert — aktywne postępowania',
  'new-order': 'Nowe zapotrzebowanie',
  history: 'Historia zamówień',
  suppliers: 'Zarządzanie Dostawcami',
};

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  dashboard: 'Otwarte postępowania i oferty w czasie rzeczywistym',
  'new-order': 'Wypełnij formularz i wyślij zapytanie do dostawców',
  history: 'Sfinalizowane i anulowane zamówienia',
  suppliers: 'Lista zarejestrowanych dostawców zewnętrznych',
};

export default function InternalDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard className="w-4 h-4" />, label: 'Przegląd ofert' },
    { id: 'new-order', icon: <PlusCircle className="w-4 h-4" />, label: 'Nowe zamówienie' },
    { id: 'history', icon: <History className="w-4 h-4" />, label: 'Historia zamówień' },
    { id: 'suppliers', icon: <Users className="w-4 h-4" />, label: 'Zarządzanie Dostawcami' },
  ];

  function handleOrderCreated() {
    setRefreshKey(k => k + 1);
    setActiveTab('dashboard');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} onTabChange={(t) => setActiveTab(t as Tab)} navItems={navItems} />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-800">{TAB_LABELS[activeTab]}</h1>
            <p className="text-slate-500 text-sm">
              {activeTab === 'dashboard' || activeTab === 'history' || activeTab === 'suppliers'
                ? TAB_DESCRIPTIONS[activeTab]
                : <>Witaj, <span className="font-medium text-slate-700">{profile?.full_name || 'Organizatorze'}</span></>
              }
            </p>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-sokolow-50 border border-sokolow-100 rounded-full">
              <FileText className="w-3.5 h-3.5 text-sokolow-600" />
              <span className="text-xs font-semibold text-sokolow-700">Pracownik Wewnętrzny</span>
            </div>
            <ShiftMasterLogo size="sm" />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-8">
          {activeTab === 'new-order' && (
            <div className="max-w-3xl">
              <OrderForm onOrderCreated={handleOrderCreated} />
            </div>
          )}
          {activeTab === 'dashboard' && (
            <div key={refreshKey}>
              <OffersTable view="active" />
            </div>
          )}
          {activeTab === 'history' && (
            <div key={`history-${refreshKey}`}>
              <OffersTable view="history" />
            </div>
          )}
          {activeTab === 'suppliers' && <SuppliersPanel />}
        </div>
      </main>
    </div>
  );
}
