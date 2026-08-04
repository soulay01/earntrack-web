'use client';

import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/app/Provider';
import { useTodayClockEntries } from '@/lib/useTodayClockEntries';
import { deriveEntryStatus, formatDuration, formatTime, LONG_PAUSE_MS } from '@/lib/timeTracking';
import type { ClockEntry } from '@/lib/timeTracking';

const STATUS_COLOR: Record<string, string> = {
  working: '#22c55e',
  pause: '#f59e0b',
  done: '#94a3b8',
};

// Farbige Zeit-Pills statt einer Balkengrafik für die Tagesverlauf-Zeile: pro Eintrag ein
// Chip mit Punkt + Uhrzeit-Spanne, in normalem Flexbox-Fluss (flexWrap).
const dayChips = (userEntries: ClockEntry[]) => userEntries.map(e => {
  const start = formatTime(e.clockInMs);
  const isOpen = !e.clockOutMs;
  const label = e.clockOutMs ? `${start}–${formatTime(e.clockOutMs)}` : `${start}–${e.isPaused ? 'Pause' : 'jetzt'}`;
  const color = e.isPaused ? STATUS_COLOR.pause : (isOpen ? STATUS_COLOR.working : STATUS_COLOR.done);
  return { key: e.id, label, color };
});

export default function LiveTeamDashboard() {
  const { companyId, assignments } = useData();
  const { entries, loading } = useTodayClockEntries(companyId);

  const activeEntries = useMemo(() => entries.filter(e => !e.clockOutMs), [entries]);

  // Nur ticken, solange wirklich jemand eingestempelt ist - kein Timer-Verbrauch im Leerlauf.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (activeEntries.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeEntries.length]);

  const assignmentById = useMemo(() => {
    const map = new Map<string, (typeof assignments)[number]>();
    for (const a of (assignments || [])) map.set(a.id, a);
    return map;
  }, [assignments]);

  // Live-Team-Board: pro aktivem Eintrag Status, Projekt, verstrichene Zeit + Ampel.
  const rows = useMemo(() => activeEntries.map(entry => {
    const status = deriveEntryStatus(entry, now);
    const assignment = assignmentById.get(entry.assignmentId || '');
    const plannedHours = assignment ? parseFloat(String(assignment.stunden).replace(',', '.')) || 0 : 0;
    const isOvertime = plannedHours > 0 && status.elapsedWorkMs > plannedHours * 3600000;
    const isLongPause = status.state === 'pause' && status.elapsedPauseMs > LONG_PAUSE_MS;
    return { entry, status, assignment, isOvertime, isLongPause };
  }), [activeEntries, assignmentById, now]);

  // Tages-Timeline: eine Zeile pro Mitarbeiter mit allen heutigen Einträgen. Schema kennt nur
  // die JEWEILS letzte Pause (breakStart/totalBreakMs kumuliert, kein Verlauf) - bei mehreren
  // Pausen pro Tag zeigt der Amber-Abschnitt daher nur die aktuell laufende bzw. letzte Pause.
  const timelineByUser = useMemo(() => {
    const map = new Map<string, ClockEntry[]>();
    for (const e of entries) {
      if (!map.has(e.userName || '?')) map.set(e.userName || '?', []);
      map.get(e.userName || '?')!.push(e);
    }
    return [...map.entries()];
  }, [entries]);

  if (loading) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp" style={{ animationDelay: '360ms' }}>
      {/* Kopf: Puls-Dot + Titel + Aktiv-Zähler */}
      <div className="flex items-center gap-2 px-6 pt-6 pb-3">
        <span className="relative flex h-2.5 w-2.5">
          {activeEntries.length > 0 && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          )}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${activeEntries.length > 0 ? 'bg-green-500' : 'bg-slate-300'}`} />
        </span>
        <h3 className="text-lg font-bold text-slate-900 tracking-tight flex-1">Live Team</h3>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${activeEntries.length > 0 ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
          {activeEntries.length} aktiv
        </span>
      </div>

      {activeEntries.length === 0 ? (
        <p className="text-[13px] text-slate-400 px-6 pb-6">Aktuell ist niemand eingestempelt.</p>
      ) : (
        <div className="px-6 flex flex-col gap-3.5 mb-5">
          {rows.map(({ entry, status, assignment, isOvertime, isLongPause }) => {
            const label = status.state === 'pause' ? 'Pause seit' : 'Arbeitet seit';
            const dotColor = STATUS_COLOR[status.state];
            return (
              <div key={entry.id} className="flex items-center">
                <div className="w-9 h-9 rounded-full flex items-center justify-center mr-3 shrink-0" style={{ backgroundColor: dotColor + '1A' }}>
                  <span className="text-sm font-bold" style={{ color: dotColor }}>{(entry.userName || '?').charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{entry.userName}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {assignment ? `${assignment.projekt} · ${assignment.kunde}` : 'Kein Termin verknüpft'}
                  </p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: dotColor }}>
                    {label} {formatTime(status.sinceMs)} · {formatDuration(status.state === 'pause' ? status.elapsedPauseMs : status.elapsedWorkMs)}
                  </p>
                </div>
                {isOvertime && (
                  <span className="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded-md ml-1.5 shrink-0">Überstunden</span>
                )}
                {isLongPause && (
                  <span className="bg-amber-50 text-amber-600 text-[10px] font-bold px-2 py-1 rounded-md ml-1.5 shrink-0">Lange Pause</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tagesverlauf: pro Mitarbeiter Chips aller heutigen Einträge */}
      {timelineByUser.length > 0 && (
        <div className={`px-6 pb-6 pt-1 ${activeEntries.length > 0 ? 'border-t border-slate-100 mt-2' : ''}`}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-3 mb-2.5">Tagesverlauf</p>
          <div className="flex flex-col gap-3">
            {timelineByUser.map(([userName, userEntries]) => (
              <div key={userName}>
                <p className="text-[11px] text-slate-400 font-semibold mb-1.5 truncate">{userName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {dayChips(userEntries).map(chip => (
                    <span key={chip.key} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: chip.color + '1A' }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: chip.color }} />
                      <span className="text-[11px] font-bold text-slate-700">{chip.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
