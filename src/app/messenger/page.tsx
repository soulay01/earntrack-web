'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { collection, query, where, orderBy, addDoc, deleteDoc, updateDoc, getDoc, doc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '@/lib/firebase';
import { compressImage } from '@/lib/utils';
import { sendNoteCreatedNotification, sendReplyCreatedNotification } from '@/lib/pushNotifications';
import ProjectPhoto from '@/components/ProjectPhoto';
import PhotoViewer from '@/components/PhotoViewer';
import { getFeatureFlag } from '@/lib/plans';
import { Camera, Loader2, X, Menu, MessageSquare, Folder, ImagePlus, ChevronRight } from 'lucide-react';

const ui = {
  input: 'px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
};

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

export default function MessengerPage() {
  const { user, company, loading, assignments, unreadCounts, markProjectRead, markPhotoRead } = useData();
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
    markProjectRead(id);
    markPhotoRead(id);
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

  if (pageLoading || loading || !user) return <PageSkeleton variant="chat" />;

  if (!getFeatureFlag(company?.subscriptionPlan, 'employeeCredentials') && user) {
    return (
      <div className="flex h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-6 max-w-md">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-5 h-5 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Team-Kommunikation</h2>
            <p className="text-slate-500 text-sm mb-6">Team-Kommunikation ist in allen Tarifen enthalten. Bei Problemen wende dich bitte an den Support.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      {/* Project list sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-transform duration-300 ${showProjects ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0 md:shadow-none'}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Team</h2>
            <p className="text-xs text-slate-500 mt-0.5">Projekt auswählen</p>
          </div>
          <button onClick={() => setShowProjects(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {assignments.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">Keine Projekte</p>
          )}
          {assignments.map((a: any) => {
            const sel = a.id === selectedId;
            const unread = unreadCounts[a.id] || 0;
            return (
              <button key={a.id} onClick={() => handleSelectProject(a.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  sel ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sel ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                    <Folder className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${sel ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{a.projekt || a.kunde || 'Unbenannt'}</p>
                    <p className="text-xs text-slate-500 truncate">{a.kunde || ''}</p>
                  </div>
                  {unread > 0 && (
                    <span className="shrink-0 bg-teal-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
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
      {showProjects && <div className="fixed inset-0 bg-slate-900/40 z-20 md:hidden" onClick={() => setShowProjects(false)} />}

      {/* Messenger content */}
      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
          <button onClick={() => setShowProjects(true)} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <Menu className="w-4 h-4" />
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
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-900">Wähle ein Projekt</p>
              <p className="text-sm text-slate-500 mt-1">um Notizen, Fotos und Arbeitszeiten zu sehen</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MessengerContent({ assignment, assignmentId, user }: { assignment: any; assignmentId: string; user: any }) {
  const { company, projectReads, employees } = useData();
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
    const lastRead = projectReads?.[assignmentId];
    const unsubNotes = onSnapshot(
      query(collection(db, 'project_notes'), where('assignmentId', '==', assignmentId), orderBy('createdAt', 'desc')),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!noteSeen.current) {
          noteSeen.current = true;
          prevNoteIdsRef.current = new Set(docs.map(d => d.id));
          const noteIds = docs.filter((d: any) => {
            if (!lastRead) return false;
            const t = d.createdAt?.toDate ? d.createdAt.toDate() : d.createdAt ? new Date(d.createdAt) : null;
            const r = lastRead.toDate ? lastRead.toDate() : new Date(lastRead);
            return t && t.getTime() > r.getTime();
          }).map((d: any) => d.id);
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
      snap => setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('photos sub error:', err),
    );
    const unsubClock = onSnapshot(
      query(collection(db, 'clock_entries'), where('assignmentId', '==', assignmentId), orderBy('clockIn', 'desc')),
      snap => setClockEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('clock entries sub error:', err),
    );
    return () => { unsubNotes(); unsubPhotos(); unsubClock(); };
  }, [assignmentId]);

  const addNote = async () => {
    if (!user || !assignmentId || (!newNote.trim() && !photoFile)) return;
    try {
      let photoUri = '';
      let storagePath = '';
      if (photoFile) {
        let compressed;
        try {
          compressed = await compressImage(photoFile);
        } catch (e) {
          console.error('Image compression failed:', e);
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
    if (!user?.uid) return;
    const noteRef = doc(db, 'project_notes', noteId);
    const noteSnap = await getDoc(noteRef);
    if (!noteSnap.exists()) return;
    const noteData = noteSnap.data();
    if (noteData?.userId !== user.uid) return;
    await deleteDoc(noteRef);
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
    if (!user?.uid) return;
    const photoRef = doc(db, 'project_photos', photoId);
    const photoSnap = await getDoc(photoRef);
    if (!photoSnap.exists()) return;
    const photoData = photoSnap.data();
    if (photoData?.userId !== user.uid) return;
    await deleteDoc(photoRef);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{assignment.projekt || 'Unbenannt'}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{assignment.kunde || ''}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 mb-6 border-b border-slate-200">
        {([['notes', 'Notizen'], ['photos', 'Fotos'], ['hours', 'Arbeitszeiten']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`pb-2.5 -mb-px text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-teal-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ───── Notes ───── */}
      {tab === 'notes' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Neue Notiz schreiben …"
              className={`flex-1 ${ui.input}`}
              onKeyDown={e => e.key === 'Enter' && addNote()} />
            <button onClick={() => photoInputRef.current?.click()} type="button" title="Foto anhängen"
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-500 rounded-lg transition-colors border border-slate-300">
              <ImagePlus className="w-4 h-4" />
            </button>
            <button onClick={addNote} disabled={!newNote.trim() && !photoFile}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
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
              <img src={photoPreview} alt="" className="h-20 rounded-lg object-cover border border-slate-200" />
              <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-slate-700 text-white rounded-full flex items-center justify-center hover:bg-slate-900 transition-colors"><X className="w-3 h-3" /></button>
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
                    className="flex items-center gap-2 w-full text-left py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    {label}
                    <span className="text-slate-400">({items.length})</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 mt-1">
                      {items.map((n: any) => (
                        <div key={n.id} className={`p-4 rounded-lg border transition-colors duration-500 ${highlightedIds.has(n.id) ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-slate-700">{n.userName || 'Unbekannt'}</span>
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
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <NoteRepliesInline noteId={n.id} user={user} />
                          <div className="mt-2 flex gap-2">
                            <input value={replies[n.id] || ''} onChange={e => setReplies(prev => ({ ...prev, [n.id]: e.target.value }))}
                              placeholder="Antworten …" className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors" />
                            <button onClick={() => addReply(n.id)} disabled={!replies[n.id]?.trim()}
                              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
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
                <Camera className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-400">Keine Fotos vorhanden</p>
              </div>
            ) : (
              photos.map((p: any) => (
                <div key={p.id} className="group relative rounded-lg overflow-hidden border border-slate-200 bg-white hover:border-slate-300 transition-colors cursor-pointer" onClick={() => setSelectedPhoto(p)}>
                    <div className="w-full h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
                      <ProjectPhoto photo={p} className="w-full h-full object-cover" />
                    </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-slate-700 truncate">{p.userName || 'Unbekannt'}</p>
                    <p className="text-xs text-slate-400">{p.createdAt?.toDate ? fmtDate(p.createdAt.toDate()) : ''}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deletePhoto(p.id); }}
                    className="absolute top-2 right-2 p-1.5 bg-slate-900/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900">
                    <X className="w-3.5 h-3.5" />
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
                const breakMin = Math.round((e.totalBreakMs ?? (e.totalBreakMinutes || 0) * 60000) / 60000);
                totalMinutes += Math.round((co.getTime() - ci.getTime()) / 60000) - breakMin;
              }
            }

            const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
              const [da, db] = [a.split('.').reverse().join(''), b.split('.').reverse().join('')];
              return db.localeCompare(da);
            });

            return (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-sm font-medium text-slate-700">Gesamt</span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatDuration(totalMinutes)}</span>
                </div>
                {sortedGroups.map(([dateKey, items]) => {
                  const isOpen = !collapsed[dateKey];
                  const dayTotal = items.reduce((s, e: any) => {
                    const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                    const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                    if (!co) return s;
                    const breakMin = Math.round((e.totalBreakMs ?? (e.totalBreakMinutes || 0) * 60000) / 60000);
                    return s + Math.round((co.getTime() - ci.getTime()) / 60000) - breakMin;
                  }, 0);

                  return (
                    <div key={dateKey}>
                      <button onClick={() => setCollapsed(prev => ({ ...prev, [dateKey]: isOpen }))}
                        className="flex items-center gap-2 w-full text-left py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                        <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        {getDayLabel(items[0].clockIn?.toDate ? items[0].clockIn.toDate() : new Date(items[0].clockIn))}
                        <span className="text-slate-400">({items.length})</span>
                        <span className="ml-auto text-xs font-semibold text-slate-700 tabular-nums">{formatDuration(dayTotal)}</span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 mt-1">
                          {items.map((e: any) => {
                            const ci = e.clockIn?.toDate ? e.clockIn.toDate() : new Date(e.clockIn);
                            const co = e.clockOut?.toDate ? e.clockOut.toDate() : e.clockOut ? new Date(e.clockOut) : null;
                            const breakMins = Math.round((e.totalBreakMs ?? (e.totalBreakMinutes || 0) * 60000) / 60000);
                            const isActive = !co;
                            const mins = isActive ? 0 : Math.round((co.getTime() - ci.getTime()) / 60000) - breakMins;
                            const info = userMap[e.userId] || userMap[(e.userEmail || '').toLowerCase()] || {};
                            const name = info.name || e.userName || (e.userEmail || '').split('@')[0] || 'Unbekannt';
                            const displayName = info.beruf ? `${name} (${info.beruf})` : name;
                            const timeStr = ci.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const timeOutStr = co ? co.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;

                            return (
                              <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-medium shrink-0">
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate">{displayName}</p>
                                    <p className="text-xs text-slate-500">
                                      {timeStr} – {timeOutStr || 'aktiv'}
                                      {breakMins > 0 && ` (${breakMins} min Pause)`}
                                    </p>
                                  </div>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums shrink-0 ml-3 ${isActive ? 'text-teal-600' : 'text-slate-900'}`}>
                                  {isActive ? <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> : formatDuration(mins)}
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
        <div key={r.id} className={`text-xs px-2 py-0.5 rounded ${replyHighlights.has(r.id) ? 'bg-amber-50' : ''}`}>
          <span className="font-medium text-slate-700">{r.userName}: </span>
          <span className="text-slate-600">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
