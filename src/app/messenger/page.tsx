'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, query, where, orderBy, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

type Tab = 'notes' | 'photos' | 'hours';

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

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function MessengerPage() {
  const { user, loading, assignments } = useData();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('assignmentId') : null
  );

  const assignment = assignments.find((a: any) => a.id === selectedId) || null;
  const assignmentId = assignment?.id || null;
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!loading) setPageLoading(false);
  }, [loading]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (selectedId && assignments.length > 0 && !assignments.find((a: any) => a.id === selectedId)) {
      setSelectedId(null);
    }
  }, [assignments, selectedId]);

  if (pageLoading || loading || !user) return null;

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      {/* Project list sidebar */}
      <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Team</h2>
          <p className="text-xs text-slate-400 mt-0.5">Projekt auswählen</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {assignments.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">Keine Projekte</p>
          )}
          {assignments.map((a: any) => {
            const sel = a.id === selectedId;
            return (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  sel ? 'bg-teal-50 border border-teal-200 shadow-sm' : 'hover:bg-slate-50 border border-transparent'
                }`}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: colorFor(a.projekt || a.kunde || 'X') }}>
                    {(a.projekt || a.kunde || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{a.projekt || a.kunde || 'Unbenannt'}</p>
                    <p className="text-xs text-slate-400 truncate">{a.kunde || ''}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messenger content */}
      <main className="flex-1 overflow-y-auto">
        {assignmentId && assignment ? (
          <MessengerContent
            key={assignmentId}
            assignment={assignment}
            assignmentId={assignmentId}
            user={user}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <p className="text-slate-500 font-semibold">Wähle ein Projekt</p>
              <p className="text-xs text-slate-400 mt-1">um Notizen, Fotos und Arbeitszeiten zu sehen</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MessengerContent({ assignment, assignmentId, user }: { assignment: any; assignmentId: string; user: any }) {
  const [tab, setTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [clockEntries, setClockEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!assignmentId) return;
    const unsubNotes = onSnapshot(
      query(collection(db, 'project_notes'), where('assignmentId', '==', assignmentId), orderBy('createdAt', 'desc')),
      snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubPhotos = onSnapshot(
      query(collection(db, 'project_photos'), where('assignmentId', '==', assignmentId), orderBy('createdAt', 'desc')),
      snap => setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubClock = onSnapshot(
      query(collection(db, 'clock_entries'), where('assignmentId', '==', assignmentId), orderBy('clockIn', 'desc')),
      snap => setClockEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubNotes(); unsubPhotos(); unsubClock(); };
  }, [assignmentId]);

  const addNote = async () => {
    if (!user || !assignmentId || !newNote.trim()) return;
    await addDoc(collection(db, 'project_notes'), {
      assignmentId, userId: user.uid, userName: user.email || 'Unbekannt', note: newNote.trim(), createdAt: serverTimestamp(), isPinned: false,
    });
    setNewNote('');
  };

  const togglePin = async (noteId: string, isPinned: boolean) => {
    await updateDoc(doc(db, 'project_notes', noteId), { isPinned: !isPinned });
  };

  const deleteNote = async (noteId: string) => {
    await deleteDoc(doc(db, 'project_notes', noteId));
  };

  const addReply = async (noteId: string) => {
    if (!user || !replies[noteId]?.trim()) return;
    await addDoc(collection(db, 'project_note_replies'), {
      noteId, userId: user.uid, userName: user.email || 'Unbekannt', text: replies[noteId].trim(), createdAt: serverTimestamp(),
    });
    setReplies(prev => ({ ...prev, [noteId]: '' }));
  };

  const addPhoto = async (file: File) => {
    if (!user || !assignmentId || !file) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `project_photos/${assignmentId}/${user.uid}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      const snap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snap.ref);
      await addDoc(collection(db, 'project_photos'), {
        assignmentId, userId: user.uid, userName: user.email || 'Unbekannt', photoUri: downloadUrl, createdAt: serverTimestamp(), isPinned: false,
      });
    } catch (e) {
      console.error('Upload photo error:', e);
      alert('Fehler beim Hochladen des Fotos');
    } finally { setUploadingPhoto(false); }
  };

  const deletePhoto = async (photoId: string) => {
    await deleteDoc(doc(db, 'project_photos', photoId));
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm"
          style={{ backgroundColor: colorFor(assignment.projekt || assignment.kunde || 'X') }}>
          {(assignment.projekt || assignment.kunde || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{assignment.projekt || 'Unbenannt'}</h1>
          <p className="text-sm text-slate-400">{assignment.kunde || ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 pb-2">
        <button onClick={() => setTab('notes')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
            tab === 'notes' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}>
          Notizen
        </button>
        <button onClick={() => setTab('photos')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
            tab === 'photos' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}>
          Fotos
        </button>
        <button onClick={() => setTab('hours')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
            tab === 'hours' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}>
          Arbeitszeiten
        </button>
      </div>

      {/* ───── Notes ───── */}
      {tab === 'notes' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Neue Notiz schreiben..."
              className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm" />
            <button onClick={addNote} disabled={!newNote.trim()}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-md">
              Senden
            </button>
          </div>
          <div className="space-y-3">
            {notes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Keine Notizen vorhanden</p>
            ) : (
              notes.map((n: any) => (
                <div key={n.id} className={`p-4 rounded-xl border transition-all duration-200 ${
                  n.isPinned ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-500">{n.userName || 'Unbekannt'}</span>
                        <span className="text-xs text-slate-400">
                          {n.createdAt?.toDate ? fmtTime(n.createdAt.toDate()) : fmtTime(n.createdAt)}
                        </span>
                        {n.isPinned && <span className="text-xs text-amber-600 font-bold">Angepinnt</span>}
                      </div>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => togglePin(n.id, n.isPinned)}
                        className="p-1.5 text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 active:scale-[0.9] rounded-lg transition-all">
                        {n.isPinned ? '📌' : '📍'}
                      </button>
                      <button onClick={() => deleteNote(n.id)}
                        className="p-1.5 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-[0.9] rounded-lg transition-all">
                        ✕
                      </button>
                    </div>
                  </div>
                  <NoteRepliesInline noteId={n.id} user={user} />
                  <div className="mt-2 flex gap-2">
                    <input value={replies[n.id] || ''} onChange={e => setReplies(prev => ({ ...prev, [n.id]: e.target.value }))}
                      placeholder="Antworten..." className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-teal-500 transition-all" />
                    <button onClick={() => addReply(n.id)} disabled={!replies[n.id]?.trim()}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 active:scale-[0.97] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-sm">
                      Antworten
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ───── Photos ───── */}
      {tab === 'photos' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-400 hover:border-teal-300 hover:text-teal-600 cursor-pointer transition-all shadow-sm">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {uploadingPhoto ? 'Wird hochgeladen...' : 'Foto auswählen & hochladen'}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) { await addPhoto(file); e.target.value = ''; }
              }} disabled={uploadingPhoto} />
            </label>
            {uploadingPhoto && <span className="w-5 h-5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin shrink-0" />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <span className="text-4xl block mb-3">📸</span>
                <p className="text-sm text-slate-400">Keine Fotos vorhanden</p>
              </div>
            ) : (
              photos.map((p: any) => (
                <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-all duration-300">
                  <div className="w-full h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img src={p.photoUri} alt="" className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('[data-photo-fallback]')) {
                          const div = document.createElement('div');
                          div.setAttribute('data-photo-fallback', '');
                          div.className = 'flex flex-col items-center justify-center text-slate-400';
                          div.innerHTML = '<svg class="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span class="text-[10px]">Foto nicht verfügbar</span>';
                          parent.appendChild(div);
                        }
                      }} />
                  </div>
                  <div className="p-2.5">
                    <p className="text-[10px] font-semibold text-slate-400 truncate">{p.userName || 'Unbekannt'}</p>
                    <p className="text-[10px] text-slate-400">{p.createdAt?.toDate ? fmtDate(p.createdAt.toDate()) : ''}</p>
                  </div>
                  <button onClick={() => deletePhoto(p.id)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 active:scale-[0.9] shadow-lg">
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ───── Hours ───── */}
      {tab === 'hours' && (
        <div className="space-y-4">
          <div className="space-y-2">
            {clockEntries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Keine Zeiteinträge vorhanden</p>
            ) : (() => {
              const hoursMap: Record<string, number> = {};
              clockEntries.forEach((e: any) => {
                const name = e.userName || e.userEmail || 'Unbekannt';
                const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                if (co) {
                  const mins = Math.round((co.getTime() - ci.getTime()) / 60000) - (e.totalBreakMinutes || 0);
                  hoursMap[name] = (hoursMap[name] || 0) + mins;
                }
              });
              const sorted = Object.entries(hoursMap).sort((a, b) => b[1] - a[1]);
              const total = sorted.reduce((s, [, m]) => s + m, 0);
              return (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 border border-teal-200">
                    <span className="text-sm font-bold text-teal-800">Gesamt</span>
                    <span className="text-sm font-bold text-teal-800">{formatDuration(total)}</span>
                  </div>
                  {sorted.map(([name, mins]) => (
                    <div key={name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-xs font-bold">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{name}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-800">{formatDuration(mins)}</span>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRepliesInline({ noteId, user }: { noteId: string; user: any }) {
  const [replies, setReplies] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'project_note_replies'), where('noteId', '==', noteId), orderBy('createdAt', 'asc')),
      snap => setReplies(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [noteId]);

  if (replies.length === 0) return null;

  return (
    <div className="mt-2 ml-4 pl-3 border-l-2 border-slate-200 space-y-1.5">
      {replies.map((r: any) => (
        <div key={r.id} className="text-xs">
          <span className="font-bold text-slate-500">{r.userName}: </span>
          <span className="text-slate-600">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
