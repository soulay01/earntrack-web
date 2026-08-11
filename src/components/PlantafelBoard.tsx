'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Inbox, CalendarDays, GripVertical } from 'lucide-react';

// Ziel-Arbeitszeit pro Mitarbeiter/Tag. Ab hier gilt ein Tag als überbucht (rot).
const DAILY_TARGET_HOURS = 8;
const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

type Assignment = {
  id: string;
  kunde?: string;
  projekt?: string;
  datum?: string;
  status?: string;
  stunden?: string | number;
  mitarbeiter?: string[] | string;
};
type Employee = { id: string; name: string };
type Customer = { name: string; adresse?: string };

type StatusStyle = { bg: string; text: string; stripe: string };
const STATUS_STYLES: Record<string, StatusStyle> = {
  'Geplant':        { bg: 'bg-slate-50',  text: 'text-slate-600', stripe: 'border-l-slate-400' },
  'In Bearbeitung': { bg: 'bg-blue-50',   text: 'text-blue-700',  stripe: 'border-l-blue-500' },
  'Abgeschlossen':  { bg: 'bg-green-50',  text: 'text-green-700', stripe: 'border-l-green-500' },
};
const styleFor = (status?: string): StatusStyle => STATUS_STYLES[status || 'Geplant'] || STATUS_STYLES['Geplant'];

const toNameArray = (m: Assignment['mitarbeiter']): string[] => {
  if (Array.isArray(m)) return m.map((x) => String(x).trim()).filter(Boolean);
  if (typeof m === 'string') return m.split(',').map((n) => n.trim()).filter(Boolean);
  return [];
};

const hoursOf = (a: Assignment): number => {
  const h = parseFloat(String(a.stunden ?? '').replace(',', '.'));
  return isNaN(h) ? 0 : h;
};

