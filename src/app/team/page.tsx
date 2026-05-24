'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, query, where, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type ViewMode = 'choose' | 'create' | 'assign' | 'share' | 'success' | 'pick';
type MainTab = 'credentials';
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

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function TeamPage() {
  const { user, loading, assignments, companyId, refresh } = useData();
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aid = params.get('assignmentId');
    if (aid && assignments.find((a: any) => a.id === aid)) {
      setSelectedId(aid);
    }
  }, []);

  if (pageLoading || loading || !user) return null;

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      {/* Project list sidebar */}
      <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Mitarbeiter Zugangsdaten</h2>
          <p className="text-xs text-slate-400 mt-0.5">{assignments.length} Projekte</p>
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

      {/* Team content */}
      <main className="flex-1 overflow-y-auto">
        {assignmentId && assignment ? (
          <TeamContent
            key={assignmentId}
            assignment={assignment}
            assignmentId={assignmentId}
            user={user}
            companyId={companyId}
            refresh={refresh}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <p className="text-slate-500 font-semibold">Wähle ein Projekt aus</p>
              <p className="text-xs text-slate-400 mt-1">um Team-Zugang, Notizen und Arbeitszeiten zu verwalten</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TeamContent({ assignment, assignmentId, user, companyId, refresh }: { assignment: any; assignmentId: string; user: any; companyId: string | null; refresh: () => Promise<void> }) {
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

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'project_invites'), where('assignmentId', '==', assignmentId)));
        if (!snap.empty) setInviteCode(snap.docs[0].data().code || '');
      } catch {}
    })();
  }, [assignmentId]);

  const resetToChoose = useCallback(() => { setViewMode('choose'); setCreatedEmployee(null); setEmployeeName(''); setEmployeeUsername(''); setEmployeePassword(''); setEmployeeStundenlohn(''); }, []);

  // ─── Copy ─────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); alert(`${label} wurde kopiert!`); } catch { alert('Kopieren fehlgeschlagen'); }
  };

  const copyInviteCode = async () => {
    if (!inviteCode || !assignment) return;
    const msg = `Tritt dem Projekt "${assignment.projekt || 'EarnTrack'}" bei!\n\nCode: ${inviteCode}`;
    try { await navigator.clipboard.writeText(msg); alert('Einladung wurde kopiert!'); } catch { alert('Kopieren fehlgeschlagen'); }
  };

  // ─── Invite Code ──────────────────────────────────────────────
  const generateInviteCode = async () => {
    if (!assignmentId || !user) return;
    setInviteCode('');
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await addDoc(collection(db, 'project_invites'), {
        assignmentId, code, createdBy: user.uid, createdAt: serverTimestamp(),
      });
      setInviteCode(code);
    } catch { alert('Fehler beim Generieren'); }
  };

  // ─── Create employee (Firebase Auth) ──────────────────────────
  const handleCreateEmployee = async () => {
    if (!user || !companyId || !assignmentId) return;
    const fullEmail = (employeeUsername.trim() || suggestedUsername) + '@earntrack.app';
    if (!employeeName.trim()) { alert('Bitte Namen eingeben'); return; }
    const pass = employeePassword || Math.random().toString(36).slice(2, 10) + 'A1!';
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fullEmail, password: pass, returnSecureToken: true }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const newUid = data.localId;

      const stundenlohnNum = parseFloat(employeeStundenlohn) || 0;

      await setDoc(doc(db, 'users', newUid), {
        email: fullEmail, displayName: employeeName.trim(), companyId, role: 'employee', createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'project_members', assignmentId), { [newUid]: { displayName: employeeName.trim(), email: fullEmail, role: 'member', stundenlohn: stundenlohnNum, joinedAt: serverTimestamp() } }, { merge: true });

      if (existingEmpDocId) {
        await updateDoc(doc(db, 'employees', existingEmpDocId), {
          email: fullEmail, _storedPassword: pass, needsSetup: true,
        });
        setExistingEmpDocId(null);
      } else {
        await addDoc(collection(db, 'employees'), {
          companyId: user.uid, name: employeeName.trim(), stundenlohn: stundenlohnNum, gesamtstunden: 0, notizen: '', imageUrl: '', email: fullEmail, needsSetup: true, createdAt: serverTimestamp(), _storedPassword: pass,
        });
      }

      setCreatedEmployee({ email: fullEmail, password: pass, name: employeeName.trim() });
      setViewMode('success');
      refresh();
    } catch (error: any) {
      if (error.message === 'EMAIL_EXISTS' || error.message?.includes('EMAIL_EXISTS')) {
        try {
          const idToken = await user.getIdToken();
          await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
        } catch {}
        throw error;
      }
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally { setLoading(false); }
  };

  // ─── Assign existing auth user to project ─────────────────────
  const handleAssignEmployee = async (emp: any) => {
    if (!assignmentId || !user) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'project_members', assignmentId), {
        [emp.uid]: { displayName: emp.displayName, email: emp.email, role: 'member', joinedAt: serverTimestamp() },
      }, { merge: true });
      setViewMode('choose');
      refresh();
    } catch { alert('Fehler beim Hinzufügen'); }
    finally { setLoading(false); }
  };

  // ─── Open assign mode ─────────────────────────────────────────
  const openAssignMode = useCallback(async () => {
    if (!assignmentId || !companyId || !user) return;
    setViewMode('assign');
    setLoadingEmployees(true);
    try {
      const memberSnap = await getDoc(doc(db, 'project_members', assignmentId));
      const memberUids = memberSnap.exists() ? Object.keys(memberSnap.data()) : [];

      const memberEmailSet = new Set<string>();
      if (memberUids.length > 0) {
        const memberUserDocs = await Promise.allSettled(memberUids.map(uid => getDoc(doc(db, 'users', uid))));
        memberUserDocs.forEach(r => {
          if (r.status === 'fulfilled' && r.value.exists()) {
            memberEmailSet.add(r.value.data().email || '');
          }
        });
      }

      const allUserSnap = await getDocs(query(collection(db, 'users'), where('companyId', '==', companyId), where('role', '==', 'employee')));
      const all = allUserSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
      const withoutCredentials = all.filter((e: any) => !e._storedPassword);

      const authAlreadyMembers: any[] = [];
      const authNotMembers: any[] = [];

      all.forEach((e: any) => {
        if (e._storedPassword) {
          if (memberEmailSet.has(e.email || '')) authAlreadyMembers.push(e);
          else authNotMembers.push(e);
        }
      });

      setExistingEmployees([...withoutCredentials, ...authNotMembers, ...authAlreadyMembers]);
    } catch {} finally { setLoadingEmployees(false); }
  }, [assignmentId, companyId, user]);

  useEffect(() => { if (viewMode === 'assign') openAssignMode(); }, [openAssignMode, viewMode]);

  const openPickMode = useCallback(async () => {
    if (!companyId) return;
    setViewMode('pick');
    setLoadingAllEmployees(true);
    try {
      const snap = await getDocs(query(collection(db, 'employees'), where('companyId', '==', companyId)));
      setAllEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {} finally { setLoadingAllEmployees(false); }
  }, [companyId]);

  const handleQuickAddEmployee = async () => {
    if (!companyId || !user || !quickName.trim()) return;
    setQuickSaving(true);
    try {
      await addDoc(collection(db, 'employees'), {
        companyId: companyId, name: quickName.trim(), stundenlohn: parseFloat(quickRate) || 0, gesamtstunden: 0, notizen: '', imageUrl: '', createdAt: serverTimestamp(),
      });
      setShowQuickAdd(false); setQuickName(''); setQuickRate(''); refresh();
    } catch { alert('Fehler beim Speichern'); } finally { setQuickSaving(false); }
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
        <button onClick={() => setMainTab('credentials')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
            mainTab === 'credentials' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}>
          Zugangsdaten
        </button>
      </div>

      {/* ========== CREDENTIALS TAB ========== */}
      {mainTab === 'credentials' && (
        <>
          {viewMode === 'choose' && (
            <div className="space-y-3">
              <button onClick={() => { setViewMode('create'); setEmployeeName(''); setEmployeeUsername(''); setEmployeePassword(''); setEmployeeStundenlohn(''); setExistingEmpDocId(null); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">➕</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Neuen Mitarbeiter anlegen</p>
                  <p className="text-xs text-slate-400">Erstelle Login-Zugang mit E-Mail und Passwort</p>
                </div>
              </button>
              <button onClick={openPickMode}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">👤</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Aus Mitarbeiterliste</p>
                  <p className="text-xs text-slate-400">Zugangsdaten für bestehenden Mitarbeiter erstellen</p>
                </div>
              </button>
              <button onClick={() => { setViewMode('assign'); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">🔗</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Mitarbeiter zuweisen</p>
                  <p className="text-xs text-slate-400">Bestehenden Login zu diesem Projekt hinzufügen</p>
                </div>
              </button>
              <button onClick={() => { setViewMode('share'); generateInviteCode(); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">📨</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Einladungscode teilen</p>
                  <p className="text-xs text-slate-400">Mitarbeiter können sich selbst mit einem Code hinzufügen</p>
                </div>
              </button>
            </div>
          )}

          {viewMode === 'create' && (
            <div className="space-y-4 max-w-md">
              <button onClick={() => setViewMode('choose')} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
              <p className="text-sm font-bold text-slate-700">Neuen Zugang erstellen</p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                <input value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Benutzername (optional)</label>
                <div className="flex items-center gap-1">
                  <input value={employeeUsername || suggestedUsername} onChange={e => setEmployeeUsername(e.target.value)}
                    placeholder="max.mustermann"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  <span className="text-xs text-slate-400 font-mono">@earntrack.app</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Passwort (optional)</label>
                <input value={employeePassword} onChange={e => setEmployeePassword(e.target.value)} placeholder="Automatisch generiert"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Stundenlohn (€)</label>
                <input type="number" step="0.01" min="0" value={employeeStundenlohn} onChange={e => setEmployeeStundenlohn(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <button onClick={handleCreateEmployee} disabled={loading || !employeeName.trim()}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-lg transition-all text-sm shadow-md flex items-center justify-center gap-2">
                {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Zugang erstellen
              </button>
            </div>
          )}

          {viewMode === 'assign' && (
            <div className="space-y-4">
              <button onClick={() => setViewMode('choose')} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
              <p className="text-sm font-bold text-slate-700">Mitarbeiter zuweisen</p>
              {loadingEmployees ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
                  Lade Mitarbeiter...
                </div>
              ) : existingEmployees.length === 0 ? (
                <div className="text-center py-6">
                  <span className="text-4xl block mb-3">👥</span>
                  <p className="text-sm text-slate-500">Keine weiteren Mitarbeiter verfügbar.</p>
                  <p className="text-xs text-slate-400 mt-2">Erstelle zuerst Zugangsdaten für deine Mitarbeiter.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {existingEmployees.map((emp: any) => (
                    emp._storedPassword ? (
                      <button key={'auth_' + emp.uid}
                        onClick={() => handleAssignEmployee(emp)} disabled={loading}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md active:scale-[0.98] transition-all text-left disabled:opacity-50">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                          <span className="text-lg">👤</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">{emp.displayName}</p>
                          <p className="text-xs text-slate-400">{emp.email}</p>
                        </div>
                        <span className="text-lg text-teal-600 font-bold shrink-0">+</span>
                      </button>
                    ) : (
                      <button key={'noauth_' + emp.uid}
                        onClick={() => { setEmployeeName(emp.displayName); setEmployeeStundenlohn(emp.stundenlohn ? String(emp.stundenlohn) : ''); setExistingEmpDocId(emp.uid); setViewMode('create'); }}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-amber-50 hover:shadow-md active:scale-[0.98] transition-all text-left">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                          <span className="text-lg">📝</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">{emp.displayName}</p>
                          <p className="text-xs text-amber-600 font-medium">Zugangsdaten erforderlich</p>
                        </div>
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">Erstellen</span>
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {viewMode === 'pick' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setViewMode('choose')} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
                <p className="text-sm font-bold text-slate-700">Mitarbeiter auswählen</p>
              </div>
              {allEmployees.length === 0 && !showQuickAdd ? (
                <div className="text-center py-6">
                  <span className="text-4xl block mb-3">👥</span>
                  <p className="text-sm text-slate-500">Keine Mitarbeiter vorhanden.</p>
                  <p className="text-xs text-slate-400 mt-2">Füge zuerst einen Mitarbeiter hinzu.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {allEmployees.map((emp: any) => (
                    <button key={emp.id}
                      onClick={() => {
                        setEmployeeName(emp.name || '');
                        setEmployeeStundenlohn(emp.stundenlohn ? String(emp.stundenlohn) : '');
                        setExistingEmpDocId(emp.id);
                        setViewMode('create');
                        setSuggestedUsername((emp.name || '').trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-zäöüß.\-]/g, ''));
                      }}
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
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full group-hover:bg-amber-100 transition-all">Zugangsdaten erstellen</span>
                    </button>
                  ))}
                  <button onClick={() => { setShowQuickAdd(true); setQuickName(''); setQuickRate(''); }}
                    className="group flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-teal-50 hover:border-teal-300 hover:shadow-md active:scale-[0.97] transition-all min-h-[160px]">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-2xl text-slate-400 group-hover:bg-teal-100 group-hover:text-teal-500 transition-all">+</div>
                    <p className="text-sm font-bold text-slate-400 group-hover:text-teal-600 text-center transition-all">Mitarbeiter hinzufügen</p>
                  </button>
                </div>
              )}

              {showQuickAdd && (
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl animate-slideUp">
                  <label className="block text-xs font-semibold text-teal-700 mb-2">Neuen Mitarbeiter anlegen</label>
                  <div className="flex gap-2 mb-2">
                    <input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="Name"
                      className="flex-1 px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickRate} onChange={e => setQuickRate(e.target.value)} type="number" step="0.01" min="0" placeholder="€/h"
                      className="w-20 px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleQuickAddEmployee} disabled={quickSaving || !quickName.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white active:scale-[0.95] transition-all">
                      {quickSaving ? '...' : 'Hinzufügen'}
                    </button>
                    <button onClick={() => setShowQuickAdd(false)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200 active:scale-[0.95] transition-all">Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'share' && (
            <div className="space-y-5 max-w-md">
              <button onClick={resetToChoose} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">&larr; Zurück</button>
              {inviteCode ? (
                <>
                  <div className="text-center p-6 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200">
                    <p className="text-xs text-purple-600 font-semibold mb-2">Einladungscode für dieses Projekt</p>
                    <p className="text-4xl font-black text-purple-700 tracking-[0.3em]">{inviteCode}</p>
                  </div>
                  <p className="text-xs text-amber-600 font-semibold">Der Code kann nur von einem Mitarbeiter verwendet werden.</p>
                  <div className="flex gap-3">
                    <button onClick={copyInviteCode}
                      className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-md">
                      In Zwischenablage kopieren
                    </button>
                  </div>
                  <button onClick={resetToChoose} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">
                    Zurück zur Übersicht
                  </button>
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
              <span className="text-5xl block">✅</span>
              <p className="text-sm font-bold text-slate-700">Mitarbeiter erstellt!</p>
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
              <button onClick={async () => {
                const msg = `Dein Zugang für "${assignment?.projekt || 'EarnTrack'}":\n\n📧 E-Mail: ${createdEmployee.email}\n🔐 Passwort: ${createdEmployee.password}\n\nLade die App herunter und melde dich an:\nhttps://apps.apple.com/de/app/earntrack-business-manager/id6766016338`;
                await navigator.clipboard.writeText(msg);
                alert('Zugangsdaten wurden kopiert!');
              }}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-md">
                Zugangsdaten kopieren
              </button>
              <button onClick={resetToChoose} className="text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">
                Weiteren Mitarbeiter hinzufügen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
