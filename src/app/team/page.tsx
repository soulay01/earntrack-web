'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import UpgradeModal from '@/components/UpgradeModal';
import { collection, query, where, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, doc, serverTimestamp, Timestamp, arrayUnion } from 'firebase/firestore';
import { getFeatureFlag } from '@/lib/plans';
import { db } from '@/lib/firebase';
import { adminCreateUser, adminDeleteUser } from '@/lib/admin';
import { Key, User, Users, CheckCircle, X, Plus, Menu, UserPlus, Link2, Calendar, ChevronLeft, Folder } from 'lucide-react';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
  backLink: 'inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors',
};

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

export default function TeamPage() {
  const { user, loading, assignments, employees, companyId, refresh, company, markProjectRead, markPhotoRead, markClockRead } = useData();
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
    markPhotoRead(id);
    markClockRead(id);
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
      <div className="flex h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-6 max-w-md">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Key className="w-5 h-5 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Mitarbeiter Zugangsdaten</h2>
            <p className="text-slate-500 text-sm mb-6">Mitarbeiter-Zugangsdaten sind in allen Tarifen enthalten. Bei Problemen wende dich bitte an den Support.</p>
          </div>
        </main>
      </div>
    );
  }

  if (pageLoading || loading || !user) return <PageSkeleton variant="cards" />;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      {/* Project list sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-transform duration-300 ${showProjects ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0 md:shadow-none'}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Projekt-Zugänge</h2>
            <p className="text-xs text-slate-500 mt-0.5">{assignments.length} {assignments.length === 1 ? 'Projekt' : 'Projekte'}</p>
          </div>
          <button onClick={() => setShowProjects(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {assignments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Calendar className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-900 mb-1">Keine Projekte</p>
              <p className="text-sm text-slate-500 max-w-xs">Erstelle einen Termin im Kalender, um Mitarbeiter-Zugänge zu verwalten und dein Team einzuladen.</p>
            </div>
          )}
          {assignments.map((a: any) => {
            const sel = a.id === selectedId;
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
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Backdrop for project list on mobile */}
      {showProjects && <div className="fixed inset-0 bg-slate-900/40 z-20 md:hidden" onClick={() => setShowProjects(false)} />}

      {/* Team content */}
      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
          <button onClick={() => setShowProjects(true)} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <Menu className="w-4 h-4" />
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
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Key className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-900">Bitte Projekt wählen</p>
              <p className="text-sm text-slate-500 mt-1">um Zugänge für Mitarbeiter zu verwalten</p>
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
        if (!snap.empty) setInviteCode(snap.docs[0].id);
      } catch (e) { console.error('Error loading invite code:', e); }
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
  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  const generateInviteCode = async () => {
    if (!assignmentId || !user) return;
    setInviteCode('');
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
    let employeeUid = null;
    try {
      const result = await adminCreateUser(user, fullEmail, pass, selectedEmp.name || fullEmail, {
        companyId, role: 'employee', linkedToProjects: [assignmentId],
      });
      employeeUid = result.uid;

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
        throw firestoreError;
      }
    } catch (error: any) {
      if (employeeUid) {
        try { await adminDeleteUser(user, employeeUid); } catch (eCleanup) { console.error('cleanup delete user error:', eCleanup); }
      }
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
      } catch (e) { console.error('Error creating notification:', e); }
      setViewMode('choose');
      refresh();
    } catch (e) { console.error('Error adding member:', e); alert('Fehler beim Hinzufügen'); }
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
    } catch (e) { console.error('Error loading employees:', e); } finally { setLoadingEmployees(false); }
  }, [assignmentId, companyId, user]);

  useEffect(() => { if (viewMode === 'assign') openAssignMode(); }, [openAssignMode, viewMode]);

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{assignment.projekt || 'Unbenannt'}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{assignment.kunde || ''}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 mb-6 border-b border-slate-200">
        <button onClick={() => setMainTab('credentials')}
          className={`pb-2.5 -mb-px text-sm font-medium border-b-2 transition-colors ${
            mainTab === 'credentials' ? 'border-teal-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          Zugangsdaten
        </button>
      </div>

      {/* ========== CREDENTIALS TAB ========== */}
      {mainTab === 'credentials' && (
        <>
          {viewMode === 'choose' && !employees.some((e: any) => e.hasCredentials) && (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <Key className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-900 mb-1">Noch keine Mitarbeiter-Zugänge</p>
              <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                Lege Zugangsdaten an, damit dein Team sich einloggen und Projekte einsehen, Fotos teilen und Nachrichten schreiben kann.
              </p>
              <button onClick={() => setViewMode('pick')} className={`mt-5 ${ui.btnPrimary}`}>
                <Plus className="w-4 h-4" />
                Ersten Zugang erstellen
              </button>
            </div>
          )}
          {viewMode === 'choose' && employees.some((e: any) => e.hasCredentials) && (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              <button onClick={() => { setViewMode('assign'); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Mitarbeiter mit Zugang zuweisen</p>
                  <p className="text-xs text-slate-500 mt-0.5">Bestehenden Login zu diesem Projekt hinzufügen</p>
                </div>
              </button>
              <button onClick={() => { setViewMode('pick'); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Neuen Zugang erstellen</p>
                  <p className="text-xs text-slate-500 mt-0.5">Mitarbeiter auswählen und Zugangsdaten anlegen</p>
                </div>
              </button>
              <button onClick={() => { setViewMode('share'); generateInviteCode(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <Link2 className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Einladungscode erstellen</p>
                  <p className="text-xs text-slate-500 mt-0.5">Mitarbeiter können sich selbst mit einem Code verbinden</p>
                </div>
              </button>
            </div>
          )}

              {viewMode === 'pick' && (
            <div className="space-y-4">
              <button onClick={() => { setViewMode('choose'); setSelectedEmp(null); }} className={ui.backLink}><ChevronLeft className="w-4 h-4" /> Zurück</button>
              <p className="text-sm font-medium text-slate-900">Mitarbeiter auswählen</p>
              {(() => {
                const available = employees.filter((e: any) => e.email?.includes('@') && !e.hasCredentials);
                if (available.length === 0) {
                  return (
                    <div className="text-center py-6">
                      <Users className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                      <p className="text-sm text-slate-600">Keine Mitarbeiter verfügbar.</p>
                      <p className="text-xs text-slate-500 mt-1">Lege zuerst Mitarbeiter mit E-Mail-Adresse an.</p>
                    </div>
                  );
                }
                return (
                  <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {available.map((emp: any) => (
                      <button key={emp.id}
                        onClick={() => { setSelectedEmp(emp); setEmployeePassword(''); setCredentialEmail(generateEmail(emp.name)); setViewMode('create'); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                        {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                          <img src={emp.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center shrink-0">
                            {(emp.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{emp.name}</p>
                          {emp.stundenlohn > 0 && (
                            <p className="text-xs text-slate-500">{parseFloat(emp.stundenlohn).toFixed(2)} €/h</p>
                          )}
                        </div>
                        <span className="text-xs font-medium text-teal-700 shrink-0">Zugang erstellen</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {viewMode === 'create' && selectedEmp && (
            <div className="space-y-4 max-w-md">
              <button onClick={() => setViewMode('pick')} className={ui.backLink}><ChevronLeft className="w-4 h-4" /> Zurück</button>
              <p className="text-sm font-medium text-slate-900">Zugangsdaten für {selectedEmp.name}</p>
              <div>
                <label className={ui.label}>E-Mail (für Login)</label>
                <div className="flex items-center">
                  <input value={credentialEmail} onChange={e => setCredentialEmail(generateEmail(e.target.value))} placeholder="vorname.nachname"
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-r-0 border-slate-300 rounded-l-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors font-mono" />
                  <span className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-r-lg text-sm text-slate-500 font-mono select-none">@earntrack.de</span>
                </div>
              </div>
              <div>
                <label className={ui.label}>Passwort</label>
                <input value={employeePassword} onChange={e => setEmployeePassword(e.target.value)} placeholder="Mind. 6 Zeichen"
                  className={ui.input} />
              </div>
              <button onClick={handleCreateEmployee} disabled={loading || !!validatePassword(employeePassword)}
                className={`${ui.btnPrimary} w-full justify-center disabled:opacity-50`}>
                {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Zugang erstellen
              </button>
            </div>
          )}

          {viewMode === 'assign' && (
            <div className="space-y-4">
              <button onClick={() => setViewMode('choose')} className={ui.backLink}><ChevronLeft className="w-4 h-4" /> Zurück</button>
              <p className="text-sm font-medium text-slate-900">Mitarbeiter zuweisen</p>
              {loadingEmployees ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
                  Lade Mitarbeiter …
                </div>
              ) : existingEmployees.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm text-slate-600">Keine weiteren Mitarbeiter verfügbar.</p>
                  <p className="text-xs text-slate-500 mt-1">Erstelle zuerst Zugangsdaten für deine Mitarbeiter.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {existingEmployees.map((emp: any) => (
                    <button key={emp.uid}
                      onClick={() => handleAssignEmployee(emp)} disabled={loading}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left disabled:opacity-50">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{emp.displayName}</p>
                        <p className="text-xs text-slate-500 truncate">{emp.email}</p>
                      </div>
                      <Plus className="w-4 h-4 text-teal-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {viewMode === 'share' && (
            <div className="space-y-5 max-w-md">
              <button onClick={resetToChoose} className={ui.backLink}><ChevronLeft className="w-4 h-4" /> Zurück</button>
              {inviteCode ? (
                <>
                  <div className="text-center p-6 rounded-xl bg-white border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 mb-2">Einladungscode für dieses Projekt</p>
                    <p className="text-3xl font-semibold text-slate-900 tracking-[0.3em] font-mono break-all truncate">{inviteCode}</p>
                  </div>
                  <p className="text-xs text-slate-500">Der Code kann nur von einem Mitarbeiter verwendet werden.</p>
                  <button onClick={copyInviteCode} className={`${ui.btnPrimary} w-full justify-center`}>
                    In Zwischenablage kopieren
                  </button>
                  <button onClick={resetToChoose} className="block mx-auto text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    Zurück zur Übersicht
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
                  Generiere Einladungscode …
                </div>
              )}
            </div>
          )}

          {viewMode === 'success' && createdEmployee && (
            <div className="text-center space-y-5 max-w-md">
              <CheckCircle className="w-10 h-10 mx-auto text-teal-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">Mitarbeiter erstellt</p>
                <p className="text-sm text-slate-500 mt-1">Teile die Zugangsdaten mit {createdEmployee.name}</p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">E-Mail</span>
                  <span className="text-sm font-medium text-slate-900">{createdEmployee.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Passwort</span>
                  <span className="text-sm font-medium text-slate-900 font-mono">{createdEmployee.password}</span>
                </div>
              </div>
              <button onClick={async () => {
                const msg = `Dein Zugang für "${assignment?.projekt || 'EarnTrack'}":\n\nE-Mail: ${createdEmployee.email}\nPasswort: ${createdEmployee.password}\n\nLade die App herunter und melde dich an:\nhttps://apps.apple.com/de/app/earntrack-business-manager/id6766016338`;
                await navigator.clipboard.writeText(msg);
                alert('Zugangsdaten wurden kopiert!');
              }} className={`${ui.btnPrimary} w-full justify-center`}>
                Zugangsdaten kopieren
              </button>
              <button onClick={resetToChoose} className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                Weiteren Mitarbeiter hinzufügen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
