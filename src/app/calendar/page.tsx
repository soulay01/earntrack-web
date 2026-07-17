'use client';

import { useState, useMemo, Suspense, useCallback } from 'react';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import AssignmentModal from '@/components/AssignmentModal';
import Tooltip from '@/components/Tooltip';
import { getGermanHolidays } from '@/lib/utils';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logUsage } from '@/lib/usageLog';
import { reconcileAssignmentStock } from '@/lib/stockReconcile';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function parseDateDDMMYYYY(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateKey(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function CalendarInner() {
  const { user, loading, assignments, customers, employees, companyId, role, refresh } = useData();
  const [monthOffset, setMonthOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [view, setView] = useState<'month' | 'year' | 'day'>('month');

  const today = useMemo(todayDate, []);

  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today);

  const monthGrid = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = (first.getDay() + 6) % 7;
    const daysInMonth = last.getDate();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) week.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [year, month]);

  const holidays = useMemo(() => {
    const m = new Map<number, string>();
    for (const [d, n] of getGermanHolidays(year, month)) m.set(d, n);
    return m;
  }, [year, month]);

  const assignmentsByMonth = useMemo(() => {
    const counts = new Array(12).fill(0);
    (assignments || []).forEach((a: any) => {
      const p = parseDateDDMMYYYY(a.datum);
      if (p) counts[p.getMonth()]++;
    });
    return counts;
  }, [assignments]);

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    (assignments || []).forEach((a: any) => {
      const parsed = parseDateDDMMYYYY(a.datum);
      if (!parsed) return;
      const key = formatDateKey(parsed);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [assignments]);

  function openNewModal(dateKey: string) {
    const parsed = parseDateDDMMYYYY(dateKey);
    if (parsed) {
      const isWeekend = parsed.getDay() === 0 || parsed.getDay() === 6;
      const hm = new Map<number, string>();
      for (const [d, n] of getGermanHolidays(parsed.getFullYear(), parsed.getMonth())) hm.set(d, n);
      const hName = hm.get(parsed.getDate());
      if (isWeekend || hName) {
        const desc = isWeekend && hName ? 'ein Wochenende und einen Feiertag'
          : isWeekend ? 'ein Wochenende'
          : 'einen Feiertag';
        const suffix = hName ? ` (${hName})` : '';
        if (!window.confirm(`Warnung: ${dateKey} fällt auf ${desc}${suffix}. Trotzdem fortfahren?`)) return;
      }
    }
    setEditing(null);
    setModalDate(dateKey);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setModalDate('');
  }

  async function handleSave(form: any) {
    if (!user || !companyId || role !== 'owner') return;
    setSaving(true);
    try {
      // Alten Materialstand VOR dem Speichern sichern (Lager-Abgleich wie auf der Termine-Seite).
      const prevMaterials: any[] = editing && Array.isArray(editing.materialien) ? editing.materialien : [];
      let savedId: string | null = editing?.id || null;
      if (editing) {
        const data = { ...form, companyId, createdBy: user.uid, updatedAt: serverTimestamp() };
        await updateDoc(doc(db, 'assignments', editing.id), data);
      } else {
        const data = { ...form, companyId, createdBy: user.uid, createdAt: serverTimestamp() };
        const ref = await addDoc(collection(db, 'assignments'), data);
        savedId = ref.id;
        logUsage('assignment_created');
      }
      const warnings = await reconcileAssignmentStock({
        companyId, userId: user.uid, userEmail: user.email || '',
        prev: prevMaterials, next: Array.isArray(form.materialien) ? form.materialien : [],
        assignment: { id: savedId, kunde: form.kunde, projekt: form.projekt },
      });
      if (warnings.length) alert('Lager: ' + warnings.join('\n'));
      closeModal();
      refresh();
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return <PageSkeleton variant="calendar" />;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-white/70 backdrop-blur-md border-b border-slate-200/70 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Tooltip text="Vorheriger">
              <button onClick={() => {
                if (view === 'month') setMonthOffset(m => m - 1);
                else if (view === 'year') setPickerYear(p => p - 1);
                else { const d = new Date(selectedDay); d.setDate(d.getDate() - 1); setSelectedDay(d); }
              }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              </Tooltip>
              <div className="relative">
                {view === 'month' && (
                  <button onClick={() => setShowDatePicker(p => !p)}
                    className="text-lg font-bold text-slate-800 min-w-[150px] md:min-w-[200px] text-center hover:text-teal-600 cursor-pointer transition-colors">
                    {MONTHS[month]} {year}
                  </button>
                )}
                {view === 'year' && (
                  <span className="text-lg font-bold text-slate-800 min-w-[150px] md:min-w-[200px] text-center block">
                    {pickerYear}
                  </span>
                )}
                {view === 'day' && (
                  <span className="text-lg font-bold text-slate-800 min-w-[150px] md:min-w-[200px] text-center block">
                    {formatDateKey(selectedDay)}
                  </span>
                )}
              </div>
              <Tooltip text="Nächster">
              <button onClick={() => {
                if (view === 'month') setMonthOffset(m => m + 1);
                else if (view === 'year') setPickerYear(p => p + 1);
                else { const d = new Date(selectedDay); d.setDate(d.getDate() + 1); setSelectedDay(d); }
              }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              </Tooltip>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-2">
                <button onClick={() => setView('day')}
                  className={`px-4 py-2 text-xs font-bold transition-all ${view === 'day' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                  Tag
                </button>
                <button onClick={() => setView('month')}
                  className={`px-4 py-2 text-xs font-bold transition-all border-x border-slate-200 ${view === 'month' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                  Monat
                </button>
                <button onClick={() => setView('year')}
                  className={`px-4 py-2 text-xs font-bold transition-all ${view === 'year' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                  Jahr
                </button>
              </div>
            </div>
            <button onClick={() => {
              if (view === 'month') setMonthOffset(0);
              else if (view === 'year') setPickerYear(today.getFullYear());
              else setSelectedDay(today);
            }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-all active:scale-[0.95]">
              Heute
            </button>
          </div>
          <button onClick={() => openNewModal(formatDateKey(view === 'day' ? selectedDay : today))}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md hover:shadow-lg flex items-center gap-2 transition-all active:scale-[0.97]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Termin
          </button>
        </div>

        <div className="flex-1 p-4 md:p-6 pt-2 overflow-hidden">
          {view === 'month' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
                {DAYS.map((d, i) => (
                  <div key={d} className={`py-2.5 text-center text-[11px] font-bold uppercase tracking-wider ${
                    i >= 5 ? 'text-red-400' : 'text-slate-500'
                  }`}>
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${monthGrid.length}, 1fr)` }}>
                {monthGrid.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
                    {week.map((day, di) => {
                      if (day === null) return (
                        <div key={di} className="border-r border-slate-100 last:border-r-0 bg-slate-50/30" />
                      );
                      const date = new Date(year, month, day);
                      const dateKey = formatDateKey(date);
                      const isToday = sameDay(date, today);
                      const holidayName = holidays.get(day);
                      const dayAssignments = assignmentsByDate.get(dateKey) || [];
                      const isWeekend = di >= 5;
                      return (
                        <div key={di}
                          onClick={() => {
                            if (dayAssignments.length > 0) {
                              setSelectedDay(date);
                              setView('day');
                            } else {
                              openNewModal(dateKey);
                            }
                          }}
                          className={`relative border-r border-slate-100 last:border-r-0 p-2 flex flex-col cursor-pointer transition-all hover:shadow-inner ${
                            isToday
                              ? 'bg-teal-50/80'
                              : holidayName
                              ? 'bg-rose-50/60'
                              : 'bg-white hover:bg-slate-50'
                          }`}>
                          <div className={`inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg text-sm font-extrabold ${
                            isToday
                              ? 'bg-teal-600 text-white shadow-sm'
                              : holidayName
                              ? 'text-rose-600'
                              : isWeekend
                              ? 'text-red-400'
                              : 'text-slate-700'
                          }`}>
                            {day}
                          </div>
                          {holidayName && (
                            <div className="mt-0.5 px-1 py-0.5 rounded bg-rose-100/80">
                              <span className="text-[10px] font-bold text-rose-700 leading-tight block truncate">
                                {holidayName}
                              </span>
                            </div>
                          )}
                          {dayAssignments.length > 0 && (
                            <div className="mt-auto pt-1 space-y-1">
                              {dayAssignments.slice(0, 3).map((a: any, ai: number) => {
                                const col = colorFor(a.projekt || a.kunde || 'X');
                                return (
                                  <div key={ai}
                                    className="flex items-center gap-1.5 pl-1.5 border-l-[3px] rounded-sm bg-white/80"
                                    style={{ borderColor: col }}>
                                    <span className="text-[10px] font-semibold truncate text-slate-700 leading-tight">
                                      {a.projekt || a.kunde || 'Unbenannt'}
                                    </span>
                                    {a.stunden && <span className="text-[9px] text-slate-400 ml-auto shrink-0">{a.stunden}h</span>}
                                  </div>
                                );
                              })}
                              {dayAssignments.length > 3 && (
                                <div className="text-[10px] font-bold text-slate-400 px-1">
                                  +{dayAssignments.length - 3} weitere
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'year' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 h-full overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MONTHS.map((m, mi) => {
                  const daysInMonth = new Date(pickerYear, mi + 1, 0).getDate();
                  const firstDay = (new Date(pickerYear, mi, 1).getDay() + 6) % 7;
                  const isCurrent = mi === today.getMonth() && pickerYear === today.getFullYear();
                  const wdays = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
                  return (
                    <button key={m} onClick={() => {
                      const target = (pickerYear - today.getFullYear()) * 12 + (mi - today.getMonth());
                      setMonthOffset(target);
                      setView('month');
                    }}
                      className={`rounded-lg border p-2.5 text-left transition-all hover:shadow-sm ${
                        isCurrent ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                      <div className="text-[10px] font-bold text-slate-500 mb-1.5">{m}</div>
                      <div className="grid grid-cols-7 gap-px">
                        {wdays.map(w => (
                          <span key={w} className="text-[8px] font-bold text-slate-300 text-center">{w}</span>
                        ))}
                        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                        {Array.from({ length: daysInMonth }, (_, d) => {
                          const dateKey = formatDateKey(new Date(pickerYear, mi, d + 1));
                          const hasAssignments = assignmentsByDate.has(dateKey);
                          const isToday = sameDay(new Date(pickerYear, mi, d + 1), today);
                          return (
                            <div key={d}
                              className={`text-[9px] font-semibold w-full flex items-center justify-center py-px rounded-sm ${
                                isToday ? 'bg-teal-600 text-white' : hasAssignments ? 'bg-teal-100 text-teal-700' : 'text-slate-400'
                              }`}>
                              {d + 1}
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'day' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full overflow-y-auto">
              <div className="p-4 md:p-6">
                {(() => {
                  const dateKey = formatDateKey(selectedDay);
                  const isToday = sameDay(selectedDay, today);
                  const holidayName = (() => {
                    const h = new Map<number, string>();
                    for (const [d, n] of getGermanHolidays(selectedDay.getFullYear(), selectedDay.getMonth())) h.set(d, n);
                    return h.get(selectedDay.getDate());
                  })();
                  const dayAssignments = assignmentsByDate.get(dateKey) || [];
                  return (
                    <div className="max-w-2xl mx-auto">
                      <div className={`rounded-2xl border-2 p-6 mb-4 ${
                        isToday ? 'border-teal-200 bg-teal-50/50' : holidayName ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 bg-white'
                      }`}>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-5xl font-extrabold text-slate-800 leading-none">{selectedDay.getDate()}.</div>
                            <div className="text-sm font-bold text-slate-400 mt-1">
                              {DAYS[(selectedDay.getDay() + 6) % 7]}, {MONTHS[selectedDay.getMonth()]} {selectedDay.getFullYear()}
                            </div>
                            {holidayName && (
                              <div className="mt-2 px-2 py-1 rounded bg-rose-100/80 inline-block">
                                <span className="text-[11px] font-bold text-rose-700">{holidayName}</span>
                              </div>
                            )}
                          </div>
                          <button onClick={() => openNewModal(dateKey)}
                            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-all active:scale-[0.95] shrink-0">
                            + Termin
                          </button>
                        </div>
                        {dayAssignments.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-sm font-semibold">
                            Keine Termine an diesem Tag
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dayAssignments.map((a: any, i: number) => {
                              const col = colorFor(a.projekt || a.kunde || 'X');
                              return (
                                <div key={i}
                                  onClick={() => openNewModal(dateKey)}
                                  className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm cursor-pointer transition-all">
                                  <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: col }} />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-800">{a.projekt || a.kunde || 'Unbenannt'}</div>
                                    <div className="text-[11px] text-slate-400">{a.mitarbeiter || ''}{a.mitarbeiter && a.stunden ? ' · ' : ''}{a.stunden ? `${a.stunden}h` : ''}</div>
                                  </div>
                                  <svg className="w-4 h-4 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <AssignmentModal
          editing={editing}
          customers={customers}
          employees={employees}
          assignments={assignments}
          saving={saving}
          initialDate={modalDate}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {showDatePicker && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setShowDatePicker(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-5 w-72">
            <div className="flex items-center justify-between mb-4">
              <button type="button" onClick={() => setPickerYear(p => p - 1)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all active:scale-[0.9]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-sm font-bold text-slate-800">{pickerYear}</span>
              <button type="button" onClick={() => setPickerYear(p => p + 1)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all active:scale-[0.9]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((m, i) => (
                <button key={m} type="button" onClick={() => {
                  const target = (pickerYear - today.getFullYear()) * 12 + (i - today.getMonth());
                  setMonthOffset(target);
                  setShowDatePicker(false);
                }}
                  className={`p-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
                    i === month && pickerYear === year
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}>
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setMonthOffset(0); setPickerYear(today.getFullYear()); setShowDatePicker(false); }}
              className="mt-4 w-full py-2 rounded-lg text-xs font-semibold text-teal-600 hover:bg-teal-50 transition-all active:scale-[0.97]">
              Heute
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const EMP_COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#f97316'];
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return EMP_COLORS[Math.abs(hash) % EMP_COLORS.length];
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner />
    </Suspense>
  );
}
