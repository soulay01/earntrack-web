'use client';

import { useData } from '@/app/Provider';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { filterByTimeRange, formatCurrency, parseDate } from '@/lib/utils';
import Sidebar from '@/components/Sidebar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function getGrade(m: number) {
  if (m > 50) return 'A+';
  if (m >= 40) return 'A';
  if (m >= 25) return 'B';
  if (m >= 10) return 'C';
  if (m >= 0) return 'D';
  return 'F';
}
function gradeColor(g: string) {
  const m: Record<string, string> = {'A+':'text-green-600 bg-green-50 border-green-200','A':'text-green-500 bg-green-50 border-green-200','B':'text-lime-500 bg-lime-50 border-lime-200','C':'text-amber-500 bg-amber-50 border-amber-200','D':'text-orange-500 bg-orange-50 border-orange-200','F':'text-red-500 bg-red-50 border-red-200','–':'text-slate-400 bg-slate-50 border-slate-200'};
  return m[g] || m['–'];
}
function gradeHex(g: string) {
  const m: Record<string, string> = {'A+':'#16a34a','A':'#22c55e','B':'#84cc16','C':'#d97706','D':'#ea580c','F':'#dc2626','–':'#94a3b8'};
  return m[g] || '#94a3b8';
}

const timeFilters = [
  { key: 'alle', label: 'Alle' },
  { key: 'heute', label: 'Heute' },
  { key: 'woche', label: '7 Tage' },
  { key: 'monat', label: '30 Tage' },
  { key: '6monate', label: '6 Monate' },
  { key: 'jahr', label: 'Jahr' },
];

