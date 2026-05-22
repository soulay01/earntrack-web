'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { formatCurrency } from '@/lib/utils';
import { calculateAssignmentProfitScore, getGradeColor, getGradeBg } from '@/lib/smartPricing';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ProjectsPage() {
  const { user, loading: authLoading, assignments, companyId } = useData();
  const router = useRouter();
  const [clockCounts, setClockCounts] = useState<Record<string, number>>({});

  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [user, authLoading, router]);

  useEffect(() => {
    if (!assignments.length) return;
    const ids = assignments.map(a => a.id);
    Promise.all(ids.map(async (id) => {
      const snap = await getDocs(query(collection(db, 'clock_entries'), where('assignmentId', '==', id)));
      return { id, count: snap.size };
    })).then(results => {
      const map: Record<string, number> = {};
      results.forEach(r => map[r.id] = r.count);
      setClockCounts(map);
    });
  }, [assignments]);

  if (authLoading) return (
    <div className="flex h-screen bg-slate-100"><Sidebar /><main className="flex-1 flex items-center justify-center"><p className="text-slate-400 animate-pulse">Laden...</p></main></div>
  );
  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-5xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Meine Projekte</h1>
            <p className="text-slate-500 text-sm mt-1">{assignments.length} Projekte</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {assignments.map((a, i) => {
              const ps = calculateAssignmentProfitScore(a);
              return (
                <a key={a.id} href={`/projects/${a.id}`} onClick={e => { e.preventDefault(); router.push(`/projects/${a.id}`); }}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-teal-200 transition-all animate-slideUp group"
                  style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-900 font-semibold truncate group-hover:text-teal-700 transition-colors">{a.projekt || 'Unbenannt'}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{a.kunde} &middot; {a.datum}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border shrink-0`}
                      style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg, borderColor: ps.gradeColor + '33' }}>
                      {ps.grade}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>💰 {formatCurrency(ps.profit)}</span>
                    <span>⏱ {ps.hours.toFixed(1)}h</span>
                    {clockCounts[a.id] > 0 && <span>📋 {clockCounts[a.id]} Einträge</span>}
                  </div>
                </a>
              );
            })}
            {assignments.length === 0 && (
              <div className="col-span-full bg-white rounded-xl border border-slate-200 p-16 text-center shadow-sm">
                <p className="text-slate-500 text-base">Noch keine Projekte vorhanden</p>
                <button onClick={() => router.push('/assignments')}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-all text-sm">
                  Ersten Einsatz anlegen
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
