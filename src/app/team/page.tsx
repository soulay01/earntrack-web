'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import UpgradeModal from '@/components/UpgradeModal';
import { collection, query, where, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, doc, serverTimestamp, Timestamp, arrayUnion } from 'firebase/firestore';
import { getFeatureFlag } from '@/lib/plans';
import { db } from '@/lib/firebase';
import { adminCreateUser, adminDeleteUser } from '@/lib/admin';

type ViewMode = 'choose' | 'pick' | 'create' | 'assign' | 'share' | 'success';
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
  const { user, loading, assignments, employees, companyId, refresh, unreadCounts, markProjectRead, company } = useData();
  const router = useRouter();
  const [showUpgrade, setShowUpgrade] = useState(false);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aid = params.get('assignmentId');
    if (aid && assignments.find((a: any) => a.id === aid)) {
      setSelectedId(aid);
    }
  }, []);

  if (!getFeatureFlag(company?.subscriptionPlan, 'employeeCredentials') && user) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-6 max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🛡️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Team-Seite</h2>
            <p className="text-slate-500 text-sm mb-6">Die Team-Seite mit Projektzugängen ist im Solo-Plan nicht enthalten. Upgrade auf Team oder Business.</p>
            <button onClick={() => setShowUpgrade(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl text-sm hover:shadow-lg active:scale-[0.97] transition-all">
              Jetzt upgraden
            </button>
            <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} dismissable
              title="Team-Seite"
              description="Die Team-Seite mit Projektzugängen ist im Solo-Plan nicht enthalten. Upgrade auf Team oder Business."
              feature="teamPage" />
          </div>
        </main>
      </div>
    );
  }

  if (pageLoading || loading || !user) return null;

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      {/* Project list sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-30 w-72 bg-gradient-to-b from-amber-50 to-white border-r border-amber-200 flex flex-col overflow-hidden transition-all duration-300 ${showProjects ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0 md:shadow-none'}`}>
        <div className="flex items-center justify-between p-4 border-b border-amber-200/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Projekt-Zugänge</h2>
              <p className="text-xs text-amber-600 font-medium mt-0.5">{assignments.length} Projekte</p>
            </div>
          </div>
          <button onClick={() => setShowProjects(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {assignments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-200 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <p className="text-base font-bold text-slate-800 mb-1">Keine Projekte</p>
              <p className="text-sm text-slate-500 mb-5 max-w-xs">Erstelle einen Termin im Kalender, um Mitarbeiter-Zugänge zu verwalten und dein Team einzuladen.</p>
            </div>
          )}
          {assignments.map((a: any) => {
            const sel = a.id === selectedId;
            const unread = unreadCounts[a.id] || 0;
            return (
              <button key={a.id} onClick={() => handleSelectProject(a.id)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  sel ? 'bg-amber-50 border border-amber-300 shadow-sm ring-1 ring-amber-200' : 'hover:bg-amber-50/50 border border-transparent'
                }`}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
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

      {/* Team content */}
      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white">
          <button onClick={() => setShowProjects(true)} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 active:scale-[0.95] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Projekte
          </button>
          {assignment && <span className="text-xs text-slate-400 truncate ml-2">/ {assignment.projekt || assignment.kunde || 'Unbenannt'}</span>}
        </div>
        {assignmentId && assignment ? (
          <TeamContent
            key={assignmentId}
            assignment={assignment}
            assignmentId={assignmentId}
            user={user}
            companyId={companyId}
            employees={employees}
            refresh={refresh}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <p className="text-slate-600 font-semibold">Bitte Projekt wählen</p>
              <p className="text-xs text-slate-400 mt-1">um Zugänge für Mitarbeiter zu verwalten</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TeamContent({ assignment, assignmentId, user, companyId, employees, refresh }: { assignment: any; assignmentId: string; user: any; companyId: string | null; employees: any[]; refresh: () => Promise<void> }) {
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

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'project_invites'), where('assignmentId', '==', assignmentId)));
        if (cancelled) return;
        if (!snap.empty) setInviteCode(snap.docs[0].data().code || '');
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [assignmentId]);

  const resetToChoose = useCallback(() => { setViewMode('choose'); setCreatedEmployee(null); setSelectedEmp(null); setCredentialEmail(''); setEmployeePassword(''); }, []);

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

  const handleCreateEmployee = async () => {
    if (!user || !companyId || !assignmentId) return;
    if (!selectedEmp) { alert('Bitte wähle einen Mitarbeiter aus'); return; }
    const fullEmail = credentialEmail.trim() + '@earntrack.de';
    if (!credentialEmail.trim()) { alert('Bitte gib den lokalen Teil der E-Mail ein'); return; }
    const pwdErr = validatePassword(employeePassword);
    if (pwdErr) { alert(pwdErr); return; }
    const pass = employeePassword;
    setLoading(true);
    try {
      const { uid: employeeUid } = await adminCreateUser(user, fullEmail, pass, selectedEmp.name || fullEmail, {
        companyId, role: 'employee', linkedToProjects: [assignmentId],
      });

      try {
        await setDoc(doc(db, 'project_members', assignmentId), { [employeeUid]: { displayName: selectedEmp.name, email: fullEmail, role: 'member', stundenlohn: selectedEmp.stundenlohn || 0, joinedAt: serverTimestamp() } }, { merge: true });

        await updateDoc(doc(db, 'employees', selectedEmp.id), {
          hasCredentials: true, needsSetup: true, authUid: employeeUid, email: fullEmail,
        });

        try {
          await addDoc(collection(db, 'notifications'), {
            userId: employeeUid,
            type: 'project_assigned',
            title: 'Neues Projekt',
            body: `Du wurdest zu "${assignment.projekt || 'Einem Projekt'}"${assignment.kunde ? ` (${assignment.kunde})` : ''} hinzugefügt.`,
            assignmentId,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (eNotif) { console.error('notification error:', eNotif); }

        setCreatedEmployee({ email: fullEmail, password: pass, name: selectedEmp.name });
        setViewMode('success');
        refresh();
      } catch (firestoreError) {
        try { await adminDeleteUser(user, employeeUid); } catch (eCleanup) { console.error('cleanup delete user error:', eCleanup); }
        throw firestoreError;
      }
    } catch (error: any) {
      const msg = error.message || '';
      if (msg === 'EMAIL_EXISTS') {
        alert('Diese E-Mail wird bereits verwendet. Ändere den Namen oder den lokalen Teil der E-Mail.');
      } else if (msg.includes('401') || msg.includes('Unauthorized')) {
        alert('Zugriff verweigert. Stelle sicher, dass du als Unternehmen angemeldet bist und dein Benutzerkonto die Rolle "owner" hat.');
      } else {
        alert('Fehler: ' + msg);
      }
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
      await updateDoc(doc(db, 'users', emp.uid), {
        linkedToProjects: arrayUnion(assignmentId),
      });
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
        available.push({ uid: d.id, email: ud.email, displayName: ud.displayName || ud.email, stundenlohn: emp.stundenlohn || 0 });
      });
      setExistingEmployees(available);
    } catch {} finally { setLoadingEmployees(false); }
  }, [assignmentId, companyId, user]);

  useEffect(() => { if (viewMode === 'assign') openAssignMode(); }, [openAssignMode, viewMode]);

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-200">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-md"
          style={{ backgroundColor: colorFor(assignment.projekt || assignment.kunde || 'X') }}>
          {(assignment.projekt || assignment.kunde || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{assignment.projekt || 'Unbenannt'}</h1>
          <p className="text-sm text-amber-600 font-medium">{assignment.kunde || ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-amber-200 pb-2">
        <button onClick={() => setMainTab('credentials')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.95] ${
            mainTab === 'credentials' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-amber-50'
          }`}>
          Zugangsdaten
        </button>
      </div>

      {/* ========== CREDENTIALS TAB ========== */}
      {mainTab === 'credentials' && (
        <>
          {viewMode === 'choose' && !employees.some((e: any) => e.hasCredentials) && (
            <div className="text-center py-10 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <p className="text-base font-bold text-slate-800 mb-1">Noch keine Mitarbeiter-Zugänge</p>
              <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                Lege Zugangsdaten an, damit dein Team sich einloggen und Projekte einsehen, Fotos teilen und Nachrichten schreiben kann.
              </p>
              <button onClick={() => setViewMode('pick')}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-sm shadow-lg transition-all active:scale-[0.97]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Ersten Zugang erstellen
              </button>
            </div>
          )}
          {viewMode === 'choose' && employees.some((e: any) => e.hasCredentials) && (
            <div className="space-y-3">
              <button onClick={() => { setViewMode('assign'); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Mitarbeiter mit Zugang zuweisen</p>
                  <p className="text-xs text-slate-400">Bestehenden Login zu diesem Projekt hinzufügen</p>
                </div>
              </button>
              <button onClick={() => { setViewMode('pick'); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Neuen Zugang erstellen</p>
                  <p className="text-xs text-slate-400">Mitarbeiter auswählen und Zugangsdaten anlegen</p>
                </div>
              </button>
              <button onClick={() => { setViewMode('share'); generateInviteCode(); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-300 hover:shadow-md active:scale-[0.98] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Einladungscode erstellen</p>
                  <p className="text-xs text-slate-400">Mitarbeiter können sich selbst mit einem Code verbinden</p>
                </div>
              </button>
            </div>
          )}

              {viewMode === 'pick' && (
            <div className="space-y-4">
              <button onClick={() => { setViewMode('choose'); setSelectedEmp(null); }} className="text-sm text-amber-600 hover:text-amber-700 font-semibold hover:underline">&larr; Zurück</button>
              <p className="text-sm font-bold text-slate-700">Mitarbeiter auswählen</p>
              {(() => {
                const available = employees.filter((e: any) => e.email?.includes('@') && !e.hasCredentials);
                if (available.length === 0) {
                  return (
                    <div className="text-center py-6">
                      <span className="text-4xl block mb-3">👥</span>
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
                        className="group flex flex-col items-center gap-2 p-5 rounded-xl border border-amber-200 bg-white hover:bg-amber-50 hover:border-amber-300 hover:shadow-md active:scale-[0.97] transition-all">
                        {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                          <img src={emp.imageUrl} alt="" className="w-14 h-14 rounded-full object-cover shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xl font-bold shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all">
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
                  </div>
                );
              })()}
            </div>
          )}

          {viewMode === 'create' && selectedEmp && (
            <div className="space-y-4 max-w-md">
              <button onClick={() => setViewMode('pick')} className="text-sm text-amber-600 hover:text-amber-700 font-semibold hover:underline">&larr; Zurück</button>
              <p className="text-sm font-bold text-slate-700">Zugangsdaten für {selectedEmp.name}</p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">E-Mail (für Login)</label>
                <div className="flex items-center gap-0">
                  <input value={credentialEmail} onChange={e => setCredentialEmail(generateEmail(e.target.value))} placeholder="vorname.nachname"
                    className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-r-0 border-slate-200 rounded-l-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all font-mono" />
                  <span className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-r-lg text-sm text-slate-500 font-mono select-none">@earntrack.de</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Passwort</label>
                <input value={employeePassword} onChange={e => setEmployeePassword(e.target.value)} placeholder="Mind. 6 Zeichen"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all" />
              </div>
              <button onClick={handleCreateEmployee} disabled={loading || !!validatePassword(employeePassword)}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-lg transition-all text-sm shadow-md flex items-center justify-center gap-2">
                {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Zugang erstellen
              </button>
            </div>
          )}

          {viewMode === 'assign' && (
            <div className="space-y-4">
              <button onClick={() => setViewMode('choose')} className="text-sm text-amber-600 hover:text-amber-700 font-semibold hover:underline">&larr; Zurück</button>
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
                    <button key={emp.uid}
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
                  ))}
                </div>
              )}
            </div>
          )}

          {viewMode === 'share' && (
            <div className="space-y-5 max-w-md">
              <button onClick={resetToChoose} className="text-sm text-amber-600 hover:text-amber-700 font-semibold hover:underline">&larr; Zurück</button>
              {inviteCode ? (
                <>
                  <div className="text-center p-6 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200">
                    <p className="text-xs text-purple-600 font-semibold mb-2">Einladungscode für dieses Projekt</p>
                    <p className="text-4xl font-black text-purple-700 tracking-[0.3em]">{inviteCode}</p>
                  </div>
                  <p className="text-xs text-amber-600 font-semibold">Der Code kann nur von einem Mitarbeiter verwendet werden.</p>
                  <div className="flex gap-3">
                    <button onClick={copyInviteCode}
                      className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 hover:shadow-lg active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-md">
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
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 hover:shadow-lg active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-md">
                Zugangsdaten kopieren
              </button>
              <button onClick={resetToChoose} className="text-sm text-amber-600 hover:text-amber-700 font-semibold hover:underline">
                Weiteren Mitarbeiter hinzufügen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
