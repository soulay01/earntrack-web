'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import LoadingScreen from '@/components/LoadingScreen';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { adminDeleteUser } from '@/lib/admin';

export default function EmployeeCredentialsPage() {
  const { user, loading: authLoading, employees, refresh, company } = useData();
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

  if (authLoading) return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <LoadingScreen fullScreen={false} />
      </main>
    </div>
  );
  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-5xl mx-auto">
          <div className="mb-8 ">
            <a href="/settings" className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Zugangsverwaltung</h1>
            <p className="text-slate-500 text-sm mt-1">Übersicht aller Mitarbeiter mit Login-Zugang</p>
          </div>

          {withCredentials.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center ">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔑</span>
              </div>
              <p className="text-slate-500 text-base font-semibold mb-2">Keine aktiven Zugänge</p>
              <p className="text-slate-400 text-sm">Mitarbeiter-Zugänge werden über den Team-Tab in einem Projekt erstellt.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ">
              <div className="hidden md:grid grid-cols-[1fr_1.3fr_0.7fr_auto] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Mitarbeiter</span>
                <span>Login-E-Mail</span>
                <span>Stundenlohn</span>
                <span></span>
              </div>
              <div className="divide-y divide-slate-100">
                {withCredentials.map((emp: any, i: number) => (
                  <div key={emp.id} className="" style={{ animationDelay: `${i * 40}ms` }}>
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-[1fr_1.3fr_0.7fr_auto] gap-4 items-center px-6 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                          <img src={emp.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm font-bold flex items-center justify-center">
                            {(emp.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-slate-800">{emp.name || 'Unbekannt'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 font-mono">{emp.email || '—'}</span>
                        {emp.email && (
                          <button onClick={() => copyEmail(emp.email)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-[0.9] transition-all text-xs">
                            {copiedEmail === emp.email ? (
                              <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            )}
                          </button>
                        )}
                      </div>
                      <span className="text-sm text-slate-500">{emp.stundenlohn ? `${parseFloat(emp.stundenlohn).toFixed(2)}€/h` : '—'}</span>
                      <button onClick={() => deleteCredentials(emp)} disabled={deleting === emp.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 active:scale-[0.95] transition-all disabled:opacity-50">
                        {deleting === emp.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        )}
                        Entfernen
                      </button>
                    </div>

                    {/* Mobile row */}
                    <div className="md:hidden p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                            <img src={emp.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm font-bold flex items-center justify-center">
                              {(emp.name || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-bold text-slate-800">{emp.name || 'Unbekannt'}</p>
                            {emp.stundenlohn && <p className="text-xs text-slate-400">{parseFloat(emp.stundenlohn).toFixed(2)}€/h</p>}
                          </div>
                        </div>
                        <button onClick={() => deleteCredentials(emp)} disabled={deleting === emp.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 active:scale-[0.95] transition-all disabled:opacity-50">
                          {deleting === emp.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          )}
                          Entfernen
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-xs text-slate-500 font-medium">Login-E-Mail</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-slate-800">{emp.email || '—'}</span>
                          {emp.email && (
                            <button onClick={() => copyEmail(emp.email)}
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-[0.9] transition-all text-xs">
                              {copiedEmail === emp.email ? (
                                <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 text-right">
                {withCredentials.length} {withCredentials.length === 1 ? 'Zugang' : 'Zugänge'}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