// Gleiche Formate wie in der App: ISO (YYYY-MM-DD) oder DD.MM.YYYY / DDMMYYYY.
function parseAssignmentDate(datum?: string): Date | null {
  if (!datum || typeof datum !== 'string') return null;
  const first = datum.split(',')[0].trim();
  if (first.includes('-')) {
    const p = first.split('-');
    if (p.length === 3) {
      const d = new Date(+p[0], +p[1] - 1, +p[2]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const raw = first.replace(/\D/g, '');
  if (raw.length === 8) {
    const d = new Date(+raw.slice(4, 8), +raw.slice(2, 4) - 1, +raw.slice(0, 2));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Rückschreibformat = Speicherformat des Termin-Formulars (DD.MM.YYYY).
function formatDMY(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

type Props = {
  assignments: Assignment[];
  employees: Employee[];
  customers: Customer[];
  onOpen: (a: Assignment) => void;
  onReschedule: (id: string, updates: { datum?: string; mitarbeiter?: string[] }) => void;
};

export default function PlantafelBoard({ assignments, employees, customers, onOpen, onReschedule }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekend, setShowWeekend] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const dayCount = showWeekend ? 7 : 5;

  const days = useMemo(() => {
    const monday = getMonday(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return WEEKDAY_LABELS.slice(0, dayCount).map((label, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return { label, date: d };
    });
  }, [weekOffset, dayCount]);

  const rangeLabel = useMemo(() => {
    const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    return `${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)}`;
  }, [days]);

  const addressFor = (a: Assignment) => {
    const c = customers.find((x) => x.name === a.kunde);
    return c?.adresse ? String(c.adresse).replace(/\n/g, ', ') : '';
  };

  const cellAssignments = (name: string, date: Date) =>
    assignments.filter((a) => {
      const d = parseAssignmentDate(a.datum);
      return d && sameDay(d, date) && toNameArray(a.mitarbeiter).includes(name);
    });

  const unassigned = useMemo(
    () =>
      assignments.filter((a) => {
        const d = parseAssignmentDate(a.datum);
        return d && days.some((day) => sameDay(day.date, d)) && toNameArray(a.mitarbeiter).length === 0;
      }),
    [assignments, days]
  );

  const freeToday = useMemo(() => {
    const today = days.find((day) => sameDay(day.date, new Date()));
    if (!today) return null;
    return employees.filter((e) => cellAssignments(e.name, today.date).length === 0).map((e) => e.name);
  }, [employees, days, assignments]);

  const drop = (name: string, date: Date) => {
    if (!dragId) return;
    onReschedule(dragId, { datum: formatDMY(date), mitarbeiter: [name] });
    setDragId(null);
    setDropKey(null);
  };

  const gridCols = { gridTemplateColumns: `140px repeat(${dayCount}, minmax(0, 1fr))` };

  const renderBlock = (a: Assignment) => {
    const s = styleFor(a.status);
    const h = hoursOf(a);
    return (
      <div
        key={a.id}
        draggable
        onDragStart={() => setDragId(a.id)}
        onDragEnd={() => { setDragId(null); setDropKey(null); }}
        onClick={() => onOpen(a)}
        title={`${a.kunde || a.projekt || ''}${addressFor(a) ? ' · ' + addressFor(a) : ''}`}
        className={`group/block cursor-pointer rounded-md border-l-[3px] ${s.stripe} ${s.bg} px-2 py-1.5 text-left transition-shadow hover:shadow-sm ${dragId === a.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-start gap-1">
          <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 group-hover/block:text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-xs font-semibold ${s.text}`}>{a.kunde || a.projekt || '–'}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
              {h > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {String(h).replace('.', ',')} h
                </span>
              )}
              {addressFor(a) && (
                <span className="inline-flex min-w-0 items-center gap-0.5">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{addressFor(a)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {/* Kopf: Woche + Wochenende */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[110px] text-center text-sm font-semibold text-slate-900">
            {weekOffset === 0 ? 'Diese Woche' : rangeLabel}
          </span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ChevronRight className="h-4 w-4" />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs font-medium text-teal-600 hover:text-teal-700">
              Heute
            </button>
          )}
        </div>
        <button
          onClick={() => setShowWeekend((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showWeekend ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Sa/So
        </button>
      </div>

      {/* Frei heute */}
      {freeToday && (
        <p className={`mb-3 text-xs font-medium ${freeToday.length ? 'text-teal-600' : 'text-slate-400'}`}>
          {freeToday.length ? `Frei heute: ${freeToday.join(', ')}` : 'Heute alle eingeplant'}
        </p>
      )}

      {/* Nicht zugeteilt */}
      {unassigned.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Inbox className="h-3.5 w-3.5" />
            Nicht zugeteilt ({unassigned.length})
            <span className="ml-1 font-normal normal-case text-slate-400">— auf einen Mitarbeiter/Tag ziehen</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((a) => (
              <div key={a.id} className="w-56">{renderBlock(a)}</div>
            ))}
          </div>
        </div>
      )}

      {/* Tag-Kopfzeile */}
      <div className="grid gap-2 border-b border-slate-100 pb-2" style={gridCols}>
        <div />
        {days.map((day) => {
          const isToday = sameDay(day.date, new Date());
          return (
            <div key={day.label} className={`text-center text-xs font-semibold ${isToday ? 'text-teal-600' : 'text-slate-400'}`}>
              {day.label} {day.date.getDate()}.
            </div>
          );
        })}
      </div>

      {/* Zeilen */}
      {employees.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Keine Mitarbeiter angelegt</p>
      ) : (
        employees.map((emp) => (
          <div key={emp.id} className="grid gap-2 border-b border-slate-50 py-2" style={gridCols}>
            <div className="flex items-center pr-2 text-sm font-semibold text-slate-700">
              <span className="truncate">{emp.name}</span>
            </div>
            {days.map((day) => {
              const items = cellAssignments(emp.name, day.date);
              const totalH = items.reduce((s, it) => s + hoursOf(it), 0);
              const over = totalH > DAILY_TARGET_HOURS;
              const key = `${emp.id}-${day.label}`;
              const isDropTarget = dropKey === key && dragId !== null;
              return (
                <div
                  key={day.label}
                  onDragOver={(e) => { e.preventDefault(); setDropKey(key); }}
                  onDragLeave={() => setDropKey((k) => (k === key ? null : k))}
                  onDrop={() => drop(emp.name, day.date)}
                  className={`min-h-[52px] space-y-1 rounded-lg p-1 transition-colors ${
                    isDropTarget ? 'bg-teal-50 ring-2 ring-teal-300' : over ? 'bg-red-50/40' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {items.map((a) => renderBlock(a))}
                  {totalH > 0 && (
                    <p className={`text-right text-[10px] font-bold tabular-nums ${over ? 'text-red-600' : 'text-slate-400'}`}>
                      {String(Math.round(totalH * 10) / 10).replace('.', ',')} h
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
