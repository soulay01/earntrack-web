'use client';

import { useState } from 'react';
import Tooltip from '@/components/Tooltip';
import { getGermanHolidays } from '@/lib/utils';

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];

export function parseDateString(str: string): Date | null {
  if (!str) return null;
  const p = str.split('.');
  if (p.length === 3) {
    const d = new Date(+p[2], +p[1] - 1, +p[0]);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function toMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() + 6) % 7;
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

export default function CalendarPopover({ value, onChange, onClose }: { value: string; onChange: (d: string) => void; onClose: () => void }) {
  const today = new Date();
  const parsed = parseDateString(value) || today;
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth());
  const grid = toMonthGrid(year, month);
  const holidays = (() => {
    const m = new Map<number, string>();
    for (const [d, n] of getGermanHolidays(year, month)) m.set(d, n);
    return m;
  })();

  function select(d: number) {
    onChange(formatDate(new Date(year, month, d)));
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-72  origin-top-left">
        <div className="flex items-center justify-between mb-3">
          <Tooltip text="Vorheriger Monat">
          <button type="button" onClick={() => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 active:scale-[0.9] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          </Tooltip>
          <span className="text-sm font-bold text-slate-800">{MONTHS[month]} {year}</span>
          <Tooltip text="Nächster Monat">
          <button type="button" onClick={() => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 active:scale-[0.9] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          </Tooltip>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
          {DAYS.map(d => <span key={d} className="text-[10px] font-bold text-slate-400 py-1">{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((d, i) => {
            const sel = d !== null && value === formatDate(new Date(year, month, d));
            const isToday = d !== null && formatDate(new Date()) === formatDate(new Date(year, month, d));
            const isHoliday = d !== null && holidays.has(d);
            const holidayName = isHoliday ? holidays.get(d!) : '';
            if (d === null) return <div key={i} />;
            return (
              <button key={i} type="button" onClick={() => select(d)} title={holidayName || undefined}
                className={`text-xs font-semibold w-8 h-8 rounded-lg flex flex-col items-center justify-center transition-all active:scale-[0.9] relative ${
                  sel ? 'bg-teal-600 text-white shadow-sm' :
                  isHoliday ? 'text-red-600' :
                  isToday ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                  'text-slate-700 hover:bg-slate-100'
                }`}>
                <span>{d}</span>
                {isHoliday && <span className="text-[6px] leading-none mt-px">●</span>}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => { onChange(formatDate(today)); onClose(); }}
          className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-teal-600 hover:bg-teal-50 transition-all active:scale-[0.97]">
          Heute
        </button>
      </div>
    </>
  );
}
