'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import LoadingScreen from '@/components/LoadingScreen';
import { formatCurrency } from '@/lib/utils';
import { calculateAssignmentProfitScore } from '@/lib/smartPricing';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function ProjectsPage() {
  const { user, loading: authLoading, role, assignments, myProjects } = useData();
  const router = useRouter();
  const [clockCounts, setClockCounts] = useState<Record<string, number>>({});

  const projects = role === 'employee' ? myProjects : assignments;

  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [user, authLoading, router]);

  useEffect(() => {
    if (!projects.length) return;
    const ids = projects.map(a => a.id);
    Promise.all(ids.map(async (id) => {
      const snap = await getDocs(query(collection(db, 'clock_entries'), where('assignmentId', '==', id)));
      return { id, count: snap.size };
    })).then(results => {
      const map: Record<string, number> = {};
      results.forEach(r => map[r.id] = r.count);
      setClockCounts(map);
    }).catch(e => console.error('load clock counts error:', e));
  }, [projects]);

  if (authLoading) return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <LoadingScreen fullScreen={false} />
      </main>
    </div>
  );
  if (!user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-7xl mx-auto">
          <div className="mb-6 ">
            <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Meine Projekte</h1>
            <p className="text-slate-500 text-sm mt-1">{projects.length} Projekte</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
            {projects.map((a, i) => {
              const ps = calculateAssignmentProfitScore(a);
              return (
                <div key={a.id} onClick={e => { e.preventDefault(); router.push(`/projects/${a.id}`); }}
                  className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-pointer "
                  style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 to-emerald-400" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-900 font-bold truncate group-hover:text-teal-700 transition-colors">{a.projekt || 'Unbenannt'}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{a.kunde} &middot; {a.datum}</p>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border shrink-0"
                        style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg, borderColor: ps.gradeColor + '33' }}>
                        {ps.grade}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{formatCurrency(ps.profit)}</span>
                      <span>{ps.hours.toFixed(1)}h</span>
                      {clockCounts[a.id] > 0 && <span className="text-teal-600 font-medium">{clockCounts[a.id]} Einträge</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {projects.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <p className="text-slate-500 text-base">
                  {role === 'employee' ? 'Du bist noch keinem Projekt zugewiesen' : 'Noch keine Projekte vorhanden'}
                </p>
                {role !== 'employee' && (
                  <button onClick={() => router.push('/assignments')}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
                    Ersten Termin anlegen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
