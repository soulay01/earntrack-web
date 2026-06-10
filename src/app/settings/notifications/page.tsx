'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Bell } from 'lucide-react';

const DEFAULTS = {
  browserInvoices: true,
  browserReminders: true,
  pushEnabled: false,
  pushSoundEnabled: true,
};

export default function NotificationSettingsPage() {
  const { user, loading, requestFcmPermission, removeFcmToken, fcmToken, fcmPermission } = useData();
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
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
    } catch (e) {
      console.error('save notification error:', e);
      getDoc(doc(db, 'users', user!.uid)).then(snap => {
        if (snap.exists()) {
          const saved = snap.data().notifications;
          if (saved) setSettings({ ...DEFAULTS, ...saved });
        }
      }).catch(e2 => console.error('rollback notification read error:', e2));
      alert('Fehler beim Speichern der Benachrichtigungseinstellungen');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePush = async (enabled: boolean) => {
    setPushLoading(true);
    setPushStatus(null);
    try {
      if (enabled) {
        const token = await requestFcmPermission();
        if (token) {
          setSettings(prev => ({ ...prev, pushEnabled: true }));
          await updateDoc(doc(db, 'users', user!.uid), { notifications: { ...settings, pushEnabled: true } });
          setPushStatus('✓ Push-Benachrichtigungen aktiviert');
        } else {
          setPushStatus('✗ Konnte Push nicht aktivieren. Bitte Benachrichtigungen im Browser erlauben.');
        }
      } else {
        await removeFcmToken();
        setSettings(prev => ({ ...prev, pushEnabled: false }));
        await updateDoc(doc(db, 'users', user!.uid), { notifications: { ...settings, pushEnabled: false } });
        setPushStatus('Push-Benachrichtigungen deaktiviert');
      }
    } catch (e: any) {
      setPushStatus('✗ Fehler: ' + (e.message || 'Unbekannt'));
    } finally {
      setPushLoading(false);
      setTimeout(() => setPushStatus(null), 4000);
    }
  };

  const handleTestPush = async () => {
    // Test browser notification via FCM
    if (typeof Notification === 'undefined') {
      alert('Browser-Benachrichtigungen werden nicht unterstützt');
      return;
    }
    if (Notification.permission === 'denied') {
      alert('Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Browser-Einstellungen.');
      return;
    }
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { alert('Benachrichtigungen wurden nicht erlaubt.'); return; }
    }
    new Notification('EarnTrack', {
      body: 'Push-Benachrichtigungen funktionieren!',
      icon: '/logo.png?v=2',
      ...({ vibrate: [200, 100, 200], badge: '/favicon-new.png', requireInteraction: true } as any),
    });
    // Play notification sound
    // Play notification sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) { console.error('test sound error:', e); }
  };

  function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
      <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
        className={`relative w-12 h-6 rounded-full transition-all duration-300 active:scale-[0.95] shadow-sm ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
        } ${
          checked ? 'bg-gradient-to-r from-teal-500 to-emerald-500' : 'bg-slate-300'
        }`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
          checked ? 'translate-x-6' : ''
        }`} />
      </button>
    );
  }

  function StatusBar({ text, type }: { text: string | null; type?: 'success' | 'error' | 'info' }) {
    if (!text) return null;
    const colors = type === 'success' ? 'bg-green-50 border-green-200 text-green-700'
      : type === 'error' ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-blue-50 border-blue-200 text-blue-700';
    return (
      <div className={`p-3 rounded-xl border ${colors} text-sm font-medium transition-all duration-300`}>
        {text}
      </div>
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
                <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Benachrichtigungen</h1>
                <p className="text-slate-500 text-sm mt-1">Verwalte deine Benachrichtigungseinstellungen</p>
              </div>
              {saving && <span className="text-xs text-slate-400 font-semibold">Speichern...</span>}
              {saved && <span className="text-xs text-green-600 font-semibold">Gespeichert</span>}
            </div>
          </div>

          {/* Push-Benachrichtigungen */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ">
            <div className="px-6 py-4 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Push-Benachrichtigungen</h2>
              <p className="text-xs text-slate-500 mt-0.5">Echtzeit-Benachrichtigungen von neuen Notizen, Fotos und Team-Aktivitäten</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-sm transition-all duration-200">
                <div>
                  <p className="text-sm font-bold text-slate-900">Push aktivieren</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fcmToken
                      ? '✓ Push ist registriert – du erhältst Benachrichtigungen auch wenn die Seite geschlossen ist'
                      : 'Erhalte Benachrichtigungen über neue Aktivitäten in deinen Projekten'}
                  </p>
                  {fcmPermission === 'unsupported' && (
                    <p className="text-xs text-amber-600 mt-1">Dieser Browser unterstützt keine Push-Benachrichtigungen</p>
                  )}
                  {fcmPermission === 'denied' && (
                    <p className="text-xs text-red-600 mt-1">Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {pushLoading && <span className="w-4 h-4 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />}
                  <ToggleSwitch
                    checked={settings.pushEnabled}
                    onChange={handleTogglePush}
                    disabled={fcmPermission === 'unsupported'}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-sm transition-all duration-200">
                <div>
                  <p className="text-sm font-bold text-slate-900">Sound bei Push</p>
                  <p className="text-xs text-slate-400 mt-0.5">Ein kurzer Signalton bei eingehenden Benachrichtigungen</p>
                </div>
                <ToggleSwitch
                  checked={settings.pushSoundEnabled}
                  onChange={v => update('pushSoundEnabled', v)}
                  disabled={!settings.pushEnabled}
                />
              </div>

              <StatusBar text={pushStatus} type={pushStatus?.includes('✓') ? 'success' : pushStatus?.includes('✗') ? 'error' : 'info'} />

              <button onClick={handleTestPush}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 text-teal-700 hover:from-teal-100 hover:to-emerald-100 hover:shadow-sm active:scale-[0.97] transition-all">
                <Bell className="inline w-4 h-4 mr-1" /> Test-Benachrichtigung senden
              </button>
            </div>
          </div>

          {/* Browser-Benachrichtigungen */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ">
            <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Erinnerungen</h2>
              <p className="text-xs text-slate-500 mt-0.5">Browser-Erinnerungen für Termine und Rechnungen</p>
            </div>
            <div className="p-6 space-y-5">
              {[
                { key: 'browserInvoices', label: 'Rechnungs-Erinnerungen', desc: 'Erinnerung an ausstehende Rechnungen (3 Tage vor Fälligkeit)' },
                { key: 'browserReminders', label: 'Termin-Erinnerungen', desc: 'Bevorstehende Termine – am Tag selbst & einen Tag vorher' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-sm transition-all duration-200">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                  <ToggleSwitch checked={(settings as any)[item.key]} onChange={v => update(item.key, v)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
