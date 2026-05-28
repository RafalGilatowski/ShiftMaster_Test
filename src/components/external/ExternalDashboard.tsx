import { useState } from 'react';
import { Inbox, FileText } from 'lucide-react';
import Sidebar from '../Sidebar';
import ShiftMasterLogo from '../ShiftMasterLogo';
import OrdersList from './OrdersList';
import MyOffers from './MyOffers';
import { useAuth } from '../../context/AuthContext';

type Tab = 'orders' | 'my-offers';

export default function ExternalDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('orders');

  const navItems = [
    { id: 'orders', icon: <Inbox className="w-4 h-4" />, label: 'Zapotrzebowania' },
    { id: 'my-offers', icon: <FileText className="w-4 h-4" />, label: 'Moje oferty' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} onTabChange={(t) => setActiveTab(t as Tab)} navItems={navItems} />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-800">
              {activeTab === 'orders' ? 'Aktywne zapotrzebowania' : 'Moje oferty'}
            </h1>
            <p className="text-slate-500 text-sm">
              Witaj,{' '}
              <span className="font-medium text-slate-700">
                {profile?.company_name || profile?.full_name || 'Dostawco'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full">
              <Inbox className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Dostawca Zewnętrzny</span>
            </div>
            <ShiftMasterLogo size="sm" />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-8">
          {activeTab === 'orders' && <OrdersList />}
          {activeTab === 'my-offers' && <MyOffers />}
        </div>
      </main>
    </div>
  );
}
