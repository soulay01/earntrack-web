'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { formatCurrency } from '@/lib/utils';
import { calculateAssignmentProfitScore } from '@/lib/smartPricing';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function fmtTime(date: Date | Timestamp | undefined | null): string {
  if (!date) return '-';
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(date: Date | Timestamp | undefined | null): string {
  if (!date) return '-';
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function durationMinutes(clockIn: Date, clockOut: Date | null, breakMinutes: number = 0): number {
  if (!clockOut) return 0;
  return Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) - breakMinutes;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

type Tab = 'overview' | 'clock' | 'notes' | 'photos' | 'members';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function ProjectDetailPage() {
  const { user, loading: authLoading } = useData();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [clockEntries, setClockEntries] = useState<any[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualForm, setManualForm] = useState({ date: '', startTime: '', endTime: '', breakMinutes: '0', notes: '' });

  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});

  const [photos, setPhotos] = useState<any[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');

  const [members, setMembers] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [user, authLoading, router]);

  useEffect(() => {
    if (!id || !user) return;
    const unsubAssignment = onSnapshot(doc(db, 'assignments', id), snap => {
      if (snap.exists()) setAssignment({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    const unsubClock = onSnapshot(
      query(collection(db, 'clock_entries'), where('assignmentId', '==', id), orderBy('clockIn', 'desc')),
      snap => setClockEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubNotes = onSnapshot(
      query(collection(db, 'project_notes'), where('assignmentId', '==', id), orderBy('createdAt', 'desc')),
      snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubPhotos = onSnapshot(
      query(collection(db, 'project_photos'), where('assignmentId', '==', id), orderBy('createdAt', 'desc')),
      snap => setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubMembers = onSnapshot(
      query(collection(db, 'project_members'), where('assignmentId', '==', id)),
      snap => setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubAssignment(); unsubClock(); unsubNotes(); unsubPhotos(); unsubMembers(); };
  }, [id, user]);

  if (authLoading || loading) return (
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
  if (!user || !assignment) return null;

  const ps = calculateAssignmentProfitScore(assignment);
  const rev = ps.revenue;
  const h = ps.hours;
  const rate = parseFloat(String(assignment.stundenlohn)) || 0;
  const cost = h * rate;
  const profit = rev - cost;

  const totalMinutes = clockEntries.reduce((sum: number, e: any) => {
    const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
    const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
    return sum + durationMinutes(ci, co, parseInt(e.totalBreakMinutes) || 0);
  }, 0);
  const activeEntry = clockEntries.find((e: any) => !e.clockOut);

  async function addManualEntry() {
    if (!user || !id) return;
    const ci = new Date(`${manualForm.date}T${manualForm.startTime || '08:00'}`);
    const co = new Date(`${manualForm.date}T${manualForm.endTime || '17:00'}`);
    await addDoc(collection(db, 'clock_entries'), {
      assignmentId: id, createdBy: user.uid, userName: user.email || 'Unbekannt',
      clockIn: Timestamp.fromDate(ci), clockOut: Timestamp.fromDate(co),
      totalMinutes: durationMinutes(ci, co, parseInt(manualForm.breakMinutes) || 0),
      totalBreakMinutes: parseInt(manualForm.breakMinutes) || 0,
      notes: manualForm.notes || '', createdAt: serverTimestamp(),
    });
    setManualForm({ date: '', startTime: '', endTime: '', breakMinutes: '0', notes: '' });
    setShowManualEntry(false);
  }

  async function deleteClockEntry(eid: string) {
    await deleteDoc(doc(db, 'clock_entries', eid));
  }

  async function addNote() {
    if (!user || !id || !newNote.trim()) return;
    await addDoc(collection(db, 'project_notes'), {
      assignmentId: id, userId: user.uid, userName: user.email || 'Unbekannt',
      note: newNote.trim(), createdAt: serverTimestamp(), isPinned: false,
    });
    setNewNote('');
  }

  async function togglePin(noteId: string, isPinned: boolean) {
    await updateDoc(doc(db, 'project_notes', noteId), { isPinned: !isPinned });
  }

  async function deleteNote(noteId: string) {
    await deleteDoc(doc(db, 'project_notes', noteId));
  }

  async function addReply(noteId: string) {
    if (!user || !replies[noteId]?.trim()) return;
    await addDoc(collection(db, 'project_note_replies'), {
      noteId, userId: user.uid, userName: user.email || 'Unbekannt',
      text: replies[noteId].trim(), createdAt: serverTimestamp(),
    });
    setReplies(prev => ({ ...prev, [noteId]: '' }));
  }

  async function addPhoto() {
    if (!user || !id || !photoUrl.trim()) return;
    await addDoc(collection(db, 'project_photos'), {
      assignmentId: id, userId: user.uid, userName: user.email || 'Unbekannt',
      photoUri: photoUrl.trim(), createdAt: serverTimestamp(), isPinned: false,
    });
    setPhotoUrl('');
  }

  async function deletePhoto(photoId: string) {
    await deleteDoc(doc(db, 'project_photos', photoId));
  }

  async function generateInviteCode() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await addDoc(collection(db, 'project_invites'), {
      assignmentId: id, code, createdAt: serverTimestamp(),
    });
    setGeneratedCode(code);
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Übersicht', icon: '📊' },
    { key: 'clock', label: 'Zeiterfassung', icon: '⏱' },
    { key: 'notes', label: 'Notizen', icon: '📝' },
    { key: 'photos', label: 'Fotos', icon: '📸' },
    { key: 'members', label: 'Team', icon: '👥' },
  ];

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-4xl mx-auto">
          {/* Back + Header */}
          <div className="mb-6 animate-fadeIn">
            <a href="/assignments" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einsätzen</a>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{assignment.projekt || 'Unbenannt'}</h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-sm font-bold border"
                    style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg, borderColor: ps.gradeColor + '33' }}>
                    {ps.grade}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-1">{assignment.kunde} &middot; {assignment.datum}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(profit)}</p>
                <span className={`text-xs font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {profit >= 0 ? '+' : ''}{(rev > 0 ? (profit / rev) * 100 : 0).toFixed(1)}% Marge
                </span>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1 animate-fadeIn">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.95] whitespace-nowrap ${
                  tab === t.key ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-white hover:shadow-sm bg-white/50'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {tab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Einsatz-Details</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { l: 'Umsatz', v: formatCurrency(rev), c: '' },
                    { l: 'Kosten', v: formatCurrency(cost), c: '' },
                    { l: 'Gewinn', v: formatCurrency(profit), c: profit >= 0 ? 'text-green-600' : 'text-red-600' },
                    { l: 'Stunden', v: `${h.toFixed(1)}h` },
                    { l: 'Stundenlohn', v: `€${rate.toFixed(2)}` },
                    { l: 'Erfasste Zeit', v: formatDuration(totalMinutes) },
                    { l: 'Mitarbeiter', v: Array.isArray(assignment.mitarbeiter) ? assignment.mitarbeiter.length + ' MA' : '–' },
                    { l: 'Status', v: assignment.status || 'Aktiv' },
                  ].map((d, i) => (
                    <div key={i} className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-200 hover:shadow-sm transition-all duration-200">
                      <p className="text-xs font-semibold text-slate-400 mb-1">{d.l}</p>
                      <p className={`text-lg font-bold text-slate-900 ${d.c || ''}`}>{d.v}</p>
                    </div>
                  ))}
                </div>
              </div>
              {Array.isArray(assignment.mitarbeiter) && assignment.mitarbeiter.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6">
                  <h3 className="text-sm font-bold text-slate-700 mb-4">Team</h3>
                  <div className="flex flex-wrap gap-2">
                    {assignment.mitarbeiter.map((name: string, i: number) => (
                      <span key={i} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-50 to-white border border-slate-200 text-sm text-slate-700 shadow-sm">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: colorFor(name) }}>{name.charAt(0)}</span>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Clock Entries */}
          {tab === 'clock' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">Zeiterfassung</h3>
                    <p className="text-xs text-slate-400">{formatDuration(totalMinutes)} insgesamt</p>
                  </div>
                  <button onClick={() => setShowManualEntry(!showManualEntry)}
                    className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] text-white text-sm font-bold rounded-xl transition-all shadow-md">
                    + Manueller Eintrag
                  </button>
                </div>

                {showManualEntry && (
                  <div className="mb-4 p-5 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 space-y-3 animate-slideUp">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Datum</label>
                        <input type="date" value={manualForm.date} onChange={e => setManualForm(p => ({ ...p, date: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Pause (Min.)</label>
                        <input type="number" min="0" value={manualForm.breakMinutes} onChange={e => setManualForm(p => ({ ...p, breakMinutes: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Startzeit</label>
                        <input type="time" value={manualForm.startTime} onChange={e => setManualForm(p => ({ ...p, startTime: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Endzeit</label>
                        <input type="time" value={manualForm.endTime} onChange={e => setManualForm(p => ({ ...p, endTime: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 transition-all" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Notizen</label>
                      <input value={manualForm.notes} onChange={e => setManualForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" className={inputCls} />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={addManualEntry} className="px-5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] text-white text-sm font-bold rounded-xl transition-all shadow-md">Speichern</button>
                      <button onClick={() => setShowManualEntry(false)} className="px-5 py-2 text-slate-500 hover:text-slate-700 hover:bg-white active:scale-[0.97] text-sm font-semibold rounded-xl transition-all border border-slate-200 bg-white/50">Abbrechen</button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {clockEntries.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Keine Zeiteinträge vorhanden</p>
                  ) : (
                    clockEntries.map((e: any) => {
                      const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                      const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                      const dur = durationMinutes(ci, co, parseInt(e.totalBreakMinutes) || 0);
                      return (
                        <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800">{fmtDate(ci)}</p>
                            <p className="text-xs text-slate-400">
                              {ci.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                              {co ? ` – ${co.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ' (läuft)'}
                              {parseInt(e.totalBreakMinutes) > 0 ? ` · ${e.totalBreakMinutes}min Pause` : ''}
                              {e.notes ? ` · ${e.notes}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-800">{co ? formatDuration(dur) : '⏳'}</span>
                            <span className="text-xs text-slate-400">{e.userName || e.createdBy?.slice(0, 8)}</span>
                            <button onClick={() => deleteClockEntry(e.id)} className="p-1.5 text-red-300 hover:text-red-600 hover:bg-red-50 active:scale-[0.9] rounded-lg transition-all">✕</button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Notes */}
          {tab === 'notes' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Notizen</h3>
                <div className="flex gap-2 mb-6">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Neue Notiz..." className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm" />
                  <button onClick={addNote} disabled={!newNote.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-md">
                    Hinzufügen
                  </button>
                </div>
                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Keine Notizen</p>
                  ) : (
                    notes.map((n: any) => (
                      <div key={n.id} className={`p-4 rounded-xl border transition-all duration-200 ${n.isPinned ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-sm' : 'bg-gradient-to-br from-slate-50 to-white border-slate-200 shadow-sm'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-500">{n.userName || 'Unbekannt'}</span>
                              <span className="text-xs text-slate-400">{n.createdAt?.toDate ? fmtTime(n.createdAt.toDate()) : fmtTime(n.createdAt)}</span>
                              {n.isPinned && <span className="text-xs text-amber-600 font-bold">📌 Angepinnt</span>}
                            </div>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => togglePin(n.id, n.isPinned)} className="p-1.5 text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 active:scale-[0.9] rounded-lg transition-all">{n.isPinned ? '📌' : '📍'}</button>
                            <button onClick={() => deleteNote(n.id)} className="p-1.5 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-[0.9] rounded-lg transition-all">✕</button>
                          </div>
                        </div>
                        <NoteReplies noteId={n.id} user={user} />
                        <div className="mt-2 flex gap-2">
                          <input value={replies[n.id] || ''} onChange={e => setReplies(prev => ({ ...prev, [n.id]: e.target.value }))} placeholder="Antworten..." className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-teal-500 transition-all" />
                          <button onClick={() => addReply(n.id)} disabled={!replies[n.id]?.trim()}
                            className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.97] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-sm">
                            Antworten
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Photos */}
          {tab === 'photos' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Fotos</h3>
                <div className="flex gap-2 mb-6">
                  <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="Bild-URL eingeben..." className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm" />
                  <button onClick={addPhoto} disabled={!photoUrl.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-md">
                    Hinzufügen
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {photos.length === 0 ? (
                    <div className="col-span-full text-center py-8">
                      <span className="text-4xl mb-3 block">📸</span>
                      <p className="text-sm text-slate-400">Keine Fotos vorhanden</p>
                    </div>
                  ) : (
                    photos.map((p: any) => (
                      <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                        <img src={p.photoUri} alt="" className="w-full h-32 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <div className="p-3">
                          <p className="text-[10px] font-semibold text-slate-400 truncate">{p.userName || 'Unbekannt'}</p>
                          <p className="text-[10px] text-slate-400">{p.createdAt?.toDate ? fmtDate(p.createdAt.toDate()) : ''}</p>
                        </div>
                        <button onClick={() => deletePhoto(p.id)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 active:scale-[0.9] shadow-lg">✕</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Members */}
          {tab === 'members' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-700">Team-Mitglieder ({members.length})</h3>
                  <button onClick={() => setShowInvite(!showInvite)}
                    className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] text-white text-sm font-bold rounded-xl transition-all shadow-md">
                    + Einladen
                  </button>
                </div>

                {showInvite && (
                  <div className="mb-4 p-5 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 space-y-3 animate-slideUp">
                    <button onClick={generateInviteCode} className="w-full px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] text-white text-sm font-bold rounded-xl transition-all shadow-md">
                      Einladungscode generieren
                    </button>
                    {generatedCode && (
                      <div className="p-4 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 text-center animate-scaleIn">
                        <p className="text-xs text-slate-500 mb-1">Code teilen:</p>
                        <p className="text-3xl font-black text-teal-700 tracking-widest">{generatedCode}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {members.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Keine Mitglieder</p>
                  ) : (
                    members.map((m: any) => (
                      <div key={m.id || m.uid} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                          style={{ backgroundColor: colorFor(m.displayName || m.email || '?') }}>
                          {(m.displayName || m.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{m.displayName || m.email || m.uid?.slice(0, 8)}</p>
                          <p className="text-xs text-slate-400">{m.email || m.role || 'Mitglied'}</p>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{m.role === 'owner' ? 'Besitzer' : 'Mitglied'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NoteReplies({ noteId, user }: { noteId: string; user: any }) {
  const [replyList, setReplyList] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'project_note_replies'), where('noteId', '==', noteId), orderBy('createdAt', 'asc')),
      snap => setReplyList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [noteId]);
  if (replyList.length === 0) return null;
  return (
    <div className="ml-4 mt-2 pl-3 border-l-2 border-teal-200 space-y-1.5">
      {replyList.map(r => (
        <div key={r.id} className="flex items-start gap-2">
          <span className="text-xs font-bold text-slate-500 shrink-0">{r.userName?.split('@')[0] || '?'}</span>
          <p className="text-xs text-slate-600">{r.text}</p>
          <span className="text-[10px] text-slate-400 shrink-0 ml-auto">{r.createdAt?.toDate ? fmtTime(r.createdAt.toDate()) : ''}</span>
        </div>
      ))}
    </div>
  );
}
