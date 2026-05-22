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

  const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all';

  function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-all ${checked ? 'bg-teal-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'translate-x-5' : ''}`} />
      </button>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-2xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-medium mb-2 inline-block">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Benachrichtigungen</h1>
            <p className="text-slate-500 text-sm mt-1">Verwalte deine Benachrichtungseinstellungen</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">E-Mail-Benachrichtigungen</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Rechnungen &amp; Kostenvoranschläge</p>
                  <p className="text-xs text-slate-400">Erhalte eine Kopie per E-Mail</p>
                </div>
                <ToggleSwitch checked={settings.emailInvoices} onChange={v => setSettings(p => ({ ...p, emailInvoices: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Monatsberichte</p>
                  <p className="text-xs text-slate-400">Zusammenfassung deiner Einsätze</p>
                </div>
                <ToggleSwitch checked={settings.emailReports} onChange={v => setSettings(p => ({ ...p, emailReports: v }))} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6 animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Browser-Benachrichtigungen</h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Rechnungs-Erinnerungen</p>
                  <p className="text-xs text-slate-400">Erinnerung an ausstehende Rechnungen</p>
                </div>
                <ToggleSwitch checked={settings.browserInvoices} onChange={v => setSettings(p => ({ ...p, browserInvoices: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Einsatz-Erinnerungen</p>
                  <p className="text-xs text-slate-400">Bevorstehende Einsätze im Browser</p>
                </div>
                <ToggleSwitch checked={settings.browserReminders} onChange={v => setSettings(p => ({ ...p, browserReminders: v }))} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
