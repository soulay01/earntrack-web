'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { Clock, Key, TriangleAlert, CheckCircle2, ClipboardList, Plus, Search, Pencil, Trash2, X } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, deleteField } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { adminCreateUser, adminDeleteUser } from '@/lib/admin';
import { hasReachedLimit, getPlanLimit, EXCESS_CLEANUP_DAYS, EXCESS_CLEANUP_MS, PLAN_LIMITS } from '@/lib/plans';
import { logUsage } from '@/lib/usageLog';
import UpgradeModal from '@/components/UpgradeModal';
import { compressImageToDataUrl } from '@/lib/utils';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  btnDanger: 'px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tagen'}`);
  if (hours > 0) parts.push(`${hours} Std`);
  if (minutes > 0) parts.push(`${minutes} Min`);
  parts.push(`${seconds} Sek`);
  return parts.join(' · ');
}

export default function EmployeesPage() {
  const { user, loading, employees: raw, companyId, company, refresh } = useData();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [credEmployee, setCredEmployee] = useState<any>(null);
  const [credPassword, setCredPassword] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [empHours, setEmpHours] = useState<Record<string, number>>({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const employees = useMemo(() => {
    if (!search) return raw;
    const q = search.toLowerCase();
    return (raw || []).filter(e => (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.berufsfeld || '').toLowerCase().includes(q));
  }, [raw, search]);

  useEffect(() => {
    if (!raw.length || !companyId) return;
    const idMap: Record<string, string> = {};
    for (const e of raw) {
      if (e.authUid) idMap[e.authUid] = e.id;
      if (e.email) idMap[e.email] = e.id;
      if (e.name) idMap[e.name] = e.id;
    }
    const hours: Record<string, number> = {};
    let cancelled = false;
    (async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const snap = await getDocs(query(
        collection(db, 'clock_entries'),
        where('companyId', '==', companyId),
        where('clockIn', '>=', thirtyDaysAgo)
      ));
      if (cancelled) return;
      snap.forEach((d: any) => {
        const data = d.data();
        const ci = data.clockIn?.toDate ? data.clockIn.toDate() : new Date(data.clockIn);
        const co = data.clockOut?.toDate ? data.clockOut.toDate() : data.clockOut ? new Date(data.clockOut) : null;
        if (!co) return;
        const breakMin = Math.round((data.totalBreakMs ?? (data.totalBreakMinutes || 0) * 60000) / 60000);
        const mins = Math.round((co.getTime() - ci.getTime()) / 60000) - breakMin;
        const empId = idMap[data.userId] || idMap[data.userName] || idMap[data.userEmail] || '';
        if (empId) hours[empId] = (hours[empId] || 0) + mins;
      });
      setEmpHours(hours);
    })();
    return () => { cancelled = true; };
  }, [raw, companyId]);

  function validatePassword(pwd: string): string | null {
    if (!pwd || pwd.length < 6) return 'Passwort muss mindestens 6 Zeichen haben';
    if (!/[A-Z]/.test(pwd)) return 'Passwort muss mindestens einen Großbuchstaben enthalten';
    if (!/[0-9]/.test(pwd)) return 'Passwort muss mindestens eine Zahl enthalten';
    if (!/[^a-zA-Z0-9]/.test(pwd)) return 'Passwort muss mindestens ein Sonderzeichen enthalten';
    return null;
  }

  async function createCredentials(employee: any) {
    const pwdErr = validatePassword(credPassword);
    if (pwdErr) { alert(pwdErr); return; }
    const fullEmail = employee.email;
    if (!fullEmail || !fullEmail.includes('@')) { alert('Mitarbeiter benötigt eine gültige E-Mail-Adresse.'); return; }
    setCredSaving(true);
    try {
      const { uid, isExisting } = await adminCreateUser(user, fullEmail, credPassword, employee.name || employee.email, { companyId });
      await updateDoc(doc(db, 'employees', employee.id), { hasCredentials: true, needsSetup: true, authUid: uid });
      if (isExisting) alert('E-Mail existiert bereits – Zugang wurde verknüpft.');
      setShowCreds(false); setCredEmployee(null); setCredPassword('');
      refresh();
      alert('Zugangsdaten erstellt!');
    } catch (e: any) {
      alert('Fehler beim Erstellen: ' + (e.message || ''));
    } finally { setCredSaving(false); }
  }

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  // Countdown + auto-delete for excess employees
  useEffect(() => {
    const cleanupAt = company?.excessCleanupAt?.toDate?.();
    if (!cleanupAt) { setCountdown(null); return; }

    const plan = company?.subscriptionPlan;
    const limit = getPlanLimit(plan, 'employees');
    const excess = raw.length - limit;
    if (excess <= 0) { setCountdown(null); return; }

    let cancelled = false;

    const tick = () => {
      const now = Date.now();
      const remaining = cleanupAt.getTime() - now;
      if (remaining <= 0) {
        if (cancelled) return;
        setCountdown(0);
        // Server-API für Cleanup aufrufen statt clientseitig zu löschen
        (async () => {
          try {
            const token = await auth.currentUser?.getIdToken();
            if (token) {
              await fetch('/api/cleanup-excess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              });
            }
          } catch (e) {
            console.error('Cleanup failed:', e);
          }
          if (cancelled) return;
          setCountdown(null);
          refreshRef.current();
        })();
        return;
      }
      if (cancelled) return;
      setCountdown(remaining);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [company?.excessCleanupAt, company?.subscriptionPlan, raw.length, companyId]);

  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-7xl" />;

  async function save(form: any) {
    if (!user || !companyId) return;
    if (!editing && hasReachedLimit(company?.subscriptionPlan, 'employees', raw.length)) {
      setShowUpgrade(true); return;
    }
    if (form.email) {
      const exists = raw.some(e => e.email?.toLowerCase() === form.email.toLowerCase() && e.id !== editing?.id);
      if (exists) { alert('Diese E-Mail wird bereits von einem anderen Mitarbeiter verwendet.'); return; }
    }
    const fullName = [form.vorname, form.nachname].filter(Boolean).join(' ').trim();
    if (!fullName) {
      console.warn('Employee missing first/last name – aborting save');
      alert('Bitte fülle alle Pflichtfelder aus');
      setSaving(false); return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { createdAt: _, ...rest } = form;
        await updateDoc(doc(db, 'employees', editing.id), { ...rest, companyId });
      } else {
        await addDoc(collection(db, 'employees'), { ...form, companyId, createdAt: serverTimestamp() });
      }
      if (!editing) logUsage('employee_created');
      setShowModal(false); setEditing(null);
      refresh();
      alert(editing ? 'Mitarbeiter aktualisiert' : 'Mitarbeiter erstellt');
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const emp = raw.find(e => e.id === id);
    const errors: string[] = [];
    if (emp?.hasCredentials && emp?.email) {
      try { await adminDeleteUser(user, undefined, emp.email); } catch (e) { errors.push('adminDeleteUser: ' + e); }
    }
    if (emp?.authUid) {
      try { await deleteDoc(doc(db, 'users', emp.authUid)); } catch (e) { errors.push('deleteUserDoc: ' + e); }
    }
    try {
      await deleteDoc(doc(db, 'employees', id));
    } catch (e) {
      errors.push('deleteEmployeeDoc: ' + e);
    }
    if (errors.length) console.error('Employee deletion errors:', errors);
    setDeleting(null); refresh();
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Mitarbeiter</h1>
              <p className="text-slate-500 text-sm mt-0.5">{raw.length} Mitarbeiter</p>
            </div>
            <button onClick={() => { if (hasReachedLimit(company?.subscriptionPlan, 'employees', raw.length)) { setShowUpgrade(true); return; } setEditing(null); setShowModal(true); }}
              disabled={hasReachedLimit(company?.subscriptionPlan, 'employees', raw.length)}
              className={`${ui.btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <Plus className="w-4 h-4" />
              Neuer Mitarbeiter
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Suchen nach Name, E-Mail, Berufsfeld …" value={search} onChange={e => setSearch(e.target.value)}
              className={`${ui.input} pl-9`} />
          </div>

          {/* Countdown banner for excess employees */}
          {countdown !== null && countdown > 0 && (() => {
            const plan = company?.subscriptionPlan;
            const limit = getPlanLimit(plan, 'employees');
            const excess = raw.length - limit;
            if (excess <= 0) return null;
            return (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 hidden sm:block" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900">
                    {excess} Mitarbeiter über dem Limit ({limit} erlaubt)
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Die {excess} zuletzt angelegten werden gelöscht in{' '}
                    <strong>{formatCountdown(countdown)}</strong>
                  </p>
                </div>
                <a href="/settings/subscription"
                  className="shrink-0 inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs transition-colors">
                  Jetzt upgraden
                </a>
              </div>
            );
          })()}

          {/* Fallback banner before excessCleanupAt is set */}
          {countdown === null && company?.subscriptionPlan && company?.subscriptionStatus !== 'cancelled' && (() => {
            const plan = company.subscriptionPlan;
            const limit = getPlanLimit(plan, 'employees');
            const excess = raw.length - limit;
            if (excess <= 0 || limit === Infinity) return null;
            return (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 hidden sm:block" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900">
                    {excess} Mitarbeiter über dem Limit ({limit} erlaubt)
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Dein aktueller Plan erlaubt maximal {limit} Mitarbeiter. Bitte reduziere die Anzahl oder upgrade deinen Plan.
                  </p>
                </div>
                <a href="/settings/subscription"
                  className="shrink-0 inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs transition-colors">
                  Plan upgraden
                </a>
              </div>
            );
          })()}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_120px] gap-4 px-4 py-2.5 border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <span>Mitarbeiter</span>
              <span>Berufsfeld</span>
              <span className="text-right">Stundenlohn</span>
              <span className="text-right">Std. (30 Tage)</span>
              <span className="text-right">Aktionen</span>
            </div>
            <div className="divide-y divide-slate-100">
              {employees.map(e => {
                const totalMins = empHours[e.id] || 0;
                const hoursStr = totalMins > 0 ? `${(totalMins / 60).toFixed(1)} h` : '–';
                return (
                <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_120px] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_120px] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {e.imageUrl?.startsWith('https://') || e.imageUrl?.startsWith('data:image/') ? (
                      <img src={e.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center shrink-0">
                        {(e.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                        {e.name || 'Unbekannt'}
                        {e.hasCredentials && (
                          <span title="Hat Zugangsdaten" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-700">
                            <Key className="w-3 h-3" /> Zugang
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{e.email || 'Keine E-Mail'}</p>
                    </div>
                  </div>
                  <span className="hidden md:block text-sm text-slate-600 truncate">{e.berufsfeld || '–'}</span>
                  <span className="hidden md:block text-sm text-slate-900 text-right tabular-nums">
                    {e.stundenlohn ? `${Number(e.stundenlohn).toFixed(2)} €/h` : '–'}
                  </span>
                  <span className="hidden md:flex items-center justify-end gap-1.5 text-sm text-slate-600 tabular-nums">
                    {totalMins > 0 && <Clock className="w-3.5 h-3.5 text-slate-400" />}
                    {hoursStr}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    {e.hasCredentials && (
                      <button onClick={() => { setShowCreds(true); setCredEmployee(e); }} title="Zugangsdaten"
                        className="p-2 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors">
                        <Key className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => { setEditing(e); setShowModal(true); }} title="Bearbeiten"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleting(e.id)} title="Löschen"
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );})}
              {employees.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">{search ? 'Keine Ergebnisse' : 'Noch keine Mitarbeiter'}</p>
                  <p className="text-sm text-slate-500 mb-5">{search ? 'Passe deine Suche an.' : 'Lege deinen ersten Mitarbeiter an, um loszulegen.'}</p>
                  {!search && (
                    <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
                      <Plus className="w-4 h-4" />
                      Ersten Mitarbeiter anlegen
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showModal && (
        <EmployeeModal editing={editing} saving={saving} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} user={user} companyId={companyId} />
      )}

      {deleting && (() => {
        const e = raw.find(e => e.id === deleting);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900">Mitarbeiter "{e?.name || 'Unbekannt'}" löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setDeleting(null)} className={ui.btnGhost}>Abbrechen</button>
              <button onClick={() => remove(deleting)} className={ui.btnDanger}>Löschen</button>
            </div>
          </div>
        </div>
      )})()}

      {showCreds && credEmployee && (
        <CredentialModal
          employee={credEmployee}
          onSave={createCredentials}
          onClose={() => { setShowCreds(false); setCredEmployee(null); setCredPassword(''); }}
          password={credPassword}
          setPassword={setCredPassword}
          saving={credSaving}
        />
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dismissable
        title="Mitarbeiter-Limit erreicht"
        description={(() => {
          const plan = company?.subscriptionPlan;
          const limit = getPlanLimit(plan, 'employees');
          if (limit === Infinity) return 'Maximale Anzahl erreicht. Bitte reduziere die Anzahl der Mitarbeiter.';
          return `Dein aktueller Plan erlaubt maximal ${limit} Mitarbeiter. Upgrade auf einen größeren Plan, um mehr Mitarbeiter zu verwalten.`;
        })()}
      />
    </div>
  );
}

function CredentialModal({ employee, onSave, onClose, password, setPassword, saving }: any) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); } catch (e) { console.error('Clipboard write failed:', e); }
  };

  if (employee.hasCredentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
          <div className="flex items-center gap-3 mb-4">
            {employee.imageUrl?.startsWith('https://') || employee.imageUrl?.startsWith('data:image/') ? (
              <img src={employee.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center">
                {(employee.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-900">{employee.name}</h3>
              <p className="text-xs text-slate-500">Zugangsdaten</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-sm text-slate-500">E-Mail</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{employee.email}</span>
                <button onClick={() => copy(employee.email, `em-${employee.id}`)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors">
                  {copied === `em-${employee.id}` ? <CheckCircle2 className="w-4 h-4 text-teal-600" /> : <ClipboardList className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 text-center">
              Passwort wurde bei Erstellung angezeigt
            </div>
          </div>
          <button onClick={onClose}
            className="mt-4 w-full py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors">
            Schließen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          {employee.imageUrl?.startsWith('https://') || employee.imageUrl?.startsWith('data:image/') ? (
            <img src={employee.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center">
              {(employee.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-slate-900">{employee.name}</h3>
            <p className="text-xs text-slate-500">Zugangsdaten erstellen</p>
          </div>
        </div>
        {!employee.email || !employee.email.includes('@') ? (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            Dieser Mitarbeiter hat keine E-Mail-Adresse. Bitte hinterlege zuerst eine E-Mail.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-500">E-Mail</span>
              <span className="text-sm font-medium text-slate-900">{employee.email}</span>
            </div>
            <div>
              <label className={ui.label}>Passwort</label>
              <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mind. 6 Zeichen" className={`${ui.input} font-mono`} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className={ui.btnGhost}>Abbrechen</button>
          {employee.email?.includes('@') && (
            <button onClick={() => onSave(employee)} disabled={saving || password.length < 6}
              className={`${ui.btnPrimary} disabled:opacity-50`}>
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Zugangsdaten erstellen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeModal({ editing, saving, onSave, onClose, user, companyId }: any) {
  const [form, setForm] = useState({
    vorname: editing?.vorname || '',
    nachname: editing?.nachname || editing?.name || '',
    berufsfeld: editing?.berufsfeld || '',
    email: editing?.email || '',
    telefon: editing?.telefon || '',
    stundenlohn: editing?.stundenlohn?.toString() || '',
  });
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(
    editing?.imageUrl?.startsWith('https://') || editing?.imageUrl?.startsWith('data:image/') ? editing.imageUrl : ''
  );
  const fileRef = useRef<HTMLInputElement>(null);

  function update(field: string, value: any) { setForm((prev: any) => ({ ...prev, [field]: value })); }

  function fileToBase64(file: File): Promise<string> {
    return compressImageToDataUrl(file);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUri = await fileToBase64(file);
      setPhotoPreview(dataUri);
    } catch (e) {

      alert('Fehler beim Lesen der Datei.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function validatePhone(p: string): string | null {
    if (!p || !p.trim()) return null;
    const cleaned = p.replace(/[\s\-\(\)\/\.]/g, '');
    if (!/^(\+49|0)/.test(cleaned)) return 'Telefonnummer muss mit +49 oder 0 beginnen (z.B. +49 30 12345678)';
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 9) return 'Telefonnummer zu kurz – mindestens 9 Ziffern';
    if (digits.length > 15) return 'Telefonnummer zu lang – maximal 15 Ziffern';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fullName = [form.vorname, form.nachname].filter(Boolean).join(' ').trim();
    if (!fullName) { alert('Bitte gib Vor- und Nachnamen ein.'); return; }
    const stundenlohn = parseFloat(form.stundenlohn);
    if (isNaN(stundenlohn) || stundenlohn < 0) { alert('Bitte gib einen gültigen Stundenlohn ein.'); return; }
    const phoneErr = validatePhone(form.telefon);
    if (phoneErr) { alert(phoneErr); return; }
    await onSave({
      name: fullName, vorname: form.vorname, nachname: form.nachname, berufsfeld: form.berufsfeld, email: form.email, telefon: form.telefon,
      stundenlohn,
      imageUrl: photoPreview || '',
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] pb-8 bg-slate-900/40 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{editing ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            {uploading ? (
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                <span className="w-5 h-5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
              </div>
            ) : photoPreview ? (
              <img src={photoPreview} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <div className="flex gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="text-sm font-medium text-teal-700 hover:text-teal-800 disabled:text-slate-300 transition-colors">
                {uploading ? 'Wird hochgeladen …' : photoPreview ? 'Foto ändern' : 'Foto hinzufügen'}
              </button>
              {photoPreview && (
                <button type="button" onClick={() => setPhotoPreview('')}
                  className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors">
                  Entfernen
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>Vorname</label>
              <input value={form.vorname} onChange={e => update('vorname', e.target.value)} required
                className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Name</label>
              <input value={form.nachname} onChange={e => update('nachname', e.target.value)} required
                className={ui.input} />
            </div>
          </div>
          <div>
            <label className={ui.label}>Berufsfeld</label>
            <input value={form.berufsfeld} onChange={e => update('berufsfeld', e.target.value)} placeholder="z.B. Elektriker, Tischler, Maler"
              className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>E-Mail</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
              className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>Telefon</label>
            <input value={form.telefon} onChange={e => update('telefon', e.target.value)} placeholder="+49 30 12345678"
              className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>Stundenlohn (€)</label>
            <input type="number" step="0.01" min="0.01" value={form.stundenlohn} onChange={e => update('stundenlohn', e.target.value)} required
              className={ui.input} />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className={ui.btnGhost}>Abbrechen</button>
            <button type="submit" disabled={saving} className={`${ui.btnPrimary} disabled:opacity-50`}>
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Mitarbeiter anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
