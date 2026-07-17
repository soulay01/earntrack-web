'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CalendarDays, Copy, Check, RefreshCw } from 'lucide-react';

export default function CalendarSubscriptionPage() {
  const { user, loading, company, companyId, refresh } = useData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (loading || !user) return <PageSkeleton variant="form" maxWidth="max-w-2xl" />;

  const token: string | undefined = company?.calendarToken;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.earntrack.de';
  const feedUrl = token ? `${origin}/api/calendar/${token}` : '';
  const webcalUrl = token ? feedUrl.replace(/^https?:\/\//, 'webcal://') : '';

  const generateToken = async (regenerate: boolean) => {
    if (!companyId) return;
    if (regenerate && !confirm('Neuen Link erstellen? Der alte Kalender-Link funktioniert danach nicht mehr — bereits abonnierte Kalender müssen neu eingerichtet werden.')) return;
    setBusy(true);
    try {
      const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      await updateDoc(doc(db, 'companies', companyId), { calendarToken: newToken });
      await refresh();
    } catch (e) {
      alert('Fehler beim Erstellen des Kalender-Links: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Konnte nicht in die Zwischenablage kopieren.');
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-6">
          <div>
            <a href="/settings" onClick={e => { e.preventDefault(); router.push('/settings'); }} className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Kalender-Abo</h1>
            <p className="text-slate-500 text-sm mt-1">Deine Termine automatisch in Apple Kalender oder Google Kalender anzeigen</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-teal-600" /> Kalender abonnieren</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ein Abo-Link, der sich automatisch aktualisiert — kein Export, kein manuelles Neuladen. Funktioniert mit Apple Kalender (iOS &amp; macOS) und Google Kalender.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {!token ? (
                <button
                  onClick={() => generateToken(false)}
                  disabled={busy}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? 'Erstelle Link…' : 'Kalender-Link erstellen'}
                </button>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input readOnly value={feedUrl} onFocus={e => e.target.select()}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-600 bg-slate-50 focus:outline-none" />
                    <button onClick={copyLink}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 shrink-0">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Kopiert' : 'Kopieren'}
                    </button>
                  </div>

                  <a href={webcalUrl}
                    className="block w-full text-center py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 transition-all active:scale-[0.98]">
                    In Apple/Google Kalender öffnen
                  </a>

                  <button
                    onClick={() => generateToken(true)}
                    disabled={busy}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Neuen Link generieren
                  </button>
                </>
              )}

              <div className="text-xs text-slate-400 bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
                <p><b className="text-slate-500">Google Kalender:</b> Link kopieren → Google Kalender öffnen → „Weitere Kalender" → „Per URL" → Link einfügen.</p>
                <p><b className="text-slate-500">Apple Kalender (iPhone/Mac):</b> Auf „In Apple/Google Kalender öffnen" tippen, oder manuell unter Einstellungen → Kalender → Account hinzufügen → Andere → Kalenderabo.</p>
                <p>Der Link ist geheim wie ein Passwort — nicht öffentlich teilen. Termine sind read-only und aktualisieren sich automatisch (Änderungen im Kalender selbst wirken sich nicht auf EarnTrack aus).</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
