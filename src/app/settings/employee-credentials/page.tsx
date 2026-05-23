'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';

export default function EmployeeCredentialsPage() {
  const { user, loading: authLoading, employees } = useData();
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [user, authLoading, router]);

  const withCredentials = employees.filter((e: any) => e._storedPassword);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  if (authLoading) return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
<img src="/logo.png" alt="EarnTrack" className="w-10 h-10 rounded-full object-cover shadow-lg shadow-teal-200/30" />
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </main>
    </div>
  );
  if (!user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-3xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mitarbeiter-Zugangsdaten</h1>
            <p className="text-slate-500 text-sm mt-1">E-Mail und Passwort für erstellte Mitarbeiter-Accounts</p>
          </div>

          {withCredentials.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center animate-slideUp">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <span className="text-3xl">🔑</span>
              </div>
              <p className="text-slate-500 text-base font-semibold mb-2">Keine Mitarbeiter mit Zugangsdaten</p>
              <p className="text-slate-400 text-sm">Mitarbeiter erhalten Zugangsdaten, wenn du sie über das Team-Modal in einem Projekt erstellst.</p>
            </div>
          ) : (
            <div className="space-y-4 animate-slideUp">
              {withCredentials.map((emp: any, i: number) => (
                <div key={emp.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp"
                  style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="h-1 w-full bg-gradient-to-r from-teal-500 to-emerald-400" />
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                      {(emp.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-slate-900 font-bold">{emp.name || 'Unbekannt'}</p>
                      {emp.stundenlohn && <p className="text-xs text-slate-400">{parseFloat(emp.stundenlohn).toFixed(2)}€/h</p>}
                    </div>
                  </div>
                  <div className="px-6 py-4 space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200">
                      <span className="text-sm text-slate-500 font-medium">📧 E-Mail</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{emp.email || '—'}</span>
                        {emp.email && (
                          <button onClick={() => copy(emp.email, `email-${emp.id}`)}
                            className="p-1.5 rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600 hover:from-teal-100 hover:to-emerald-100 active:scale-[0.9] transition-all text-xs shadow-sm">
                            {copiedId === `email-${emp.id}` ? '✅' : '📋'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200">
                      <span className="text-sm text-slate-500 font-medium">🔐 Passwort</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-slate-800">{emp._storedPassword || '—'}</span>
                        {emp._storedPassword && (
                          <button onClick={() => copy(emp._storedPassword, `pw-${emp.id}`)}
                            className="p-1.5 rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600 hover:from-teal-100 hover:to-emerald-100 active:scale-[0.9] transition-all text-xs shadow-sm">
                            {copiedId === `pw-${emp.id}` ? '✅' : '📋'}
                          </button>
                        )}
                      </div>
                    </div>
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