export default function DashboardPage() {
  const { user, loading, assignments: rawAssignments, employees: rawEmployees } = useData();
  const router = useRouter();
  const [range, setRange] = useState('alle');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  const assignments = useMemo(() => filterByTimeRange(rawAssignments || [], range), [rawAssignments, range]);
  const employees = rawEmployees || [];

  const summary = useMemo(() => {
    const a = assignments;
    if (!a.length) return { rev: 0, cost: 0, profit: 0, count: 0, avgM: 0, prof: 0, loss: 0, grade: '–' };
    let rev = 0, cost = 0;
    const grades: Record<string, number> = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    let profCount = 0, lossCount = 0;
    a.forEach(x => {
      const r = typeof x.umsatz === 'string' ? parseFloat(x.umsatz.replace(/[€\s.,]/g, '').replace(',', '.')) || 0 : (x.umsatz as number) || 0;
      const h = parseFloat(String(x.stunden)) || 0;
      const l = parseFloat(String(x.stundenlohn)) || 0;
      const c = h * l;
      rev += r; cost += c;
      const p = r - c;
      if (p > 0) profCount++; else if (p < 0) lossCount++;
    });
    const profit = rev - cost;
    const avgM = rev > 0 ? (profit / rev) * 100 : 0;
    const g = getGrade(avgM);
    a.forEach(x => {
      const r = typeof x.umsatz === 'string' ? parseFloat(x.umsatz.replace(/[€\s.,]/g, '').replace(',', '.')) || 0 : (x.umsatz as number) || 0;
      const h = parseFloat(String(x.stunden)) || 0;
      const l = parseFloat(String(x.stundenlohn)) || 0;
      const p = r - h * l;
      const m = r > 0 ? (p / r) * 100 : 0;
      const gg = getGrade(m);
      if (grades[gg] !== undefined) grades[gg]++;
    });
    return { rev, cost, profit, count: a.length, avgM, prof: profCount, loss: lossCount, grade: g, grades };
  }, [assignments]);

  const empRank = useMemo(() => {
    if (!employees.length) return [];
    return employees.map(e => {
      const name = e.name;
      const rate = parseFloat(String(e.stundenlohn)) || 0;
      const ea = assignments.filter(a => {
        const names = Array.isArray(a.mitarbeiter) ? a.mitarbeiter.map((n: string) => n.trim()) : (a.mitarbeiter || '').split(',').map((n: string) => n.trim());
        return names.includes(name);
      });
      if (!ea.length) return { name, grade: '–', profit: 0, margin: 0, hours: 0, count: 0 };
      const h = ea.reduce((s: number, a: any) => s + (parseFloat(String(a.stunden)) || 0), 0);
      const c = h * rate;
      let r = 0;
      ea.forEach((a: any) => {
        const names = Array.isArray(a.mitarbeiter) ? a.mitarbeiter.map((n: string) => n.trim()) : (a.mitarbeiter || '').split(',').map((n: string) => n.trim());
        const split = names.length > 0 ? 1 / names.length : 1;
        const rev = typeof a.umsatz === 'string' ? parseFloat(a.umsatz.replace(/[€\s.,]/g, '').replace(',', '.')) || 0 : (a.umsatz as number) || 0;
        r += rev * split;
      });
      const p = r - c;
      const m = r > 0 ? (p / r) * 100 : 0;
      return { name, grade: getGrade(m), profit: p, margin: m, hours: h, count: ea.length };
    }).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [employees, assignments]);

  const assignRank = useMemo(() => {
    return [...assignments].map(a => {
      const r = typeof a.umsatz === 'string' ? parseFloat(a.umsatz.replace(/[€\s.,]/g, '').replace(',', '.')) || 0 : (a.umsatz as number) || 0;
      const h = parseFloat(String(a.stunden)) || 0;
      const l = parseFloat(String(a.stundenlohn)) || 0;
      const c = h * l;
      const p = r - c;
      return { id: a.id, kunde: a.kunde, projekt: a.projekt, datum: a.datum, profit: p, margin: r > 0 ? (p / r) * 100 : 0, grade: getGrade(r > 0 ? (p / r) * 100 : 0) };
    }).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [assignments]);

  const chartData = useMemo(() => {
    const m: Record<string, any> = {};
    (rawAssignments || []).forEach(a => {
      const d = parseDate(a.datum);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!m[k]) m[k] = { name: d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), revenue: 0, cost: 0, profit: 0 };
      const r = typeof a.umsatz === 'string' ? parseFloat(a.umsatz.replace(/[€\s.,]/g, '').replace(',', '.')) || 0 : (a.umsatz as number) || 0;
      const h = parseFloat(String(a.stunden)) || 0;
      const rate = parseFloat(String(a.stundenlohn)) || 0;
      m[k].revenue += r; m[k].cost += h * rate; m[k].profit += r - h * rate;
    });
    return Object.values(m).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawAssignments]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-100">
      <div className="text-slate-400 text-sm animate-pulse">Laden...</div>
    </div>
  );
  if (!user) return null;

  const kpiClass = "bg-white rounded-xl border border-slate-200 p-6 shadow-sm";

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
              <p className="text-slate-500 text-sm mt-1">
                {summary.count} Einsatz{summary.count !== 1 ? 'e' : ''} &middot; {summary.prof} profitabel, {summary.loss} mit Verlust
              </p>
            </div>
            <div className="flex gap-1.5 flex-wrap bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
              {timeFilters.map(f => (
                <button key={f.key} onClick={() => setRange(f.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    range === f.key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >{f.label}</button>
              ))}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { label: 'Umsatz', val: formatCurrency(summary.rev), color: 'bg-green-500' },
              { label: 'Kosten', val: formatCurrency(summary.cost), color: 'bg-red-500' },
              { label: 'Gewinn', val: formatCurrency(summary.profit), color: summary.profit >= 0 ? 'bg-teal-600' : 'bg-red-500' },
              { label: 'Aufträge', val: String(summary.count), color: 'bg-amber-500' },
            ].map((k, i) => (
              <div key={k.label} className={`${kpiClass} animate-slideUp`} style={{ animationDelay: `${i * 70}ms` }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{k.label}</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{k.val}</p>
                <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${k.color} transition-all duration-700`} style={{ width: '65%' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Grade + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Grade */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm animate-slideUp" style={{ animationDelay: '280ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-5">Profit Score</p>
              {summary.count === 0 ? (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                    <span className="text-3xl font-black text-slate-300">–</span>
                  </div>
                  <p className="text-slate-400 text-sm">Keine Daten</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <div className={`w-24 h-24 rounded-2xl flex items-center justify-center mb-3 border ${gradeColor(summary.grade).split(' ').slice(1).join(' ')}`}>
                    <span className={`text-5xl font-black tracking-tight ${gradeColor(summary.grade).split(' ')[0]}`}>
                      {summary.grade}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight">{summary.avgM.toFixed(1)}%</p>
                  <p className="text-slate-400 text-sm mt-0.5">durchschnittliche Marge</p>
                </div>
              )}
              <div className="mt-6 space-y-2">
                {(['A+', 'A', 'B', 'C', 'D', 'F'] as const).map(g => {
                  const count = summary.grades?.[g] || 0;
                  const pct = summary.count > 0 ? (count / summary.count) * 100 : 0;
                  const hex = gradeHex(g);
                  return (
                    <div key={g} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs font-bold" style={{ color: hex }}>{g}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: hex }} />
                      </div>
                      <span className="w-4 text-right text-xs font-medium text-slate-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart */}
            <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm animate-slideUp" style={{ animationDelay: '360ms' }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-slate-900 font-semibold">Umsatz, Kosten &amp; Gewinn</h3>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Umsatz</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Kosten</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-teal-600" /> Gewinn</span>
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-72 text-slate-400 text-sm">Keine Daten vorhanden</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} formatter={(value: number) => [formatCurrency(value), '']} labelStyle={{ fontWeight: 600, marginBottom: 4 }} />
                      <Bar dataKey="revenue" name="Umsatz" fill="#22c55e" radius={[4,4,0,0]} maxBarSize={28} />
                      <Bar dataKey="cost" name="Kosten" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={28} />
                      <Bar dataKey="profit" name="Gewinn" fill="#0d9488" radius={[4,4,0,0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              { title: 'Mitarbeiter-Ranking', data: empRank, empty: 'Keine Mitarbeiter-Daten', type: 'emp' as const },
              { title: 'Einsatz-Ranking', data: assignRank, empty: 'Keine Einsätze in diesem Zeitraum', type: 'assign' as const },
            ].map((section, si) => (
              <div key={section.title} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp" style={{ animationDelay: `${440 + si * 80}ms` }}>
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-slate-900 font-semibold">{section.title}</h3>
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Top 8</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {section.data.length === 0 ? (
                    <div className="px-5 py-14 text-center text-slate-400 text-sm">{section.empty}</div>
                  ) : (
                    section.data.map((item: any, i: number) => (
                      <div key={item.name || item.id || i} className="flex items-center gap-3.5 px-5 py-3 hover:bg-slate-50 transition-colors">
                        <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? 'text-white' : 'text-slate-400 bg-slate-100'}`}
                          style={{ backgroundColor: i < 3 ? ['#f59e0b','#94a3b8','#d97706'][i] : '' }}>
                          {i + 1}
                        </span>
                        {section.type === 'emp' ? (
                          <>
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${gradeColor(item.grade)}`}>{item.grade}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-900 text-sm font-semibold truncate">{item.name}</p>
                              <p className="text-slate-400 text-xs">{item.count} Einsatz{item.count !== 1 ? 'e' : ''} &middot; {item.hours.toFixed(1)}h</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-slate-900 text-sm font-bold">{formatCurrency(item.profit)}</p>
                              <p className={`text-xs font-semibold ${item.margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{item.margin >= 0 ? '+' : ''}{item.margin.toFixed(1)}%</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${gradeColor(item.grade)}`}>{item.grade}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-900 text-sm font-semibold truncate">{item.kunde || 'Unbekannt'}</p>
                              <p className="text-slate-400 text-xs truncate">{item.projekt} &middot; {item.datum}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-slate-900 text-sm font-bold">{formatCurrency(item.profit)}</p>
                              <p className={`text-xs font-semibold ${item.margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{item.margin >= 0 ? '+' : ''}{item.margin.toFixed(1)}%</p>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
