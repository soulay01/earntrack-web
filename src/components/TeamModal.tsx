'use client';

import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/app/Provider';
import { collection, query, where, orderBy, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, doc, serverTimestamp, onSnapshot, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

type ViewMode = 'choose' | 'create' | 'assign' | 'share' | 'success' | 'pick';
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
  const { user, companyId, refresh } = useData();
  const assignmentId = assignment?.id;

  const [mainTab, setMainTab] = useState<MainTab>('credentials');
  const [viewMode, setViewMode] = useState<ViewMode>('choose');
  const [loading, setLoading] = useState(false);

  const [employeeName, setEmployeeName] = useState('');
  const [employeeUsername, setEmployeeUsername] = useState('');
  const [suggestedUsername, setSuggestedUsername] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [employeeStundenlohn, setEmployeeStundenlohn] = useState('');
  const [createdEmployee, setCreatedEmployee] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [existingEmployees, setExistingEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [existingEmpDocId, setExistingEmpDocId] = useState<string | null>(null);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loadingAllEmployees, setLoadingAllEmployees] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickRate, setQuickRate] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [messengerTab, setMessengerTab] = useState<MessengerTab>('notes');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [clockEntries, setClockEntries] = useState<any[]>([]);

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

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

  useEffect(() => {
    if (!employeeName.trim()) { setSuggestedUsername(''); return; }
    const suggestion = employeeName.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-zäöüß.\-]/g, '');
    setSuggestedUsername(suggestion);
  }, [employeeName]);

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

  const loadAllEmployees = useCallback(async () => {
    if (!companyId) return;
    setLoadingAllEmployees(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'employees'),
        where('companyId', '==', companyId)
      ));
      const emps = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((e: any) => !e._storedPassword);
      setAllEmployees(emps);
      setViewMode('pick');
    } catch (e) {
      console.error('Load all employees error:', e);
    } finally {
      setLoadingAllEmployees(false);
    }
  }, [companyId]);

  async function handleQuickAddEmployee() {
    if (!quickName.trim() || !companyId || !user) return;
    setQuickSaving(true);
    try {
      const data = {
        name: quickName.trim(),
        stundenlohn: parseFloat(quickRate) || 0,
        companyId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'employees'), data);
      const newEmp = { id: ref.id, ...data };
      setAllEmployees(prev => [...prev, newEmp]);
      setQuickName('');
      setQuickRate('');
      setShowQuickAdd(false);
    } finally {
      setQuickSaving(false);
    }
  }

  async function handleCreateEmployee() {
    if (!employeeName.trim()) { alert('Bitte gib einen Namen ein'); return; }
    if (!employeeUsername.trim()) { alert('Bitte gib einen Benutzernamen ein'); return; }
    if (employeeUsername.includes('@')) { alert('Bitte nur den Benutzernamen eingeben (ohne @)'); return; }

    if (!existingEmpDocId) {
      try {
        const existingSnap = await getDocs(query(
          collection(db, 'employees'),
          where('companyId', '==', companyId),
          where('name', '==', employeeName.trim())
        ));
        if (!existingSnap.empty) {
          alert('Ein Mitarbeiter mit diesem Namen existiert bereits. Verwende "Zugangsdaten für bestehende Mitarbeiter".');
          return;
        }
      } catch (e) {}
    }

    const pwd = employeePassword;
    if (pwd.length < 8) { alert('Passwort muss mindestens 8 Zeichen haben'); return; }
    if (!/[A-Z]/.test(pwd)) { alert('Passwort muss einen Großbuchstaben enthalten'); return; }
    if (!/[0-9]/.test(pwd)) { alert('Passwort muss eine Zahl enthalten'); return; }
    if (!/[!@#$%^&*]/.test(pwd)) { alert('Passwort muss ein Sonderzeichen enthalten'); return; }

    const stundenlohnNum = Math.max(0, parseFloat((employeeStundenlohn || '0').replace(',', '.')) || 0);
    const fullEmail = employeeUsername.trim().toLowerCase() + '@earntrack.de';

    setLoading(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fullEmail, password: employeePassword, returnSecureToken: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error?.message === 'EMAIL_EXISTS') { alert('Dieser Benutzername ist bereits vergeben'); }
        else { alert(data.error?.message || 'Fehler bei der Erstellung'); }
        setLoading(false);
        return;
      }

      const employeeUid = data.localId;
      const idToken = data.idToken;

      try {
        await setDoc(doc(db, 'users', employeeUid), {
          email: fullEmail,
          displayName: employeeName.trim(),
          role: 'employee',
          linkedToProject: assignmentId || null,
          linkedToProjects: assignmentId ? [assignmentId] : [],
          linkedBy: user!.uid,
          companyId: user!.uid,
          createdAt: serverTimestamp(),
          emailVerified: true,
        });

        if (assignmentId) {
          await setDoc(doc(db, 'project_members', assignmentId), {
            [employeeUid]: {
              uid: employeeUid,
              displayName: employeeName.trim(),
              email: fullEmail,
              role: 'employee',
              joinedAt: serverTimestamp(),
            }
          }, { merge: true });
        }

        if (existingEmpDocId) {
          await updateDoc(doc(db, 'employees', existingEmpDocId), {
            email: fullEmail,
            _storedPassword: employeePassword,
            needsSetup: true,
          });
          setExistingEmpDocId(null);
        } else {
          await addDoc(collection(db, 'employees'), {
            companyId: user!.uid,
            name: employeeName.trim(),
            stundenlohn: stundenlohnNum,
            gesamtstunden: 0,
            notizen: '',
            imageUrl: '',
            email: fullEmail,
            needsSetup: true,
            createdAt: serverTimestamp(),
            _storedPassword: employeePassword,
          });
        }

        setCreatedEmployee({ email: fullEmail, password: employeePassword, name: employeeName.trim() });
        setViewMode('success');
        refresh();
      } catch (firestoreError) {
        if (idToken) {
          try {
            await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
            });
          } catch (deleteErr) {}
        }
        throw firestoreError;
      }
    } catch (error) {
      alert('Mitarbeiter konnte nicht erstellt werden');
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

      const memberEmailSet = new Set<string>();
      if (memberUids.length > 0) {
        const memberUserDocs = await Promise.allSettled(
          memberUids.map(uid => getDoc(doc(db, 'users', uid)))
        );
        memberUserDocs.forEach(r => {
          if (r.status === 'fulfilled' && r.value.exists()) {
            const email = (r.value.data().email || '').toLowerCase();
            if (email) memberEmailSet.add(email);
          }
        });
      }

      const employeesSnap = await getDocs(query(
        collection(db, 'employees'),
        where('companyId', '==', companyId)
      ));
      const validEmployeeEmails = new Set<string>();
      const manualEmployees: any[] = [];
      for (const empDoc of employeesSnap.docs) {
        const empData = empDoc.data();
        const empEmail = (empData.email || '').toLowerCase();
        if (empEmail) validEmployeeEmails.add(empEmail);
        if (memberEmailSet.has(empEmail)) continue;
        manualEmployees.push({
          uid: empDoc.id,
          email: empData.email || '',
          displayName: empData.name || empData.email || 'Unbekannt',
          stundenlohn: empData.stundenlohn || 0,
          source: 'manual',
          needsCredentials: !empData.email || !empData._storedPassword,
        });
      }

      const usersQuery = query(
        collection(db, 'users'),
        where('companyId', '==', companyId),
        where('role', '==', 'employee')
      );
      const usersSnap = await getDocs(usersQuery);
      const available: any[] = [];
      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        const email = (userData.email || '').toLowerCase();
        if (!validEmployeeEmails.has(email)) continue;
        if (memberUids.includes(uid)) continue;
        available.push({
          uid,
          email: userData.email || '',
          displayName: userData.displayName || userData.email || 'Unbekannt',
          source: 'auth',
        });
      }
      for (const manual of manualEmployees) {
        const empEmail = manual.email.toLowerCase();
        if (empEmail && available.some((a: any) => a.email.toLowerCase() === empEmail)) continue;
        available.push(manual);
      }
      setExistingEmployees(available);
    } catch (e) {
      console.error('Load employees error:', e);
    } finally {
      setLoadingEmployees(false);
    }
  }, [assignmentId, companyId, user]);

  async function handleAssignEmployee(emp: any) {
    if (!assignmentId || !companyId || !user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', emp.uid), {
        linkedToProject: assignmentId,
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
      setExistingEmployees((prev: any[]) => prev.filter((e: any) => e.uid !== emp.uid));
      alert(`${emp.displayName} wurde dem Projekt zugeordnet`);
    } catch (e) {
      alert('Zuordnung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    if (!user || !assignmentId || !newNote.trim()) return;
    await addDoc(collection(db, 'project_notes'), {
      assignmentId, userId: user.uid, userName: user.email || 'Unbekannt',
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

  async function addPhoto(file: File) {
    if (!user || !assignmentId || !file) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `project_photos/${assignmentId}/${user.uid}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      const snap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snap.ref);
      await addDoc(collection(db, 'project_photos'), {
        assignmentId, userId: user.uid, userName: user.email || 'Unbekannt',
        photoUri: downloadUrl, createdAt: serverTimestamp(), isPinned: false,
      });
    } catch (e) {
      console.error('Upload photo error:', e);
      alert('Fehler beim Hochladen des Fotos');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deletePhoto(photoId: string) {
    await deleteDoc(doc(db, 'project_photos', photoId));
  }

  function resetToChoose() {
    setViewMode('choose');
    setEmployeeName('');
    setEmployeeUsername('');
    setSuggestedUsername('');
    setEmployeePassword('');
    setEmployeeStundenlohn('');
    setCreatedEmployee(null);
    setInviteCode('');
    setExistingEmpDocId(null);
    setAllEmployees([]);
    setShowQuickAdd(false);
    setQuickName('');
    setQuickRate('');
  }

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[3vh] pb-8 bg-black/30 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl mx-4 animate-slideUp">
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
                  <p className="text-sm font-semibold text-slate-500 text-center mb-4">Mitarbeiter einladen & verwalten</p>

                  <button onClick={loadAllEmployees} disabled={loadingAllEmployees}
                    className="w-full flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md active:scale-[0.98] transition-all text-left disabled:opacity-50">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <span className="text-2xl">👥</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">Zugangsdaten erstellen</p>
                      <p className="text-xs text-slate-400 mt-0.5">Mitarbeiter auswählen und @earntrack.de Account erstellen</p>
                    </div>
                    {loadingAllEmployees ? (
                      <span className="w-5 h-5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin shrink-0" />
                    ) : (
                      <svg className="w-5 h-5 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    )}
                  </button>

                  {assignmentId && (
                    <>
                      <button onClick={openAssignMode}
                        className="w-full flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md active:scale-[0.98] transition-all text-left">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                          <span className="text-2xl">📋</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">Vorhandenen Mitarbeiter zuordnen</p>
                          <p className="text-xs text-slate-400 mt-0.5">Bereits erstellten Mitarbeiter auswählen und zuweisen</p>
                        </div>
                        <svg className="w-5 h-5 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>

                      <button onClick={handleCreateInviteCode} disabled={loading}
                        className="w-full flex items-center gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md active:scale-[0.98] transition-all text-left disabled:opacity-50">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <span className="text-2xl">🔗</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">Einladungscode erstellen</p>
                          <p className="text-xs text-slate-400 mt-0.5">Für bestehende Mitarbeiter mit Zugangsdaten</p>
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

              {messengerTab === 'hours' && (
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
            </>
          )}

          {/* ========== MESSENGER TAB ========== */}
          {mainTab === 'messenger' && (
            <>
              {/* Sub-tabs */}
              <div className="flex gap-1 mb-4">
                <button onClick={() => setMessengerTab('notes')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    messengerTab === 'notes' ? 'bg-teal-100 text-teal-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}>
                  📝 Notizen
                </button>
                <button onClick={() => setMessengerTab('photos')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    messengerTab === 'photos' ? 'bg-teal-100 text-teal-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}>
                  📸 Fotos
                </button>
                <button onClick={() => setMessengerTab('hours')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    messengerTab === 'hours' ? 'bg-teal-100 text-teal-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}>
                  ⏱ Arbeitszeiten
                </button>
              </div>

              {messengerTab === 'notes' && (
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
                                {n.isPinned && <span className="text-xs text-amber-600 font-bold">📌 Angepinnt</span>}
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

              {messengerTab === 'photos' && (
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
                            {/* eslint-disable-next-line @next/next/no-img-element */}
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
            </>
          )}
        </div>
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
