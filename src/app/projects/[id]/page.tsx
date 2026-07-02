'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { formatCurrency, parseDate } from '@/lib/utils';
import { calculateRevenue } from '@/lib/calculations';
import { collection, query, where, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ProjectPhoto from '@/components/ProjectPhoto';
import PhotoViewer from '@/components/PhotoViewer';

function fmtTime(date: Date | Timestamp | undefined | null): string {
  if (!date) return '-';
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(date: Date | Timestamp | string | undefined | null): string {
  if (!date) return '-';
  if (date instanceof Timestamp) return date.toDate().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (typeof date === 'string') {
    const d = parseDate(date);
    if (d) return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return date;
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

type Tab = 'overview' | 'clock' | 'notes' | 'photos' | 'members' | 'material';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function ProjectDetailPage() {
  const { user, company, companyId, loading: authLoading, unreadCounts, photoUnreadCounts, clockUnreadCounts, markPhotoRead, markProjectRead, markClockRead, projectReads, photoReads, clockReads } = useData();
  const [materialMovements, setMaterialMovements] = useState<any[]>([]);
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [clockEntries, setClockEntries] = useState<any[]>([]);

  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [repliesData, setRepliesData] = useState<Record<string, any[]>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);

  const [members, setMembers] = useState<any[]>([]);

  const [viewerPhoto, setViewerPhoto] = useState<any>(null);
  const [clickedNoteIds, setClickedNoteIds] = useState<Set<string>>(new Set());
  const [clickedClockIds, setClickedClockIds] = useState<Set<string>>(new Set());
  const [clickedPhotoIds, setClickedPhotoIds] = useState<Set<string>>(new Set());

  const unreadNotes = unreadCounts?.[id] || 0;
  const unreadPhotos = photoUnreadCounts?.[id] || 0;
  const unreadClocks = clockUnreadCounts?.[id] || 0;
  const totalUnread = unreadNotes + unreadPhotos + unreadClocks;

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

  // Material-Entnahmen aus dem Lager für dieses Projekt
  useEffect(() => {
    if (!id || !user || !companyId) return;
    const q = query(collection(db, 'inventory_movements'), where('companyId', '==', companyId), where('assignmentId', '==', id));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMaterialMovements(docs);
    }, err => console.error('material movements sub error:', err));
    return unsub;
  }, [id, user, companyId]);

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
      setRepliesData(prev => ({ ...prev, [expandedNoteId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
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
    // Push-Benachrichtigung wird automatisch via Firebase Function onNoteCreated gesendet
  }

  async function addReply(noteId: string) {
    const text = replyTexts[noteId]?.trim();
    if (!user || !text) return;
    await addDoc(collection(db, 'project_note_replies'), {
      noteId, assignmentId: id, userId: user.uid, userName: companyDisplayName,
      text, createdAt: serverTimestamp(),
    });
    setReplyTexts(prev => ({ ...prev, [noteId]: '' }));
  }

  async function deleteNote(noteId: string) {
    if (!user || !confirm('Notiz löschen?')) return;
    try { await deleteDoc(doc(db, 'project_notes', noteId)); }
    catch (e) { console.error('deleteNote error:', e); alert('Fehler beim Löschen der Notiz'); }
  }

  if (loading || authLoading) return <PageSkeleton variant="detail" maxWidth="max-w-5xl" />;
  if (!user) return null;
  if (!assignment) return <div className="p-8 text-slate-500">Projekt nicht gefunden.</div>;

  const totalMinutes = clockEntries.reduce((sum, e) => {
    const ci = e.clockIn?.toDate ? e.clockIn.toDate() : null;
    const co = e.clockOut?.toDate ? e.clockOut.toDate() : null;
    if (!ci || !co) return sum;
    const breakMs = e.totalBreakMs ?? (e.breakMinutes ?? e.totalBreakMinutes ?? 0) * 60000;
    return sum + Math.round(((co.getTime() - ci.getTime()) - breakMs) / 60000);
  }, 0);
  const totalHours = totalMinutes / 60;
  const totalRevenue = calculateRevenue(assignment.umsatz);
  const effectiveRate = totalHours > 0 ? totalRevenue / totalHours : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'clock', label: 'Stundenzettel' + (unreadClocks > 0 ? ` · ${unreadClocks} NEU` : '') },
    { key: 'notes', label: 'Notizen (' + notes.filter(n => n.isPinned !== false).length + ')' },
    { key: 'photos', label: 'Fotos (' + photos.length + ')' + (unreadPhotos > 0 ? ' ●' : '') },
    { key: 'members', label: 'Team (' + members.length + ')' },
    { key: 'material', label: 'Material (' + materialMovements.length + ')' },
  ];

  const materialCost = materialMovements.reduce((s, m) => m.delta < 0 ? s + Math.abs(m.delta) * (m.unitPrice || 0) : s, 0);

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
            <KpiCard label="Std.-Satz" value={formatCurrency(effectiveRate)} color="text-purple-600" />
          </div>

          {/* Ungelesen-Banner */}
          {totalUnread > 0 && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-700 text-sm font-medium flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>{totalUnread} ungelesen:</span>
              {unreadNotes > 0 && (
                <button onClick={() => setTab('notes')} className="underline hover:text-red-800 font-semibold">{unreadNotes} Notiz{unreadNotes > 1 ? 'en' : ''}</button>
              )}
              {unreadPhotos > 0 && (
                <button onClick={() => setTab('photos')} className="underline hover:text-red-800 font-semibold">{unreadPhotos} Foto{unreadPhotos > 1 ? 's' : ''}</button>
              )}
              {unreadClocks > 0 && (
                <button onClick={() => setTab('clock')} className="underline hover:text-red-800 font-semibold">{unreadClocks} Arbeitszeit{unreadClocks > 1 ? 'en' : ''}</button>
              )}
            </div>
          )}

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
              {notes.filter(n => n.isPinned !== false).map(n => {
                const isUnread = n._isNew && !clickedNoteIds.has(n.id);
                return (
                <div key={n.id}
                  onClick={() => setClickedNoteIds(prev => { const s = new Set(prev); s.add(n.id); return s; })}
                  className={`rounded-xl border p-4 space-y-2 cursor-pointer transition-all ${
                    isUnread
                      ? 'bg-amber-50/70 border-amber-300 shadow-sm shadow-amber-200/50'
                      : 'bg-white border-slate-200'
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isUnread ? <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50">NEU</span> : null}
                      <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">{n.userName || 'Unbekannt'}</span>
                      <span className="text-[10px] text-slate-400">{fmtTime(n.createdAt)}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }} className="text-slate-300 hover:text-red-500 text-xs">&times;</button>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note || n.text}</p>
                  <button onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">{expandedNoteId === n.id ? 'Antworten ausblenden' : 'Antworten'}</button>
                  {expandedNoteId === n.id && (
                    <div className="pl-4 border-l-2 border-teal-100 space-y-2 mt-2">
                      {(repliesData[n.id] || []).map((r: any) => (
                        <div key={r.id} className="text-sm">
                          <span className="font-bold text-slate-700 text-xs">{r.userName || 'Mitarbeiter'}: </span>
                          <span className="text-slate-600">{r.text}</span>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input value={replyTexts[n.id] || ''} onChange={e => setReplyTexts(prev => ({ ...prev, [n.id]: e.target.value }))} placeholder="Antwort..." className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none" />
                        <button onClick={() => addReply(n.id)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-all">Antworten</button>
                      </div>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}

          {tab === 'clock' && (
            <div className="space-y-4">
              {clockEntries.map(e => {
                const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                // Kanonisch: totalBreakMs ist das primäre Feld (wie im restlichen App-Code)
                const breakMins = Math.round((e.totalBreakMs ?? (e.breakMinutes ?? e.totalBreakMinutes ?? 0) * 60000) / 60000);
                const dur = ci && co ? Math.max(0, durationMinutes(ci, co, breakMins)) : 0;
                const isUnread = e._isNew && !clickedClockIds.has(e.id);
                return (
                  <div key={e.id}
                    onClick={() => setClickedClockIds(prev => { const s = new Set(prev); s.add(e.id); return s; })}
                    className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all ${
                      isUnread
                        ? 'bg-amber-50/70 border-amber-300 shadow-sm shadow-amber-200/50'
                        : 'bg-white border-slate-200'
                    }`}>
                    <div className="flex items-center gap-2">
                      {isUnread ? <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50">NEU</span> : null}
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
                {photos.map(p => {
                  const isUnread = p._isNew && !clickedPhotoIds.has(p.id);
                  return (
                  <div key={p.id}
                    onClick={() => { setClickedPhotoIds(prev => { const s = new Set(prev); s.add(p.id); return s; }); setViewerPhoto(p); markPhotoRead(id).catch(e => console.error('markPhotoRead:', e)); }}
                    className={`relative rounded-xl border overflow-hidden cursor-pointer hover:shadow-md transition-all ${
                      isUnread
                        ? 'bg-amber-50 border-amber-300 shadow-sm shadow-amber-200/50'
                        : 'bg-white border-slate-200'
                    }`}>
                    {isUnread && <span className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50">NEU</span>}
                    <ProjectPhoto photo={p} className="w-full h-32 object-cover" />
                    {p.userName && <p className="text-[10px] text-slate-400 px-2 py-1">{p.userName}</p>}
                  </div>
                  );
                })}
              </div>
              {viewerPhoto && <PhotoViewer photo={viewerPhoto} onClose={() => { setViewerPhoto(null); markPhotoRead(id).catch(e => console.error('markPhotoRead:', e)); }} />}
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

          {tab === 'material' && (
            <div className="space-y-3">
              {materialCost > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Materialkosten (Entnahmen × EK)</span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(materialCost)}</span>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {materialMovements.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.itemName || 'Artikel'}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {m.userName || '–'} · {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${m.delta >= 0 ? 'text-teal-700' : 'text-slate-900'}`}>{m.delta >= 0 ? '+' : ''}{m.delta} {m.unit || 'Stk'}</p>
                      {m.delta < 0 && (m.unitPrice || 0) > 0 && <p className="text-xs text-slate-500 tabular-nums">{formatCurrency(Math.abs(m.delta) * m.unitPrice)}</p>}
                    </div>
                  </div>
                ))}
                {materialMovements.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-10 px-4">Noch kein Material auf dieses Projekt gebucht. Scanne im Lager einen QR-Code und wähle dieses Projekt bei der Entnahme.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'overview' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-400">Kunde</span><p className="font-medium text-slate-700">{assignment.kunde || '–'}</p></div>
                <div><span className="text-slate-400">Datum</span><p className="font-medium text-slate-700">{assignment.datum || '–'}</p></div>
                <div><span className="text-slate-400">Umsatz</span><p className="font-medium text-emerald-700">{formatCurrency(totalRevenue)}</p></div>
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
