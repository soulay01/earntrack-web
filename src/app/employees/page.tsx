'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function EmployeesPage() {
  const { user, loading, employees: raw, companyId, refresh } = useData();
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

  const employees = useMemo(() => {
    if (!search) return raw;
    const q = search.toLowerCase();
    return raw.filter(e => (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q));
  }, [raw, search]);

  useEffect(() => {
    if (!raw.length) return;
    const names = raw.map(e => e.name).filter(Boolean);
    const hours: Record<string, number> = {};
    (async () => {
      const batches: any[] = [];
      for (let i = 0; i < names.length; i += 10) {
        const batch = names.slice(i, i + 10);
        batches.push(getDocs(query(collection(db, 'clock_entries'), where('userName', 'in', batch))));
      }
      const results = await Promise.all(batches);
      results.forEach((snap: any) => snap.forEach((d: QueryDocumentSnapshot) => {
        const data = d.data();
        const ci = data.clockIn?.toDate ? data.clockIn.toDate() : new Date(data.clockIn);
        const co = data.clockOut?.toDate ? data.clockOut.toDate() : data.clockOut ? new Date(data.clockOut) : null;
        if (!co) return;
        const mins = Math.round((co.getTime() - ci.getTime()) / 60000) - (data.totalBreakMinutes || 0);
        hours[data.userName] = (hours[data.userName] || 0) + mins;
      }));
      setEmpHours(hours);
    })();
  }, [raw]);

  async function createCredentials(employee: any) {
    if (!credPassword || credPassword.length < 6) { alert('Passwort muss mindestens 6 Zeichen lang sein.'); return; }
    setCredSaving(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      const fullEmail = employee.email;
      if (!fullEmail || !fullEmail.includes('@')) { alert('Mitarbeiter benötigt eine gültige E-Mail-Adresse.'); setCredSaving(false); return; }
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fullEmail, password: credPassword, returnSecureToken: true }),
      });
      const data = await res.json();
      if (!res.ok) { alert('Fehler: ' + (data.error?.message || 'Unbekannter Fehler')); setCredSaving(false); return; }
      await updateDoc(doc(db, 'employees', employee.id), { _storedPassword: credPassword, needsSetup: true });
      setShowCreds(false); setCredEmployee(null); setCredPassword('');
      refresh();
    } catch (e) {
      alert('Fehler beim Erstellen: ' + (e instanceof Error ? e.message : ''));
    } finally { setCredSaving(false); }
  }

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  async function save(form: any) {
    if (!user || !companyId) return;
    if (form.email) {
      const exists = raw.some(e => e.email?.toLowerCase() === form.email.toLowerCase() && e.id !== editing?.id);
      if (exists) { alert('Diese E-Mail wird bereits von einem anderen Mitarbeiter verwendet.'); return; }
    }
    setSaving(true);
    try {
      const data = { ...form, companyId, createdAt: serverTimestamp() };
      if (editing) await updateDoc(doc(db, 'employees', editing.id), data);
      else await addDoc(collection(db, 'employees'), data);
      setShowModal(false); setEditing(null);
      refresh();
    } catch (e) {
      console.error('Save employee error:', e);
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await deleteDoc(doc(db, 'employees', id));
    setDeleting(null); refresh();
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mitarbeiter</h1>
              <p className="text-slate-500 text-sm mt-1">{raw.length} Mitarbeiter</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Mitarbeiter
            </button>
          </div>

          <div className="relative mb-6 animate-fadeIn">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Mitarbeiter durchsuchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all shadow-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {employees.map((e, i) => {
              const totalMins = empHours[e.name] || 0;
              const hoursStr = totalMins > 0 ? `${(totalMins / 60).toFixed(1)}h` : null;
              return (
              <div key={e.id}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp"
                style={{ animationDelay: `${i * 50}ms` }}>
                {/* Color accent */}
                <div className="h-1.5 w-full" style={{ backgroundColor: colorFor(e.name) }} />

                <div className="p-5 text-center">
                  {/* Avatar */}
                  {e.imageUrl?.startsWith('https://') || e.imageUrl?.startsWith('data:image/') ? (
                    <img src={e.imageUrl} alt="" className="w-16 h-16 mx-auto mb-3 rounded-2xl object-cover shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm"
                      style={{ backgroundColor: colorFor(e.name) }}>
                      {(e.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}

                  <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-teal-700 transition-colors">{e.name || 'Unbekannt'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 mb-2 truncate">{e.email || 'Keine E-Mail'}</p>

                  {/* Badge row */}
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      <span>€</span>
                      <span>{e.stundenlohn ? `${Number(e.stundenlohn).toFixed(2)}/h` : '–'}</span>
                    </div>
                    {hoursStr && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <span>⏱</span>
                        <span>{hoursStr}</span>
                      </div>
                    )}
                    {e._storedPassword && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <span>🔑</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex border-t border-slate-100 divide-x divide-slate-100 transition-all duration-200">
                  <button onClick={() => { setEditing(e); setShowModal(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all active:scale-[0.95]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Bearbeiten
                  </button>
                  {e._storedPassword && (
                    <button onClick={() => { setShowCreds(true); setCredEmployee(e); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-green-600 hover:text-green-700 hover:bg-green-50 transition-all active:scale-[0.95]">
                      <span>🔑</span>
                      Zugangsdaten
                    </button>
                  )}
                  <button onClick={() => setDeleting(e.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-red-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-[0.95]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    Löschen
                  </button>
                </div>
              </div>
            );})}
            {employees.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <p className="text-slate-500 text-base mb-4">{search ? 'Keine Ergebnisse' : 'Noch keine Mitarbeiter'}</p>
                {!search && (
                  <button onClick={() => { setEditing(null); setShowModal(true); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Mitarbeiter anlegen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <EmployeeModal editing={editing} saving={saving} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} user={user} companyId={companyId} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 animate-scaleIn">
            <h3 className="text-lg font-bold text-slate-900">Mitarbeiter löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
              <button onClick={() => remove(deleting)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.97] text-white transition-all shadow-sm">Löschen</button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}

function CredentialModal({ employee, onSave, onClose, password, setPassword, saving }: any) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); } catch {}
  };

  if (employee._storedPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 animate-scaleIn">
          <div className="flex items-center gap-3 mb-4">
            {employee.imageUrl?.startsWith('https://') || employee.imageUrl?.startsWith('data:image/') ? (
              <img src={employee.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                {(employee.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-slate-900">{employee.name}</h3>
              <p className="text-xs text-slate-400">Zugangsdaten</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-sm text-slate-500 font-medium">E-Mail</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{employee.email}</span>
                <button onClick={() => copy(employee.email, `em-${employee.id}`)}
                  className="p-1.5 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 active:scale-[0.9] transition-all text-xs">
                  {copied === `em-${employee.id}` ? '✅' : '📋'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-sm text-slate-500 font-medium">Passwort</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-slate-800">{employee._storedPassword}</span>
                <button onClick={() => copy(employee._storedPassword, `pw-${employee.id}`)}
                  className="p-1.5 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 active:scale-[0.9] transition-all text-xs">
                  {copied === `pw-${employee.id}` ? '✅' : '📋'}
                </button>
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 active:scale-[0.97] text-slate-700 transition-all">
            Schließen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 animate-scaleIn">
        <div className="flex items-center gap-3 mb-4">
          {employee.imageUrl?.startsWith('https://') || employee.imageUrl?.startsWith('data:image/') ? (
            <img src={employee.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white text-sm font-bold flex items-center justify-center shadow-sm">
              {(employee.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-900">{employee.name}</h3>
            <p className="text-xs text-slate-400">Zugangsdaten erstellen</p>
          </div>
        </div>
        {!employee.email || !employee.email.includes('@') ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 font-medium">
            Dieser Mitarbeiter hat keine E-Mail-Adresse. Bitte hinterlege zuerst eine E-Mail.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-500 font-medium">E-Mail</span>
              <span className="text-sm font-bold text-slate-800">{employee.email}</span>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Passwort</label>
              <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mind. 6 Zeichen"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all font-mono" />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">
            Abbrechen
          </button>
          {employee.email?.includes('@') && (
            <button onClick={() => onSave(employee)} disabled={saving || password.length < 6}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
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
    name: editing?.name || '',
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUri = await fileToBase64(file);
      setPhotoPreview(dataUri);
    } catch (e) {
      console.error('Fehler beim Lesen:', e);
      alert('Fehler beim Lesen der Datei.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Bitte gib einen Namen ein.'); return; }
    if (!parseFloat(form.stundenlohn) || parseFloat(form.stundenlohn) <= 0) { alert('Bitte gib einen gültigen Stundenlohn ein.'); return; }
    await onSave({
      name: form.name, email: form.email, telefon: form.telefon,
      stundenlohn: parseFloat(form.stundenlohn),
      imageUrl: photoPreview.startsWith('https://') || photoPreview.startsWith('data:image/') ? photoPreview : (editing?.imageUrl?.startsWith('https://') || editing?.imageUrl?.startsWith('data:image/') ? editing.imageUrl : ''),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] pb-8 bg-black/30 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md mx-4 animate-slideUp">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{editing ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Photo */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {uploading ? (
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                  <span className="w-6 h-6 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
                </div>
              ) : photoPreview ? (
                <img src={photoPreview} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-sm" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs font-semibold text-teal-600 hover:text-teal-800 disabled:text-slate-300 active:scale-[0.97] transition-all">
              {uploading ? 'Wird hochgeladen...' : photoPreview ? 'Foto ändern' : 'Foto hinzufügen'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">E-Mail</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Telefon</label>
            <input value={form.telefon} onChange={e => update('telefon', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stundenlohn (€)</label>
            <input type="number" step="0.01" min="0.01" value={form.stundenlohn} onChange={e => update('stundenlohn', e.target.value)} required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Mitarbeiter anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
