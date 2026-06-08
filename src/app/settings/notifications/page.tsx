'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DEFAULTS = {
  browserInvoices: true,
  browserReminders: true,
};

export default function NotificationSettingsPage() {
  const { user, loading } = useData();
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data().notifications;
        if (data) setSettings({ ...DEFAULTS, ...data });
      }
    }).catch((e) => console.error('Failed to load notification settings:', e));
  }, [user]);
  if (loading || !user) return null;

  const update = async (key: string, val: boolean) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, 'users', user!.uid), { notifications: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

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
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-6">
          <div className="">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Benachrichtigungen</h1>
                <p className="text-slate-500 text-sm mt-1">Verwalte deine Benachrichtungseinstellungen</p>
              </div>
              {saving && <span className="text-xs text-slate-400 font-semibold">Speichern...</span>}
              {saved && <span className="text-xs text-green-600 font-semibold">Gespeichert</span>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ">
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
                  <ToggleSwitch checked={(settings as any)[item.key]} onChange={v => update(item.key, v)} />
                </div>
              ))}
              <button onClick={async () => {
                if (typeof Notification === 'undefined') { alert('Browser-Benachrichtigungen werden nicht unterstützt'); return; }
                if (Notification.permission === 'denied') { alert('Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Browser-Einstellungen.'); return; }
                if (Notification.permission === 'default') {
                  const p = await Notification.requestPermission();
                  if (p !== 'granted') { alert('Benachrichtigungen wurden nicht erlaubt.'); return; }
                }
                new Notification('🔔 EarnTrack', { body: 'Browser-Benachrichtigungen funktionieren!', icon: '/logo.png?v=2' });
              }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-700 hover:from-amber-100 hover:to-orange-100 hover:shadow-sm active:scale-[0.97] transition-all">
                Test-Benachrichtigung senden
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
