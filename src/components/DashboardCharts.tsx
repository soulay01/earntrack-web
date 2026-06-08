'use client';

import { memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '@/lib/utils';

const BarShape = memo((props: any) => {
  const { x, y, width, height, fill, onMouseEnter, onMouseLeave } = props;
  const h = Math.abs(height);
  if (h < 1) return null;
  const topY = height >= 0 ? y : y + height;
  const w = width;
  const r = Math.min(12, h / 2);
  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <rect x={x} y={topY} width={w} height={h} rx={r} ry={r} fill={fill} filter="url(#barShadow)" />
      <rect x={x} y={topY} width={w} height={h * 0.3} rx={r} ry={r} fill="url(#gloss)" />
    </g>
  );
});
BarShape.displayName = 'BarShape';

const BarTooltip = memo(({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const getColor = (p: any) => {
    if (p.dataKey === 'revenue') return '#22c55e';
    if (p.dataKey === 'cost') return '#d97706';
    if (p.dataKey === 'profit') return p.value >= 0 ? '#0d9488' : '#dc2626';
    return p.color;
  };
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-xl px-4 py-3 text-sm">
      <p className="font-bold text-slate-900 mb-2 text-xs">{label}</p>
      <div className="space-y-1.5">
        {payload.map((p: any) => {
          const c = getColor(p);
          return (
            <div key={p.name} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c }} />
              <span className="text-slate-500 text-xs">{p.dataKey === 'profit' ? (p.value >= 0 ? 'Gewinn' : 'Verlust') : p.name}</span>
              <span className="font-bold text-slate-900 text-xs ml-auto" style={{ color: c }}>{formatCurrency(p.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
BarTooltip.displayName = 'BarTooltip';

const PieTooltip = memo(({ active, payload, total }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const val = Number(d.value) || 0;
  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-xl px-4 py-3 text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.payload.color }} />
        <span className="font-bold text-slate-900">Note {d.name}</span>
      </div>
      <p className="text-slate-500 text-xs">{val} Termin{val !== 1 ? 'e' : ''} ({pct}%)</p>
    </div>
  );
});
PieTooltip.displayName = 'PieTooltip';

const GRADES = [
  { name: 'A+', color: '#16a34a' },
  { name: 'A', color: '#22c55e' },
  { name: 'B', color: '#84cc16' },
  { name: 'C', color: '#f59e0b' },
  { name: 'D', color: '#f97316' },
  { name: 'F', color: '#ef4444' },
];

interface Props {
  chartData: any[];
  chartView: string;
  summary: any;
  yMin: number;
  yMax: number;
  onViewChange: (v: string) => void;
}

export default function DashboardCharts({ chartData, chartView, summary, yMin, yMax, onViewChange }: Props) {
  return (
    <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <h3 className="text-slate-900 font-bold">{chartView === 'bar' ? 'Finanzenüberblick' : 'Noten-Verteilung'}</h3>
        <div className="flex items-center gap-3">
          {chartView === 'bar' && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#22c55e' }} /> Umsatz</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#d97706' }} /> Kosten</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: summary.profit >= 0 ? '#0d9488' : '#dc2626' }} /> {summary.profit >= 0 ? 'Gewinn' : 'Verlust'}</span>
            </div>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => onViewChange('bar')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all active:scale-[0.95] ${chartView === 'bar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>Balken</button>
            <button onClick={() => onViewChange('pie')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all active:scale-[0.95] ${chartView === 'pie' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>Kuchen</button>
          </div>
        </div>
      </div>
      {chartView === 'bar' ? (
        chartData.length === 0 ? (
          <div className="flex items-center justify-center h-80 text-slate-400 text-sm">Keine Daten vorhanden</div>
        ) : (
          <div className="h-80 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} barCategoryGap="20%">
                <defs>
                  <filter id="barShadow" x="-20%" y="-20%" width="150%" height="150%">
                    <feDropShadow dx={0} dy={3} stdDeviation={4} floodColor="rgba(0,0,0,0.15)" />
                  </filter>
                  <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
                    <stop offset="40%" stopColor="#ffffff" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="#000000" stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" stopOpacity={1} />
                    <stop offset="50%" stopColor="#22c55e" stopOpacity={1} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={1} />
                    <stop offset="50%" stopColor="#d97706" stopOpacity={1} />
                    <stop offset="100%" stopColor="#b45309" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={1} />
                    <stop offset="50%" stopColor="#0d9488" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="gradLoss" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                    <stop offset="50%" stopColor="#991b1b" stopOpacity={1} />
                    <stop offset="100%" stopColor="#7f1d1d" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} dy={6} />
                <YAxis domain={[yMin, yMax]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} dx={-4} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="revenue" name="Umsatz" fill="url(#gradRevenue)" maxBarSize={42} animationDuration={800} animationEasing="ease-out" shape={<BarShape />} />
                <Bar dataKey="cost" name="Kosten" fill="url(#gradCost)" maxBarSize={42} animationDuration={800} animationEasing="ease-out" animationBegin={150} shape={<BarShape />} />
                <Bar dataKey="profit" name="Gewinn" maxBarSize={42} animationDuration={800} animationEasing="ease-out" animationBegin={300} shape={<BarShape />}>
                  {chartData.map((d: any, idx: number) => (
                    <Cell key={idx} fill={d.profit >= 0 ? 'url(#gradProfit)' : 'url(#gradLoss)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        summary.count === 0 ? (
          <div className="flex items-center justify-center h-80 text-slate-400 text-sm">Keine Daten vorhanden</div>
        ) : (
          <div className="flex flex-col items-center px-4 pb-4">
            <div className="h-64 w-full max-w-sm mx-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={GRADES.map(g => ({ name: g.name, value: summary.grades?.[g.name] || 0, color: g.color }))}
                    cx="50%" cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1200}
                    animationEasing="ease-out"
                    stroke="none"
                  >
                    {GRADES.map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip total={summary.count} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 -mt-1">
              {GRADES.map(e => {
                const count = summary.grades?.[e.name] || 0;
                if (!count) return null;
                return (
                  <div key={e.name} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <span className="font-semibold text-slate-600">{e.name}</span>
                    <span className="text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
