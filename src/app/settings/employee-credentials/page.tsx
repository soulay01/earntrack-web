'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { Key, Shield } from 'lucide-react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { adminDeleteUser } from '@/lib/admin';

export default function EmployeeCredentialsPage() {
  const { user, loading: authLoading, employees, refresh } = useData();
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [user, authLoading, router]);

  const withCredentials = employees.filter((e: any) => e.hasCredentials);

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (e) { console.error('copy email error:', e); }
  };

  const deleteCredentials = async (emp: any) => {
    if (!confirm(`Zugangsdaten für ${emp.name} wirklich löschen?`)) return;
    setDeleting(emp.id);
    const errors: string[] = [];
    try {
      if (emp.email) {
        try { await adminDeleteUser(user, undefined, emp.email); } catch (e1) { errors.push('adminDeleteUser: ' + e1); }
      }
      const uid = emp.authUid;
      if (uid) {
        try { await deleteDoc(doc(db, 'users', uid)); } catch (e2) { errors.push('deleteUserDoc: ' + e2); }
      }
      await updateDoc(doc(db, 'employees', emp.id), { hasCredentials: false, needsSetup: false, authUid: null });
      if (errors.length) console.error('deleteCredentials partial errors:', errors);
      refresh();
    } catch (e) {
      console.error('delete credentials error:', e);
      alert('Fehler beim Löschen der Zugangsdaten.');
    } finally {
      setDeleting(null);
    }
  };

  if (authLoading) return <PageSkeleton variant="form" maxWidth="max-w-5xl" />;
  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-5xl mx-auto space-y-6">

          {/* Back link */}
          <a href="/settings" className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Zurück zu Einstellungen
          </a>

          {/* Header panel */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8">
            {/* Decorative ring */}
            <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full border border-indigo-500/20 pointer-events-none" />
            <div className="absolute -top-4 -right-4 w-36 h-36 rounded-full border border-indigo-500/10 pointer-events-none" />

            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-indigo-300" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Zugangsverwaltung</h1>
                  <p className="text-indigo-300/80 text-sm mt-0.5">Login-Zugänge deiner Mitarbeiter</p>
                </div>
              </div>

              {withCredentials.length > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-3xl font-black text-white">{withCredentials.length}</p>
                  <p className="text-xs text-indigo-300/70 font-medium mt-0.5">
                    {withCredentials.length === 1 ? 'aktiver Zugang' : 'aktive Zugänge'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Empty state */}
          {withCredentials.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-16 text-center">
              <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-4">
                <Key className="w-7 h-7 text-indigo-400" />
              </div>
              <p className="text-slate-700 font-bold text-base mb-1">Keine aktiven Zugänge</p>
              <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                Mitarbeiter-Zugänge werden über den Team-Tab in einem Projekt erstellt.
              </p>
            </div>
          )}

          {/* Credential cards */}
          {withCredentials.length > 0 && (
            <div className="space-y-3">
              {withCredentials.map((emp: any) => (
                <div key={emp.id}
                  className="group relative bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-200 overflow-hidden">

                  {/* Left accent bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-l-2xl" />

                  <div className="pl-5 pr-4 py-4 flex items-center gap-4">
                    {/* Avatar */}
                    <div className="shrink-0">
                      {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                        <img src={emp.imageUrl} alt="" className="w-11 h-11 rounded-xl object-cover ring-2 ring-indigo-100" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-base font-bold flex items-center justify-center ring-2 ring-indigo-100">
                          {(emp.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{emp.name || 'Unbekannt'}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Aktiv
                        </span>
                        {emp.stundenlohn && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                            {parseFloat(emp.stundenlohn).toFixed(2)}€/h
                          </span>
                        )}
                      </div>

                      {/* Email row */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 min-w-0">
                          <Key className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span className="text-xs font-mono text-slate-600 truncate">{emp.email || '—'}</span>
                        </div>
                        {emp.email && (
                          <button onClick={() => copyEmail(emp.email)}
                            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-[0.9] transition-all"
                            title="E-Mail kopieren">
                            {copiedEmail === emp.email ? (
                              <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Delete action */}
                    <button onClick={() => deleteCredentials(emp)} disabled={deleting === emp.id}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 border border-red-100 hover:border-red-200 active:scale-[0.95] transition-all disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100">
                      {deleting === emp.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      )}
                      Entfernen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}


        </div>
      </main>
    </div>
  );
}
