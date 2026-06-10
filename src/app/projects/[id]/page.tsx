'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import LoadingScreen from '@/components/LoadingScreen';
import { formatCurrency } from '@/lib/utils';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendNoteCreatedNotification, sendReplyCreatedNotification } from '@/lib/pushNotifications';
import ProjectPhoto from '@/components/ProjectPhoto';
import PhotoViewer from '@/components/PhotoViewer';

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

type Tab = 'overview' | 'clock' | 'notes' | 'photos' | 'members' | 'expenses';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function ProjectDetailPage() {
  const { user, company, loading: authLoading, photoUnreadCounts, clockUnreadCounts, markPhotoRead, markProjectRead, markClockRead, projectReads, photoReads, clockReads, expenses: allExpenses } = useData();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [clockEntries, setClockEntries] = useState<any[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [newManualStart, setNewManualStart] = useState('');
  const [newManualEnd, setNewManualEnd] = useState('');
  const [newManualBreak, setNewManualBreak] = useState('0');

  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [replies, setReplies] = useState<Record<string, any>>({});
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);

  const [members, setMembers] = useState<any[]>([]);

  const [viewerPhoto, setViewerPhoto] = useState<any>(null);

  const companyDisplayName = company?.companyName || company?.name || user?.email || 'Unbekannt';

  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [user, authLoading, router]);

  useEffect(() => {
    if (!id || !user) return;
    const unsub = onSnapshot(doc(db, 'assignments', id), snap => {
      if (snap.exists()) setAssignment({ id: snap.id, ...snap.data() });
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [id, user]);

  // Clock entries (mit gefrorenem Read-Timestamp für NEU-Badges)
  useEffect(() => {
    if (!id || !user) return;
    const frozenRead = clockReads?.[id];
    const uid = user.uid;
    const q = query(collection(db, 'clock_entries'), where('assignmentId', '==', id), orderBy('clockIn', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => {
        const data = d.data();
        const t = data.clockIn?.toDate ? data.clockIn.toDate() : data.clockIn ? new Date(data.clockIn) : null;
        let isNew = false;
        if (t && frozenRead && data.userId !== uid) {
          const r = frozenRead.toDate ? frozenRead.toDate() : new Date(frozenRead);
          isNew = t.getTime() > r.getTime();
        }
        return { id: d.id, ...data, _isNew: isNew };
      });
      setClockEntries(docs);
    }, err => console.error('clock entries sub error:', err));
    return unsub;
  }, [id, user, clockReads]);

  // Notes (mit gefrorenem Read-Timestamp für NEU-Badges)
  useEffect(() => {
    if (!id || !user) return;
    const frozenRead = projectReads?.[id];
    const uid = user.uid;
    const q = query(collection(db, 'project_notes'), where('assignmentId', '==', id), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => {
        const data = d.data();
        const t = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;
        let isNew = false;
        if (t && frozenRead && data.userId !== uid) {
          const r = frozenRead.toDate ? frozenRead.toDate() : new Date(frozenRead);
          isNew = t.getTime() > r.getTime();
        }
        return { id: d.id, ...data, _isNew: isNew };
      });
      setNotes(docs);
    }, err => console.error('notes sub error:', err));
    return unsub;
  }, [id, user, projectReads]);

  // Photos (mit gefrorenem Read-Timestamp für NEU-Badges)
  useEffect(() => {
    if (!id || !user) return;
    const frozenRead = photoReads?.[id];
    const uid = user.uid;
    const q = query(collection(db, 'project_photos'), where('assignmentId', '==', id), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => {
        const data = d.data();
        const t = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;
        let isNew = false;
        if (t && frozenRead && data.userId !== uid) {
          const r = frozenRead.toDate ? frozenRead.toDate() : new Date(frozenRead);
          isNew = t.getTime() > r.getTime();
        }
        return { id: d.id, ...data, _isNew: isNew };
      });
      setPhotos(docs);
    }, err => console.error('photos sub error:', err));
    return unsub;
  }, [id, user, photoReads]);

  const unreadPhotos = photoUnreadCounts[id] || 0;
  const unreadClocks = clockUnreadCounts[id] || 0;

  // Mark items as read when viewing their respective tab
  useEffect(() => {
    if (tab === 'notes' && id) {
      markProjectRead(id).catch((e: any) => console.error('markProjectRead error:', e));
      markPhotoRead(id).catch((e: any) => console.error('markPhotoRead error:', e));
    }
  }, [tab, id, markProjectRead, markPhotoRead]);

  // Mark photos as read when viewing the photos tab
  useEffect(() => {
    if (tab === 'photos' && id) {
      markPhotoRead(id).catch((e: any) => console.error('markPhotoRead error:', e));
      markProjectRead(id).catch((e: any) => console.error('markProjectRead error:', e));
    }
  }, [tab, id, markPhotoRead, markProjectRead]);

  // Mark clock as read when viewing the clock tab
  useEffect(() => {
    if (tab === 'clock' && id) {
      markClockRead(id).catch((e: any) => console.error('markClockRead error:', e));
    }
  }, [tab, id, markClockRead]);

  // Members
  useEffect(() => {
    if (!id || !user) return;
    const unsub = onSnapshot(doc(db, 'project_members', id), snap => {
      if (snap.exists()) {
        const data = snap.data();
        const list = Object.keys(data).map(uid => ({ uid, displayName: data[uid]?.displayName || uid }));
        setMembers(list);
      } else setMembers([]);
    }, err => console.error('members sub error:', err));
    return unsub;
  }, [id, user]);

  // Replies sub
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  useEffect(() => {
    if (!expandedNoteId) return;
    const q = query(collection(db, 'project_note_replies'), where('noteId', '==', expandedNoteId), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setReplies(prev => ({ ...prev, [expandedNoteId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    }, err => console.error('replies sub error:', err));
    return unsub;
  }, [expandedNoteId]);

  async function addNote() {
    if (!user || !id || !newNote.trim()) return;
    const noteRef = await addDoc(collection(db, 'project_notes'), {
      assignmentId: id, userId: user.uid, userName: companyDisplayName,
      note: newNote.trim(), createdAt: serverTimestamp(), isPinned: true,
    });
    setNewNote('');
    sendNoteCreatedNotification({ assignmentId: id, userId: user.uid, userName: companyDisplayName, note: newNote.trim(), isPinned: true }, noteRef.id, user.uid).catch((e: any) => console.error('sendNoteNotification error:', e));
  }

  async function addReply(noteId: string) {
    const text = replies[noteId]?.trim();
    if (!user || !text) return;
    await addDoc(collection(db, 'project_note_replies'), {
      noteId, assignmentId: id, userId: user.uid, userName: companyDisplayName,
      text, createdAt: serverTimestamp(),
    });
    setReplies(prev => ({ ...prev, [noteId]: '' }));
    sendReplyCreatedNotification({ noteId, userId: user.uid, userName: companyDisplayName, text }, user.uid).catch((e: any) => console.error('sendReplyNotification error:', e));
  }

  async function deleteNote(noteId: string) {
    if (!user) return;
    try { await deleteDoc(doc(db, 'project_notes', noteId)); }
    catch (e) { console.error('deleteNote error:', e); }
  }

  if (loading || authLoading) return <LoadingScreen />;
  if (!user) return null;
  if (!assignment) return <div className="p-8 text-slate-500">Projekt nicht gefunden.</div>;

  const totalMinutes = clockEntries.reduce((sum, e) => {
    const ci = e.clockIn?.toDate ? e.clockIn.toDate() : null;
    const co = e.clockOut?.toDate ? e.clockOut.toDate() : null;
    return sum + (ci && co ? Math.round((co.getTime() - ci.getTime()) / 60000) - (e.breakMinutes ?? e.totalBreakMinutes ?? 0) : 0);
  }, 0);
  const totalHours = totalMinutes / 60;
  const totalRevenue = parseFloat(String(assignment.umsatz || 0));
  const effectiveRate = totalHours > 0 ? totalRevenue / totalHours : 0;
  const projectExpenses = allExpenses.filter(e => e.assignmentId === id);
  const totalExpenses = projectExpenses.reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);
  const profit = totalRevenue - totalExpenses;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'clock', label: 'Stundenzettel' + (unreadClocks > 0 ? ` · ${unreadClocks} NEU` : '') },
    { key: 'expenses', label: 'Ausgaben (' + projectExpenses.length + ')' },
    { key: 'notes', label: 'Notizen (' + notes.filter(n => n.isPinned !== false).length + ')' },
    { key: 'photos', label: 'Fotos (' + photos.length + ')' + (unreadPhotos > 0 ? ' ●' : '') },
    { key: 'members', label: 'Team (' + members.length + ')' },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{assignment.projekt || assignment.kunde || 'Projekt'}</h1>
              <p className="text-slate-500 text-sm mt-1">
                {assignment.kunde && <span className="font-medium">{assignment.kunde}</span>}
                {assignment.datum && <span> &middot; {fmtDate(assignment.datum)}</span>}
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Umsatz" value={formatCurrency(totalRevenue)} color="text-emerald-600" />
            <KpiCard label="Ausgaben" value={formatCurrency(totalExpenses)} color="text-red-500" />
            <KpiCard label="Gewinn" value={formatCurrency(profit)} color={profit >= 0 ? 'text-emerald-600' : 'text-red-500'} />
            <KpiCard label="Std.-Satz" value={formatCurrency(effectiveRate)} color="text-purple-600" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 flex-wrap bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
              >{t.label}</button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'notes' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Neue Notiz..." className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40" />
                <button onClick={addNote} className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition-all">Senden</button>
              </div>
              {notes.filter(n => n.isPinned !== false).map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {n._isNew ? <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50 animate-pulse">NEU</span> : null}
                      <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">{n.userName || 'Unbekannt'}</span>
                      <span className="text-[10px] text-slate-400">{fmtTime(n.createdAt)}</span>
                    </div>
                    <button onClick={() => deleteNote(n.id)} className="text-slate-300 hover:text-red-500 text-xs">&times;</button>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note || n.text}</p>
                  <button onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">{expandedNoteId === n.id ? 'Antworten ausblenden' : 'Antworten'}</button>
                  {expandedNoteId === n.id && (
                    <div className="pl-4 border-l-2 border-teal-100 space-y-2 mt-2">
                      {(replies[n.id] || []).map((r: any) => (
                        <div key={r.id} className="text-sm">
                          <span className="font-bold text-slate-700 text-xs">{r.userName || 'Mitarbeiter'}: </span>
                          <span className="text-slate-600">{r.text}</span>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input value={replies[n.id] || ''} onChange={e => setReplies(prev => ({ ...prev, [n.id]: e.target.value }))} placeholder="Antwort..." className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none" />
                        <button onClick={() => addReply(n.id)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-all">Antworten</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'clock' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowManualEntry(!showManualEntry)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">Manuelle Buchung</button>
              </div>
              {showManualEntry && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs text-slate-500 font-medium">Start</label><input type="datetime-local" value={newManualStart} onChange={e => setNewManualStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" /></div>
                    <div><label className="text-xs text-slate-500 font-medium">Ende</label><input type="datetime-local" value={newManualEnd} onChange={e => setNewManualEnd(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" /></div>
                    <div><label className="text-xs text-slate-500 font-medium">Pause (min)</label><input type="number" value={newManualBreak} onChange={e => setNewManualBreak(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" /></div>
                  </div>
                  <button onClick={async () => {
                    if (!newManualStart || !newManualEnd) return;
                    await addDoc(collection(db, 'clock_entries'), {
                      assignmentId: id, userId: user?.uid, userName: companyDisplayName,
                      clockIn: new Date(newManualStart), clockOut: new Date(newManualEnd),
                      breakMinutes: parseInt(newManualBreak) || 0, manual: true,
                    });
                    setNewManualStart(''); setNewManualEnd(''); setNewManualBreak('0'); setShowManualEntry(false);
                  }} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition-all">Buchung speichern</button>
                </div>
              )}
              {clockEntries.map(e => {
                const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                const breakMins = e.breakMinutes ?? e.totalBreakMinutes ?? 0;
                const dur = ci && co ? durationMinutes(ci, co, breakMins) : 0;
                return (
                  <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {e._isNew ? <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50 animate-pulse">NEU</span> : null}
                      <div>
                      <p className="text-sm text-slate-700 font-medium">{e.userName || 'Mitarbeiter'}</p>
                      <p className="text-xs text-slate-400">{fmtTime(ci)} – {co ? fmtTime(co) : 'aktiv'} {breakMins > 0 && `(${breakMins}min Pause)`}</p>
                    </div>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{formatDuration(dur)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'photos' && (
            <div className="space-y-4">
              <button onClick={() => setShowPhotoUpload(!showPhotoUpload)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">Foto hochladen</button>
              {showPhotoUpload && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <ProjectPhoto assignmentId={id} userId={user?.uid || ''} userName={companyDisplayName} onUpload={() => setShowPhotoUpload(false)} />
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map(p => (
                  <div key={p.id} className="relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all" onClick={() => { setViewerPhoto(p); markPhotoRead(id).catch(() => {}); }}>
                    {p._isNew && <span className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50 animate-pulse">NEU</span>}
                    <ProjectPhoto photo={p} className="w-full h-32 object-cover" />
                    {p.userName && <p className="text-[10px] text-slate-400 px-2 py-1">{p.userName}</p>}
                  </div>
                ))}
              </div>
              {viewerPhoto && <PhotoViewer photo={viewerPhoto} onClose={() => { setViewerPhoto(null); markPhotoRead(id).catch(() => {}); }} />}
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.uid} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: colorFor(m.displayName) }}>{m.displayName.charAt(0).toUpperCase()}</div>
                  <span className="text-sm text-slate-700 font-medium">{m.displayName}</span>
                </div>
              ))}
              {members.length === 0 && <p className="text-sm text-slate-400">Keine Teammitglieder zugewiesen.</p>}
            </div>
          )}

          {tab === 'expenses' && (
            <div className="space-y-2">
              {projectExpenses.map(e => (
                <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{e.supplierName || 'Unbekannter Lieferant'}</p>
                    <p className="text-xs text-slate-400">
                      {e.invoiceNumber && <>{e.invoiceNumber} · </>}
                      {e.description || ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{(e.totalAmount || e.amount || 0).toFixed(2)} €</p>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      e.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                      e.status === 'overdue' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-600'
                    }`}>
                      {e.status === 'paid' ? 'Bezahlt' : e.status === 'overdue' ? 'Überfällig' : 'Offen'}
                    </span>
                  </div>
                </div>
              ))}
              {projectExpenses.length === 0 && (
                <p className="text-sm text-slate-400 p-4">Keine Ausgaben für dieses Projekt.</p>
              )}
            </div>
          )}

          {tab === 'overview' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-400">Kunde</span><p className="font-medium text-slate-700">{assignment.kunde || '–'}</p></div>
                <div><span className="text-slate-400">Datum</span><p className="font-medium text-slate-700">{assignment.datum || '–'}</p></div>
                <div><span className="text-slate-400">Umsatz</span><p className="font-medium text-emerald-700">{formatCurrency(totalRevenue)}</p></div>
                <div><span className="text-slate-400">Ausgaben</span><p className="font-medium text-red-600">{formatCurrency(totalExpenses)}</p></div>
                <div><span className="text-slate-400">Gewinn</span><p className={`font-medium ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(profit)}</p></div>
                <div><span className="text-slate-400">Effektiver Std.-Satz</span><p className="font-medium text-slate-700">{formatCurrency(effectiveRate)}/h</p></div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function gradeColor(grade: string): string {
  const m: Record<string, string> = {'A+':'text-green-600','A':'text-green-500','B':'text-lime-500','C':'text-amber-500','D':'text-orange-500','F':'text-red-500','–':'text-slate-400'};
  return m[grade] || m['–'];
}
