'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '@/app/Provider';
import { collection, query, where, orderBy, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, doc, serverTimestamp, onSnapshot, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { adminCreateUser, adminDeleteUser } from '@/lib/admin';
import ProjectPhoto from '@/components/ProjectPhoto';
import PhotoViewer from '@/components/PhotoViewer';
import { Plus, Link, Users, CheckCircle, Mail, Lock, FileText, Camera, Pin, User, Clock, Loader2 } from 'lucide-react';

type ViewMode = 'choose' | 'pick' | 'create' | 'assign' | 'share' | 'success';
type MainTab = 'credentials' | 'messenger';
type MessengerTab = 'notes' | 'photos' | 'hours';

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

export default function TeamModal({ assignment, onClose }: { assignment: any; onClose: () => void }) {
  const { user, company, companyId, employees, refresh, projectReads, photoReads, clockReads, markProjectRead, markPhotoRead, markClockRead } = useData();
  const assignmentId = assignment?.id;
  const companyDisplayName = company?.companyName || company?.name || user?.email || 'Unbekannt';

  const [mainTab, setMainTab] = useState<MainTab>('credentials');
  const [viewMode, setViewMode] = useState<ViewMode>('choose');
  const [loading, setLoading] = useState(false);

  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [credentialEmail, setCredentialEmail] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [createdEmployee, setCreatedEmployee] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [existingEmployees, setExistingEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [messengerTab, setMessengerTab] = useState<MessengerTab>('notes');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [photoUrl, setPhotoUrl] = useState('');
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [clockEntries, setClockEntries] = useState<any[]>([]);
  const frozenReads = useRef<{ notes: any; photos: any; clocks: any }>({ notes: null, photos: null, clocks: null });

  function generateEmail(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.\-_]/g, '');
  }

  function validatePassword(pwd: string): string | null {
    if (!pwd || pwd.length < 6) return 'Passwort muss mindestens 6 Zeichen haben';
    if (!/[A-Z]/.test(pwd)) return 'Passwort muss mindestens einen Großbuchstaben enthalten';
    if (!/[0-9]/.test(pwd)) return 'Passwort muss mindestens eine Zahl enthalten';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Passwort muss mindestens ein Sonderzeichen enthalten';
    return null;
  }

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const colors = ['#0d9488','#0891b2','#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a'];
  function colorFor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  useEffect(() => {
    if (!assignmentId) return;
    frozenReads.current = {
      notes: projectReads?.[assignmentId] || null,
      photos: photoReads?.[assignmentId] || null,
      clocks: clockReads?.[assignmentId] || null,
    };
    const uid = user?.uid;

    const unsubNotes = onSnapshot(
      query(collection(db, 'project_notes'), where('assignmentId', '==', assignmentId), orderBy('createdAt', 'desc')),
      snap => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          const t = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;
          let isNew = false;
          if (t && frozenReads.current.notes && data.userId !== uid) {
            const r = frozenReads.current.notes.toDate ? frozenReads.current.notes.toDate() : new Date(frozenReads.current.notes);
            isNew = t.getTime() > r.getTime();
          }
          return { id: d.id, ...data, _isNew: isNew };
        });
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
          if (t && frozenReads.current.photos && data.userId !== uid) {
            const r = frozenReads.current.photos.toDate ? frozenReads.current.photos.toDate() : new Date(frozenReads.current.photos);
            isNew = t.getTime() > r.getTime();
          }
          return { id: d.id, ...data, _isNew: isNew };
        });
        setPhotos(docs);
      }
    );
    const unsubClock = onSnapshot(
      query(collection(db, 'clock_entries'), where('assignmentId', '==', assignmentId), orderBy('clockIn', 'desc')),
      snap => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          const t = data.clockIn?.toDate ? data.clockIn.toDate() : data.clockIn ? new Date(data.clockIn) : null;
          let isNew = false;
          if (t && frozenReads.current.clocks && data.userId !== uid) {
            const r = frozenReads.current.clocks.toDate ? frozenReads.current.clocks.toDate() : new Date(frozenReads.current.clocks);
            isNew = t.getTime() > r.getTime();
          }
          return { id: d.id, ...data, _isNew: isNew };
        });
        setClockEntries(docs);
      }
    );
    return () => { unsubNotes(); unsubPhotos(); unsubClock(); };
  }, [assignmentId, projectReads, photoReads, clockReads, user?.uid]);

  useEffect(() => {
    if (!assignmentId) return;
    if (messengerTab === 'notes') markProjectRead(assignmentId).catch(() => {});
    else if (messengerTab === 'photos') markPhotoRead(assignmentId).catch(() => {});
    else if (messengerTab === 'hours') markClockRead(assignmentId).catch(() => {});
  }, [messengerTab, assignmentId, markProjectRead, markPhotoRead, markClockRead]);

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  async function handleCreateInviteCode() {
    if (!assignmentId || !user) return;
    setLoading(true);
    try {
      let code: string;
      let unique = false;
      while (!unique) {
        code = generateCode();
        const existing = await getDoc(doc(db, 'project_invites', code));
        if (!existing.exists()) unique = true;
      }
      await setDoc(doc(db, 'project_invites', code!), {
        assignmentId,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      setInviteCode(code!);
      setViewMode('share');
    } catch (e) {
      alert('Fehler: Code konnte nicht generiert werden');
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteCode() {
    if (inviteCode) {
      await navigator.clipboard.writeText(inviteCode);
      alert('Einladungscode kopiert!');
    }
  }

  async function handleCreateEmployee() {
    if (!selectedEmp) { alert('Bitte wähle einen Mitarbeiter aus'); return; }
    if (!user) { alert('Du musst angemeldet sein, um Zugänge zu erstellen.'); return; }
    const fullEmail = credentialEmail.trim() + '@earntrack.de';
    if (!credentialEmail.trim()) { alert('Bitte gib den lokalen Teil der E-Mail ein'); return; }
    const pwdErr = validatePassword(employeePassword);
    if (pwdErr) { alert(pwdErr); return; }

    setLoading(true);
    try {
      const { uid: employeeUid } = await adminCreateUser(user, fullEmail, employeePassword, selectedEmp.name || fullEmail, {
        companyId, role: 'employee',
        linkedToProjects: assignmentId ? [assignmentId] : [],
      });

      try {
        if (assignmentId) {
          await setDoc(doc(db, 'project_members', assignmentId), {
            [employeeUid]: {
              uid: employeeUid,
              displayName: selectedEmp.name,
              email: fullEmail,
              role: 'employee',
              joinedAt: serverTimestamp(),
            }
          }, { merge: true });
        }

        await updateDoc(doc(db, 'employees', selectedEmp.id), {
          hasCredentials: true,
          needsSetup: true,
          authUid: employeeUid,
          email: fullEmail,
        });

        try {
          await addDoc(collection(db, 'notifications'), {
            userId: employeeUid,
            type: 'project_assigned',
            title: 'Neues Projekt',
            body: `Du wurdest zu "${assignment?.projekt || 'Einem Projekt'}"${assignment?.kunde ? ` (${assignment?.kunde})` : ''} hinzugefügt.`,
            assignmentId,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (eNotif) { console.error('notification error:', eNotif); }

        setCreatedEmployee({ email: fullEmail, password: employeePassword, name: selectedEmp.name });
        setViewMode('success');
        refresh();
      } catch (firestoreError) {
        try { await adminDeleteUser(user!, employeeUid); } catch (eCleanup) { console.error('cleanup delete user error:', eCleanup); }
        throw firestoreError;
      }
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('EMAIL_EXISTS') || msg.includes('email address is already in use')) {
        alert('Diese E-Mail wird bereits verwendet. Ändere den Namen oder den lokalen Teil der E-Mail.');
      } else if (msg.includes('401') || msg.includes('Unauthorized')) {
        alert('Zugriff verweigert. Stelle sicher, dass du als Unternehmen angemeldet bist und dein Benutzerkonto die Rolle "owner" hat.');
      } else {
        alert('Fehler: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  }
  const openAssignMode = useCallback(async () => {
    if (!assignmentId || !companyId || !user) return;
    setViewMode('assign');
    setLoadingEmployees(true);
    try {
      const memberSnap = await getDoc(doc(db, 'project_members', assignmentId));
      const memberUids = memberSnap.exists() ? Object.keys(memberSnap.data()) : [];

      const empSnap = await getDocs(query(collection(db, 'employees'), where('companyId', '==', companyId), where('hasCredentials', '==', true)));
      const employeeByEmail = new Map<string, any>();
      empSnap.forEach(d => { const d2 = d.data(); if (d2.email) employeeByEmail.set(d2.email.toLowerCase(), { uid: d.id, ...d2 }); });

      const userSnap = await getDocs(query(collection(db, 'users'), where('companyId', '==', companyId), where('role', '==', 'employee')));
      const available: any[] = [];
      userSnap.forEach(d => {
        const ud = d.data();
        const email = (ud.email || '').toLowerCase();
        if (!email) return;
        const emp = employeeByEmail.get(email);
        if (!emp?.hasCredentials) return;
        if (memberUids.includes(d.id)) return;
        available.push({ uid: d.id, email: ud.email, displayName: ud.displayName || ud.email, source: 'auth' });
      });
      setExistingEmployees(available);
    } catch (e) {

    } finally {
      setLoadingEmployees(false);
    }
  }, [assignmentId, companyId, user]);

  async function handleAssignEmployee(emp: any) {
    if (!assignmentId || !companyId || !user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', emp.uid), {
        linkedToProjects: arrayUnion(assignmentId),
      });
      await setDoc(doc(db, 'project_members', assignmentId), {
        [emp.uid]: {
          uid: emp.uid,
          displayName: emp.displayName,
          email: emp.email,
          role: 'employee',
          joinedAt: serverTimestamp(),
        }
      }, { merge: true });
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: emp.uid,
          type: 'project_assigned',
          title: 'Neues Projekt',
          body: `Du wurdest zu "${assignment.projekt || 'Einem Projekt'}"${assignment.kunde ? ` (${assignment.kunde})` : ''} hinzugefügt.`,
          assignmentId,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch {}
      setExistingEmployees((prev: any[]) => prev.filter((e: any) => e.uid !== emp.uid));
      alert(`${emp.displayName} wurde dem Projekt zugeordnet`);
    } catch (e) {
      alert('Zuordnung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    if (!user || !assignmentId || (!newNote.trim() && !photoFile)) return;
    try {
      let photoUri = '';
      let storagePath = '';
      if (photoFile) {
        const cleanName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `project_photos/${user.uid}/${Date.now()}_${cleanName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, photoFile);
        photoUri = `gs://${storageRef.bucket}/${storageRef.fullPath}`;
        storagePath = path;
      }
      const noteText = newNote.trim() || '(Foto)';
      let photoUrl = '';
      if (storagePath) {
        try { photoUrl = await getDownloadURL(ref(storage, storagePath)); } catch {}
      }
      const noteRef = await addDoc(collection(db, 'project_notes'), {
        assignmentId, userId: user.uid, userName: companyDisplayName,
        note: noteText, createdAt: serverTimestamp(), isPinned: true,
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
            body: `${companyDisplayName}: ${noteText.substring(0, 100)}`,
            assignmentId,
            noteId: noteRef.id,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
      // Push-Benachrichtigung wird automatisch via Firebase Function onNoteCreated gesendet
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
  }

  async function deleteNote(noteId: string) {
    await deleteDoc(doc(db, 'project_notes', noteId));
  }

  async function addReply(noteId: string) {
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
    // Push-Benachrichtigung wird automatisch via Firebase Function onNoteReply gesendet
  }

  async function deletePhoto(photoId: string) {
    await deleteDoc(doc(db, 'project_photos', photoId));
  }

  function resetToChoose() {
    setViewMode('choose');
    setSelectedEmp(null);
    setCredentialEmail('');
    setEmployeePassword('');
    setCreatedEmployee(null);
    setInviteCode('');
  }

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[3vh] pb-8 bg-black/30 overflow-y-auto ">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl mx-4 ">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Team: {assignment?.projekt || 'Unbenannt'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 pb-2 border-b border-slate-100">
          <button onClick={() => setMainTab('credentials')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
              mainTab === 'credentials' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            Zugangsdaten
          </button>
          <button onClick={() => setMainTab('messenger')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
              mainTab === 'messenger' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            Messenger
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* ========== CREDENTIALS TAB ========== */}
          {mainTab === 'credentials' && (
            <>
              {viewMode === 'choose' && (
                <div className="space-y-4">
                  <button onClick={() => setViewMode('pick')}
                    className="w-full flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Plus className="w-6 h-6 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">Neuen Zugang erstellen</p>
                      <p className="text-xs text-slate-400 mt-0.5">Mitarbeiter auswählen und Zugangsdaten anlegen</p>
                    </div>
                    <svg className="w-5 h-5 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>

                  {assignmentId && (
                    <>
                      <button onClick={openAssignMode}
                        className="w-full flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                          <Link className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">Mitarbeiter mit Zugang zuweisen</p>
                          <p className="text-xs text-slate-400 mt-0.5">Bestehenden Login zu diesem Projekt hinzufügen</p>
                        </div>
                        <svg className="w-5 h-5 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>

                      <button onClick={handleCreateInviteCode} disabled={loading}
                        className="w-full flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 hover:shadow-md active:scale-[0.98] transition-all text-left disabled:opacity-50">
                        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                          <Link className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">Einladungscode erstellen</p>
                          <p className="text-xs text-slate-400 mt-0.5">Mitarbeiter können sich selbst mit einem Code verbinden</p>
                        </div>
                        {loading ? (
                          <span className="w-5 h-5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin shrink-0" />
                        ) : (
                          <svg className="w-5 h-5 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}

              {viewMode === 'pick' && (
                <div className="space-y-4">
                  <button onClick={() => { setViewMode('choose'); setSelectedEmp(null); }} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
                  <p className="text-sm font-bold text-slate-700">Mitarbeiter auswählen</p>
                  {(() => {
                    const available = employees.filter((e: any) => e.email?.includes('@') && !e.hasCredentials);
                    if (available.length === 0) {
                      return (
                        <div className="text-center py-6">
                          <Users className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                          <p className="text-sm text-slate-500">Keine Mitarbeiter verfügbar.</p>
                          <p className="text-xs text-slate-400 mt-2">Lege zuerst Mitarbeiter mit E-Mail-Adresse an.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        {available.map((emp: any) => (
                          <button key={emp.id}
                            onClick={() => { setSelectedEmp(emp); setEmployeePassword(''); setCredentialEmail(generateEmail(emp.name)); setViewMode('create'); }}
                            className="group flex flex-col items-center gap-2 p-5 rounded-xl border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 hover:shadow-md active:scale-[0.97] transition-all">
                            {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                              <img src={emp.imageUrl} alt="" className="w-14 h-14 rounded-full object-cover shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all" />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-xl font-bold shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all">
                                {(emp.name || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <p className="text-sm font-bold text-slate-800 text-center leading-tight">{emp.name}</p>
                            {emp.stundenlohn > 0 && (
                              <p className="text-[11px] text-slate-400 font-medium">{parseFloat(emp.stundenlohn).toFixed(2)}€/h</p>
                            )}
                            <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full group-hover:bg-teal-100 transition-all">Zugangsdaten erstellen</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {viewMode === 'create' && selectedEmp && (
                <div className="space-y-4 max-w-md">
                  <button onClick={() => setViewMode('pick')} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
                  <p className="text-sm font-bold text-slate-700">Zugangsdaten für {selectedEmp.name}</p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">E-Mail (für Login)</label>
                    <div className="flex items-center gap-0">
                      <input value={credentialEmail} onChange={e => setCredentialEmail(generateEmail(e.target.value))} placeholder="vorname.nachname"
                        className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-r-0 border-slate-200 rounded-l-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all font-mono" />
                      <span className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-r-lg text-sm text-slate-500 font-mono select-none">@earntrack.de</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Passwort</label>
                    <input value={employeePassword} onChange={e => setEmployeePassword(e.target.value)} placeholder="Mind. 6 Zeichen"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <button onClick={handleCreateEmployee} disabled={loading || !!validatePassword(employeePassword)}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-lg transition-all text-sm shadow-md flex items-center justify-center gap-2">
                    {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Zugang erstellen
                  </button>
                </div>
              )}

              {viewMode === 'assign' && (
                <div className="space-y-4">
                  <button onClick={() => setViewMode('choose')} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
                  <p className="text-sm font-bold text-slate-700">Mitarbeiter mit Zugang zuweisen</p>
                  {loadingEmployees ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                      <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
                      Lade Mitarbeiter...
                    </div>
                  ) : existingEmployees.length === 0 ? (
                    <div className="text-center py-6">
                      <Users className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                      <p className="text-sm text-slate-500">Keine weiteren Mitarbeiter mit Zugang verfügbar.</p>
                      <p className="text-xs text-slate-400 mt-2">Erstelle zuerst Zugangsdaten.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {existingEmployees.map((emp: any) => (
                        <button key={emp.uid}
                          onClick={() => handleAssignEmployee(emp)} disabled={loading}
                          className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md active:scale-[0.98] transition-all text-left disabled:opacity-50">
                          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-teal-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">{emp.displayName}</p>
                            <p className="text-xs text-slate-400">{emp.email}</p>
                          </div>
                          <span className="text-lg text-teal-600 font-bold shrink-0">+</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'share' && (
                <div className="space-y-5 max-w-md">
                  <button onClick={() => setViewMode('choose')} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
                  {inviteCode ? (
                    <>
                      <div className="text-center p-6 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200">
                        <p className="text-xs text-purple-600 font-semibold mb-2">Einladungscode für dieses Projekt</p>
                        <p className="text-4xl font-black text-purple-700 tracking-[0.3em]">{inviteCode}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={copyInviteCode}
                          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-md">
                          In Zwischenablage kopieren
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                      <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
                      Generiere Einladungscode...
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'success' && createdEmployee && (
                <div className="text-center space-y-5 max-w-md">
                  <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
                  <p className="text-sm font-bold text-slate-700">Zugangsdaten erstellt!</p>
                  <p className="text-sm text-slate-500">Teile die Zugangsdaten mit {createdEmployee.name}</p>
                  <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">E-Mail:</span>
                      <span className="text-sm font-bold text-slate-800">{createdEmployee.email}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Passwort:</span>
                      <span className="text-sm font-bold text-slate-800">{createdEmployee.password}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button onClick={async () => {
                      const msg = `Dein Zugang für "${assignment?.projekt || 'EarnTrack'}":\n\nE-Mail: ${createdEmployee.email}\nPasswort: ${createdEmployee.password}\n\nLade die App herunter und melde dich an:\nhttps://apps.apple.com/de/app/earntrack-business-manager/id6766016338`;
                      await navigator.clipboard.writeText(msg); alert('Zugangsdaten wurden kopiert!');
                    }}
                      className="w-full py-3 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-md">
                      Zugangsdaten kopieren
                    </button>
                    <button onClick={() => { setViewMode('choose'); setCreatedEmployee(null); setSelectedEmp(null); setCredentialEmail(''); setEmployeePassword(''); }}
                      className="w-full py-3 bg-teal-50 hover:bg-teal-100 active:scale-[0.97] text-teal-700 font-bold rounded-xl transition-all text-sm">
                      Weiteren Mitarbeiter hinzufügen
                    </button>
                  </div>
                </div>
              )}

            </>
          )}

          {/* ========== MESSENGER TAB ========== */}
          {mainTab === 'messenger' && (() => {
            const unNotes = notes.filter(n => n._isNew).length;
            const unPhotos = photos.filter(p => p._isNew).length;
            const unClocks = clockEntries.filter(c => c._isNew).length;
            return (
            <>
              {/* Sub-tabs */}
              <div className="flex gap-1 mb-4">
                <button onClick={() => setMessengerTab('notes')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    messengerTab === 'notes' ? 'bg-teal-100 text-teal-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}>
                  <FileText className="inline w-4 h-4 mr-1" /> Notizen{unNotes > 0 && <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unNotes}</span>}
                </button>
                <button onClick={() => setMessengerTab('photos')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    messengerTab === 'photos' ? 'bg-teal-100 text-teal-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}>
                  <Camera className="inline w-4 h-4 mr-1" /> Fotos{unPhotos > 0 && <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unPhotos}</span>}
                </button>
                <button onClick={() => setMessengerTab('hours')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    messengerTab === 'hours' ? 'bg-teal-100 text-teal-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}>
                  <Clock className="inline w-4 h-4 mr-1" /> Arbeitszeiten{unClocks > 0 && <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unClocks}</span>}
                </button>
              </div>

              {/* Banner bei ungelesenen Inhalten */}
              {(() => {
                const total = unNotes + unPhotos + unClocks;
                if (total === 0) return null;
                return (
                  <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex items-center gap-2 text-sm flex-wrap">
                    <Mail className="w-4 h-4 text-amber-700" /><span className="font-semibold text-amber-700"> {total} ungelesen{total !== 1 ? 'e' : ''} {total === 1 ? 'Aktivität' : 'Aktivitäten'}</span>
                    {unNotes > 0 && <button onClick={() => setMessengerTab('notes')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline px-1">{unNotes} Notiz{unNotes !== 1 ? 'en' : ''}</button>}
                    {unPhotos > 0 && <button onClick={() => setMessengerTab('photos')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline px-1">{unPhotos} Foto{unPhotos !== 1 ? 's' : ''}</button>}
                    {unClocks > 0 && <button onClick={() => setMessengerTab('hours')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline px-1">{unClocks} Arbeitszeit{unClocks !== 1 ? 'en' : ''}</button>}
                  </div>
                );
              })()}

              {messengerTab === 'notes' && (
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
                    <div className="relative inline-block -mt-2">
                      <img src={photoPreview} alt="" className="h-20 rounded-lg object-cover border border-slate-200 shadow-sm" />
                      <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center hover:bg-red-600 shadow-md transition-all active:scale-[0.9]">✕</button>
                    </div>
                  )}
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
                                {n._isNew && <span className="text-[10px] font-extrabold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">NEU</span>}
                                {n.isPinned && <span className="text-xs text-amber-600 font-bold"><Pin className="inline w-3 h-3 mr-1 text-amber-600" /> Angepinnt</span>}
                              </div>
                              <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</p>
                              {n.photoUri && (
                                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-white">
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
                      ))
                    )}
                  </div>
                </div>
              )}

              {messengerTab === 'photos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.length === 0 ? (
                      <div className="col-span-full text-center py-8">
                        <Camera className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="text-sm text-slate-400">Keine Fotos vorhanden</p>
                      </div>
                    ) : (
                      photos.map((p: any) => (
                        <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => setSelectedPhoto(p)}>
                          <div className="w-full h-28 bg-slate-100 flex items-center justify-center overflow-hidden">
                            <ProjectPhoto photo={p} className="w-full h-full object-cover" />
                          </div>
                          {p._isNew && (
                            <span className="absolute top-2 left-2 text-[10px] font-extrabold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full shadow-sm z-10">NEU</span>
                          )}
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

              {messengerTab === 'hours' && (
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
                                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                            style={{ backgroundColor: colorFor(name) }}>
                                            {name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                              <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                                              {e._isNew && <span className="text-[10px] font-extrabold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">NEU</span>}
                                            </div>
                                            <p className="text-xs text-slate-400">
                                              {timeStr} – {timeOutStr || 'aktiv'}
                                              {breakMins > 0 && ` (${breakMins}min Pause)`}
                                            </p>
                                          </div>
                                        </div>
                                        <span className={`text-sm font-bold shrink-0 ml-3 ${isActive ? 'text-green-600' : 'text-slate-900'}`}>
                                          {isActive ? <Loader2 className="w-4 h-4 animate-spin text-green-600" /> : formatDuration(mins)}
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
            </>
          );
        })()}
        </div>

        {selectedPhoto && (
          <PhotoViewer photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
        )}
      </div>
    </div>
  );
}

function NoteRepliesInline({ noteId, user }: { noteId: string; user: any }) {
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
          <span className="text-[10px] text-slate-400 shrink-0 ml-auto">
            {r.createdAt?.toDate ? fmtTime(r.createdAt.toDate()) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
