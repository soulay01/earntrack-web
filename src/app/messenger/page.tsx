'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, query, where, orderBy, addDoc, deleteDoc, updateDoc, getDoc, doc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '@/lib/firebase';
import { compressImage } from '@/lib/utils';
import { sendNoteCreatedNotification, sendReplyCreatedNotification } from '@/lib/pushNotifications';
import ProjectPhoto from '@/components/ProjectPhoto';
import PhotoViewer from '@/components/PhotoViewer';
import { getFeatureFlag } from '@/lib/plans';

type Tab = 'notes' | 'photos' | 'hours';

function fmtTime(date: Date | Timestamp | undefined | null): string {
  if (!date) return '-';
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getDateLabel(date: Date | Timestamp | undefined | null): string {
  if (!date) return 'Unbekannt';
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - noteDay.getTime()) / 86400000);
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays <= 7) return 'Diese Woche';
  if (diffDays <= 14) return 'Letzte Woche';
  if (diffDays <= 21) return 'Vorletzte Woche';
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
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
  const { user, company, loading, assignments, unreadCounts, photoUnreadCounts, clockUnreadCounts, markProjectRead, markPhotoRead, markClockRead, photoReads, clockReads } = useData();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('assignmentId') : null
  );
  const [showProjects, setShowProjects] = useState(false);

  const assignment = assignments.find((a: any) => a.id === selectedId) || null;
  const assignmentId = assignment?.id || null;
  const [pageLoading, setPageLoading] = useState(true);

  const handleSelectProject = (id: string) => {
    setSelectedId(id);
    setShowProjects(false);
    // Nur beim Tab-Wechsel markieren (nicht hier) – damit NEU-Badges sichtbar bleiben
  };

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

  if (!getFeatureFlag(company?.subscriptionPlan, 'employeeCredentials') && user) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-6 max-w-md">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Team-Kommunikation</h2>
            <p className="text-slate-500 text-sm mb-6">Team-Kommunikation ist in allen Tarifen enthalten. Bei Problemen wende dich bitte an den Support.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      {/* Project list sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-all duration-300 ${showProjects ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0 md:shadow-none'}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Team</h2>
            <p className="text-xs text-slate-400 mt-0.5">Projekt auswählen</p>
          </div>
          <button onClick={() => setShowProjects(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {assignments.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">Keine Projekte</p>
          )}
          {assignments.map((a: any) => {
            const sel = a.id === selectedId;
            const unread = unreadCounts[a.id] || 0;
            return (
              <button key={a.id} onClick={() => handleSelectProject(a.id)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  sel ? 'bg-teal-50 border border-teal-200 shadow-sm' : 'hover:bg-slate-50 border border-transparent'
                }`}>
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: colorFor(a.projekt || a.kunde || 'X') }}>
                    {(a.projekt || a.kunde || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{a.projekt || a.kunde || 'Unbenannt'}</p>
                    <p className="text-xs text-slate-400 truncate">{a.kunde || ''}</p>
                  </div>
                  {unread > 0 && (
                    <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Backdrop for project list on mobile */}
      {showProjects && <div className="fixed inset-0 bg-black/30 z-20 md:hidden " onClick={() => setShowProjects(false)} />}

      {/* Messenger content */}
      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
          <button onClick={() => setShowProjects(true)} className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 active:scale-[0.95] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Projekte
          </button>
          {assignment && <span className="text-xs text-slate-400 truncate ml-2">/ {assignment.projekt || assignment.kunde || 'Unbenannt'}</span>}
        </div>
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
  const { company, projectReads, photoReads, clockReads, unreadCounts, photoUnreadCounts, clockUnreadCounts, employees, markProjectRead, markPhotoRead, markClockRead } = useData();
  const companyDisplayName = company?.companyName || company?.name || user?.email || 'Unbekannt';
  const [tab, setTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [clockEntries, setClockEntries] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const prevNoteIdsRef = useRef<Set<string>>(new Set());
  const noteSeen = useRef(false);

  useEffect(() => {
    if (!assignmentId) return;
    noteSeen.current = false;
    // Read-Timestamps zum Zeitpunkt des Eintritts einfrieren (damit NEU-Badges nicht sofort verschwinden)
    const frozenProjectRead = projectReads?.[assignmentId];
    const frozenPhotoRead = photoReads?.[assignmentId];
    const frozenClockRead = clockReads?.[assignmentId];
    const uid = user?.uid;

    const unsubNotes = onSnapshot(
      query(collection(db, 'project_notes'), where('assignmentId', '==', assignmentId), orderBy('createdAt', 'desc')),
      snap => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          const t = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;
          let isNew = false;
          if (t && frozenProjectRead && data.userId !== uid) {
            const r = frozenProjectRead.toDate ? frozenProjectRead.toDate() : new Date(frozenProjectRead);
            isNew = t.getTime() > r.getTime();
          }
          return { id: d.id, ...data, _isNew: isNew };
        });
        if (!noteSeen.current) {
          noteSeen.current = true;
          prevNoteIdsRef.current = new Set(docs.map(d => d.id));
          const noteIds = docs.filter((d: any) => d._isNew).map((d: any) => d.id);
          if (noteIds.length > 0) setHighlightedIds(new Set(noteIds));
          setNotes(docs);
          return;
        }
        const newIds = docs.filter(d => !prevNoteIdsRef.current.has(d.id)).map(d => d.id);
        if (newIds.length > 0) {
          setHighlightedIds(prev => {
            const next = new Set([...prev, ...newIds]);
            setTimeout(() => setHighlightedIds(cur => { const n = new Set(cur); newIds.forEach(id => n.delete(id)); return n; }), 3000);
            return next;
          });
        }
        prevNoteIdsRef.current = new Set(docs.map(d => d.id));
        setNotes(docs);
      }
    );
    const unsubPhotos = onSnapshot(
      query(collection(db, 'project_photos'), where('assignmentId', '==', assignmentId), orderBy('createdAt', 'desc')),
      snap => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          const t = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;
          let isNew = false;
          if (t && frozenPhotoRead && data.userId !== uid) {
            const r = frozenPhotoRead.toDate ? frozenPhotoRead.toDate() : new Date(frozenPhotoRead);
            isNew = t.getTime() > r.getTime();
          }
          return { id: d.id, ...data, _isNew: isNew };
        });
        setPhotos(docs);
      },
      err => console.error('photos sub error:', err),
    );
    const unsubClock = onSnapshot(
      query(collection(db, 'clock_entries'), where('assignmentId', '==', assignmentId), orderBy('clockIn', 'desc')),
      snap => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          const t = data.clockIn?.toDate ? data.clockIn.toDate() : data.clockIn ? new Date(data.clockIn) : null;
          let isNew = false;
          if (t && frozenClockRead && data.userId !== uid) {
            const r = frozenClockRead.toDate ? frozenClockRead.toDate() : new Date(frozenClockRead);
            isNew = t.getTime() > r.getTime();
          }
          return { id: d.id, ...data, _isNew: isNew };
        });
        setClockEntries(docs);
      },
      err => console.error('clock entries sub error:', err),
    );
    return () => { unsubNotes(); unsubPhotos(); unsubClock(); };
  }, [assignmentId, projectReads, photoReads, clockReads, user?.uid]);

  // Mark reads when tab changes
  useEffect(() => {
    if (!assignmentId) return;
    if (tab === 'notes') markProjectRead(assignmentId).catch(() => {});
    else if (tab === 'photos') markPhotoRead(assignmentId).catch(() => {});
    else if (tab === 'hours') markClockRead(assignmentId).catch(() => {});
  }, [tab, assignmentId, markProjectRead, markPhotoRead, markClockRead]);

  const addNote = async () => {
    if (!user || !assignmentId || (!newNote.trim() && !photoFile)) return;
    try {
      let photoUri = '';
      let storagePath = '';
      if (photoFile) {
        let compressed;
        try {
          compressed = await compressImage(photoFile);
        } catch {
          compressed = photoFile;
        }
        const cleanName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `project_photos/${user.uid}/${Date.now()}_${cleanName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, compressed);
        photoUri = `gs://${storageRef.bucket}/${storageRef.fullPath}`;
        storagePath = path;
      }
      const noteText = newNote.trim() || '(Foto)';
      let photoUrl = '';
      if (storagePath) {
        try { photoUrl = await getDownloadURL(ref(storage, storagePath)); } catch (e) { console.warn('getDownloadURL failed', e); }
      }
      const noteRef = await addDoc(collection(db, 'project_notes'), {
        assignmentId, userId: user.uid, userName: companyDisplayName, note: noteText, createdAt: serverTimestamp(), isPinned: true,
        ...(photoUri && { photoUri, storagePath }),
        ...(photoUrl && { photoUrl }),
      });
      const memberSnap = await getDoc(doc(db, 'project_members', assignmentId));
      if (memberSnap.exists()) {
        const members = memberSnap.data();
        for (const uid of Object.keys(members)) {
          if (uid === user.uid) continue;
          await addDoc(collection(db, 'notifications'), {
            userId: uid,
            type: 'project_note',
            title: 'Neue Nachricht',
            body: `${user.email || 'Unternehmer'}: ${noteText.substring(0, 100)}`,
            assignmentId,
            noteId: noteRef.id,
            read: false,
            createdAt: serverTimestamp(),
          }).catch((eNotif: any) => console.error('notification error:', eNotif));
        }
      }
    } catch (e) {
      const err = e as any;
      const msg = err?.message || 'Unbekannter Fehler';
      const serverMsg = err?.serverResponse || err?.customEndpoint || '';
      console.error('Fehler beim Senden:', err);
      alert('Fehler: ' + msg + (serverMsg ? '\n\nServer: ' + serverMsg : ''));
    } finally {
      setNewNote('');
      setPhotoPreview(null);
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };



  const deleteNote = async (noteId: string) => {
    await deleteDoc(doc(db, 'project_notes', noteId));
  };

  const addReply = async (noteId: string) => {
    if (!user || !replies[noteId]?.trim()) return;
    const replyData = {
      userId: user.uid,
      userName: companyDisplayName,
      text: replies[noteId].trim(),
      createdAt: serverTimestamp(),
    };
    const replyRef = await addDoc(collection(db, 'project_note_replies'), {
      noteId, assignmentId, ...replyData,
    });
    await updateDoc(doc(db, 'project_notes', noteId), {
      [`replies.${replyRef.id}`]: replyData,
      repliedAt: serverTimestamp(),
    }).catch((e) => console.error('Failed to update reply on note:', e));
    setReplies(prev => ({ ...prev, [noteId]: '' }));
    sendReplyCreatedNotification({ noteId, userId: user.uid, userName: companyDisplayName, text: replies[noteId].trim() }, user.uid);
  };

  const deletePhoto = async (photoId: string) => {
    await deleteDoc(doc(db, 'project_photos', photoId));
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl">
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

      {/* Banner bei ungelesenen Inhalten */}
      {(() => {
        const unNotes = unreadCounts[assignmentId] || 0;
        const unPhotos = photoUnreadCounts[assignmentId] || 0;
        const unClocks = clockUnreadCounts[assignmentId] || 0;
        const total = unNotes + unPhotos + unClocks;
        if (total === 0) return null;
        return (
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex items-center gap-2 text-sm flex-wrap">
            <span className="font-semibold text-amber-700">📬 {total} ungelesen{total !== 1 ? 'e' : ''} {total === 1 ? 'Aktivität' : 'Aktivitäten'}</span>
            {unNotes > 0 && <button onClick={() => setTab('notes')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline px-1">{unNotes} Notiz{unNotes !== 1 ? 'en' : ''}</button>}
            {unPhotos > 0 && <button onClick={() => setTab('photos')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline px-1">{unPhotos} Foto{unPhotos !== 1 ? 's' : ''}</button>}
            {unClocks > 0 && <button onClick={() => setTab('hours')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline px-1">{unClocks} Arbeitszeit{unClocks !== 1 ? 'en' : ''}</button>}
          </div>
        );
      })()}

      {/* ───── Notes ───── */}
      {tab === 'notes' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Neue Notiz schreiben..."
              className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm"
              onKeyDown={e => e.key === 'Enter' && addNote()} />
            <button onClick={() => photoInputRef.current?.click()} type="button"
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.97] text-slate-600 text-sm font-bold rounded-xl transition-all border border-slate-200">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
            <button onClick={addNote} disabled={!newNote.trim() && !photoFile}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-md">
              Senden
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
            }} />
          {photoPreview && (
            <div className="relative inline-block">
              <img src={photoPreview} alt="" className="h-20 rounded-lg object-cover border border-slate-200 shadow-sm" />
              <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center hover:bg-red-600 shadow-md transition-all active:scale-[0.9]">✕</button>
            </div>
          )}
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Keine Notizen vorhanden</p>
          ) : (() => {
            const groups: Record<string, any[]> = {};
            for (const n of notes) {
              const label = getDateLabel(n.createdAt);
              if (!groups[label]) groups[label] = [];
              groups[label].push(n);
            }
            const order = ['Heute', 'Gestern', 'Diese Woche', 'Letzte Woche', 'Vorletzte Woche'];
            const sorted = Object.entries(groups).sort(([a], [b]) => {
              const ia = order.indexOf(a);
              const ib = order.indexOf(b);
              if (ia !== -1 && ib !== -1) return ia - ib;
              if (ia !== -1) return -1;
              if (ib !== -1) return 1;
              return 0;
            });
            return sorted.map(([label, items]) => {
              const isOpen = !collapsed[label];
              return (
                <div key={label}>
                  <button onClick={() => setCollapsed(prev => ({ ...prev, [label]: isOpen }))}
                    className="flex items-center gap-2 w-full text-left py-2 text-xs font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors">
                    <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    {label}
                    <span className="text-[10px] font-normal text-slate-300">({items.length})</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 mt-1">
                      {items.map((n: any) => (
                        <div key={n.id} className={`p-4 rounded-xl border shadow-sm transition-colors duration-500 ${highlightedIds.has(n.id) ? 'bg-yellow-100 border-yellow-300' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {n._isNew ? <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50 animate-pulse">NEU</span> : null}
                                <span className="text-xs font-bold text-slate-500">{n.userName || 'Unbekannt'}</span>
                                <span className="text-xs text-slate-400">
                                  {n.createdAt?.toDate ? fmtTime(n.createdAt.toDate()) : fmtTime(n.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</p>
                              {n.photoUri && (
                                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-white cursor-pointer" onClick={() => setSelectedPhoto({ photoUri: n.photoUri, photoUrl: n.photoUrl, storagePath: n.storagePath, id: n.id, userName: n.userName })}>
                                  <ProjectPhoto photo={{ photoUri: n.photoUri, photoUrl: n.photoUrl, storagePath: n.storagePath, id: n.id }} className="w-full max-h-48 object-cover" />
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
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
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ───── Photos ───── */}
      {tab === 'photos' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <span className="text-4xl block mb-3">📸</span>
                <p className="text-sm text-slate-400">Keine Fotos vorhanden</p>
              </div>
            ) : (
              photos.map((p: any) => (
                <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => setSelectedPhoto(p)}>
                    {p._isNew ? <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50 animate-pulse">NEU</span> : null}
                    <div className="w-full h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
                      <ProjectPhoto photo={p} className="w-full h-full object-cover" />
                    </div>
                  <div className="p-2.5">
                    <p className="text-[10px] font-semibold text-slate-400 truncate">{p.userName || 'Unbekannt'}</p>
                    <p className="text-[10px] text-slate-400">{p.createdAt?.toDate ? fmtDate(p.createdAt.toDate()) : ''}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deletePhoto(p.id); }}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 active:scale-[0.9] shadow-lg">
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {selectedPhoto && (
        <PhotoViewer photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}

      {/* ───── Hours ───── */}
      {tab === 'hours' && (
        <div className="space-y-4">
          {clockEntries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Keine Zeiteinträge vorhanden</p>
          ) : (() => {
            const userMap: Record<string, { name: string; beruf: string }> = {};
            (employees || []).forEach((emp: any) => {
              if (emp.authUid) userMap[emp.authUid] = { name: emp.name, beruf: emp.berufsfeld || '' };
              if (emp.email) userMap[emp.email.toLowerCase()] = { name: emp.name, beruf: emp.berufsfeld || '' };
            });

            const getDayKey = (d: Date) =>
              d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

            const getDayLabel = (d: Date) => {
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
              const diff = Math.floor((today.getTime() - day.getTime()) / 86400000);
              if (diff === 0) return 'Heute';
              if (diff === 1) return 'Gestern';
              return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
            };

            const groups: Record<string, any[]> = {};
            let totalMinutes = 0;
            for (const e of clockEntries) {
              const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
              const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
              const key = getDayKey(ci);
              if (!groups[key]) groups[key] = [];
              groups[key].push(e);
              if (co) {
                totalMinutes += Math.round((co.getTime() - ci.getTime()) / 60000) - (e.totalBreakMinutes || 0);
              }
            }

            const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
              const [da, db] = [a.split('.').reverse().join(''), b.split('.').reverse().join('')];
              return db.localeCompare(da);
            });

            return (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <span className="text-sm font-bold text-teal-800">Gesamt</span>
                  <span className="text-sm font-bold text-teal-800">{formatDuration(totalMinutes)}</span>
                </div>
                {sortedGroups.map(([dateKey, items]) => {
                  const isOpen = !collapsed[dateKey];
                  const dayTotal = items.reduce((s, e: any) => {
                    const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                    const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                    if (!co) return s;
                    return s + Math.round((co.getTime() - ci.getTime()) / 60000) - (e.totalBreakMinutes || 0);
                  }, 0);

                  return (
                    <div key={dateKey}>
                      <button onClick={() => setCollapsed(prev => ({ ...prev, [dateKey]: isOpen }))}
                        className="flex items-center gap-2 w-full text-left py-2 text-xs font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors">
                        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        {getDayLabel(items[0].clockIn?.toDate ? items[0].clockIn.toDate() : new Date(items[0].clockIn))}
                        <span className="text-[10px] font-normal text-slate-300">({items.length})</span>
                        <span className="ml-auto text-[11px] font-bold text-slate-500">{formatDuration(dayTotal)}</span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 mt-1">
                          {items.map((e: any) => {
                            const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                            const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                            const breakMins = e.totalBreakMinutes || 0;
                            const isActive = !co;
                            const mins = isActive ? 0 : Math.round((co.getTime() - ci.getTime()) / 60000) - breakMins;
                            const info = userMap[e.userId] || userMap[(e.userEmail || '').toLowerCase()] || {};
                            const name = info.name || e.userName || (e.userEmail || '').split('@')[0] || 'Unbekannt';
                            const displayName = info.beruf ? `${name} (${info.beruf})` : name;
                            const timeStr = ci.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const timeOutStr = co ? co.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;

                            return (
                              <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                  {e._isNew ? <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-bold shadow-md shadow-red-300/50 animate-pulse">NEU</span> : null}
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                    style={{ backgroundColor: colorFor(name) }}>
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                                    <p className="text-xs text-slate-400">
                                      {timeStr} – {timeOutStr || 'aktiv'}
                                      {breakMins > 0 && ` (${breakMins}min Pause)`}
                                    </p>
                                  </div>
                                </div>
                                <span className={`text-sm font-bold shrink-0 ml-3 ${isActive ? 'text-green-600' : 'text-slate-900'}`}>
                                  {isActive ? '⏳' : formatDuration(mins)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function NoteRepliesInline({ noteId, user }: { noteId: string; user: any }) {
  const [replies, setReplies] = useState<any[]>([]);
  const [replyHighlights, setReplyHighlights] = useState<Set<string>>(new Set());
  const prevReplyIdsRef = useRef<Set<string>>(new Set());
  const replyInitialLoad = useRef(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'project_note_replies'), where('noteId', '==', noteId), orderBy('createdAt', 'asc')),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (replyInitialLoad.current) {
          replyInitialLoad.current = false;
          prevReplyIdsRef.current = new Set(docs.map(d => d.id));
          setReplies(docs);
          return;
        }
        const newIds = docs.filter(d => !prevReplyIdsRef.current.has(d.id)).map(d => d.id);
        if (newIds.length > 0) {
          setReplyHighlights(prev => new Set([...prev, ...newIds]));
          setTimeout(() => setReplyHighlights(prev => { const next = new Set(prev); newIds.forEach(id => next.delete(id)); return next; }), 3000);
        }
        prevReplyIdsRef.current = new Set(docs.map(d => d.id));
        setReplies(docs);
      },
      err => console.error('replies sub error:', err),
    );
    return unsub;
  }, [noteId]);

  if (replies.length === 0) return null;

  return (
    <div className="mt-2 ml-4 pl-3 border-l-2 border-slate-200 space-y-1.5">
      {replies.map((r: any) => (
        <div key={r.id} className={`text-xs px-2 py-0.5 rounded ${replyHighlights.has(r.id) ? 'bg-yellow-100' : ''}`}>
          <span className="font-bold text-slate-500">{r.userName}: </span>
          <span className="text-slate-600">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
