'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';

export default function NotificationSettingsPage() {
  const { user, loading } = useData();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  const [settings, setSettings] = useState({
    emailInvoices: true,
    emailReports: false,
    browserInvoices: true,
    browserReminders: true,
  });

  function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-all duration-300 active:scale-[0.95] shadow-sm ${
          checked ? 'bg-gradient-to-r from-teal-500 to-emerald-500' : 'bg-slate-300'
        }`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
          checked ? 'translate-x-6' : ''
        }`} />
      </button>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-2xl mx-auto space-y-6">
          <div className="animate-fadeIn">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Benachrichtigungen</h1>
            <p className="text-slate-500 text-sm mt-1">Verwalte deine Benachrichtungseinstellungen</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">E-Mail-Benachrichtigungen</h2>
            </div>
            <div className="p-6 space-y-5">
              {[
                { key: 'emailInvoices', label: 'Rechnungen & Kostenvoranschläge', desc: 'Erhalte eine Kopie per E-Mail' },
                { key: 'emailReports', label: 'Monatsberichte', desc: 'Zusammenfassung deiner Termine' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-sm transition-all duration-200">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                  <ToggleSwitch checked={(settings as any)[item.key]} onChange={v => setSettings(p => ({ ...p, [item.key]: v }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Browser-Benachrichtigungen</h2>
            </div>
            <div className="p-6 space-y-5">
              {[
                { key: 'browserInvoices', label: 'Rechnungs-Erinnerungen', desc: 'Erinnerung an ausstehende Rechnungen' },
                { key: 'browserReminders', label: 'Termin-Erinnerungen', desc: 'Bevorstehende Termine im Browser' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-sm transition-all duration-200">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                  <ToggleSwitch checked={(settings as any)[item.key]} onChange={v => setSettings(p => ({ ...p, [item.key]: v }))} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
