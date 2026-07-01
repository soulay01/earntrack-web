'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { formatCurrency } from '@/lib/utils';
import { calculateAssignmentProfitScore } from '@/lib/smartPricing';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Folder, ChevronRight } from 'lucide-react';

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

  if (authLoading) return <PageSkeleton variant="cards" maxWidth="max-w-7xl" />;
  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Meine Projekte</h1>
            <p className="text-slate-500 text-sm mt-0.5">{projects.length} {projects.length === 1 ? 'Projekt' : 'Projekte'}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_56px] gap-4 px-4 py-2.5 border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <span>Projekt</span>
              <span className="text-right">Gewinn</span>
              <span className="text-right">Stunden</span>
              <span className="text-right">Score</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100">
              {projects.map(a => {
                const ps = calculateAssignmentProfitScore(a);
                return (
                  <div key={a.id} onClick={e => { e.preventDefault(); router.push(`/projects/${a.id}`); }}
                    className="group grid grid-cols-[minmax(0,1fr)_56px] md:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_56px] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{a.projekt || 'Unbenannt'}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {[a.kunde, a.datum, clockCounts[a.id] > 0 ? `${clockCounts[a.id]} Zeiteinträge` : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className={`hidden md:block text-sm font-medium text-right tabular-nums ${ps.profit >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                      {formatCurrency(ps.profit)}
                    </span>
                    <span className="hidden md:block text-sm text-slate-600 text-right tabular-nums">{ps.hours.toFixed(1)} h</span>
                    <span className="hidden md:flex justify-end">
                      <span className="inline-flex items-center justify-center w-7 h-6 rounded-md text-xs font-semibold"
                        style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg }}>
                        {ps.grade}
                      </span>
                    </span>
                    <span className="flex justify-end text-slate-300 group-hover:text-slate-500 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Folder className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">
                    {role === 'employee' ? 'Du bist noch keinem Projekt zugewiesen' : 'Noch keine Projekte vorhanden'}
                  </p>
                  {role !== 'employee' && (
                    <button onClick={() => router.push('/assignments')}
                      className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors">
                      Ersten Termin anlegen
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
