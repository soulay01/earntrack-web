'use client';

import { useState, useMemo, useEffect } from 'react';
import { useData } from '@/app/Provider';
import { useDirtyGuard } from '@/contexts/DirtyGuardContext';
import CalendarPopover from '@/components/CalendarPopover';
import { formatCurrency } from '@/lib/utils';
import { getGrade, getGradeColor, getGradeBg, analyzeRootCause } from '@/lib/smartPricing';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit, getPlanLimit } from '@/lib/plans';

export default function AssignmentModal({ editing, customers, employees, assignments, saving, initialDate, onSave, onClose }: any) {
  const [form, setForm] = useState({
    projekt: '',
    kunde: '',
    datum: '',
    umsatz: '',
    stunden: '',
    stundenlohn: '',
    mitarbeiter: [] as string[],
    status: 'Geplant',
  });
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [localEmployees, setLocalEmployees] = useState(employees || []);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [quickCustVorname, setQuickCustVorname] = useState('');
  const [quickCustNachname, setQuickCustNachname] = useState('');
  const [quickRate, setQuickRate] = useState('');
  const [quickEmpVorname, setQuickEmpVorname] = useState('');
  const [quickEmpNachname, setQuickEmpNachname] = useState('');
  const [quickEmail, setQuickEmail] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickBerufsfeld, setQuickBerufsfeld] = useState('');
  const [quickCustEmail, setQuickCustEmail] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [quickCustAdresse, setQuickCustAdresse] = useState('');
  const [quickCustNotes, setQuickCustNotes] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const { companyId, user, refresh, company } = useData();
  const { setDirty } = useDirtyGuard();

  useEffect(() => {
    if (editing) {
      setForm({
        projekt: editing.projekt || '',
        kunde: editing.kunde || '',
        datum: editing.datum || '',
        umsatz: editing.umsatz?.toString() || '',
        stunden: editing.stunden?.toString() || '',
        stundenlohn: editing.stundenlohn?.toString() || '',
        mitarbeiter: Array.isArray(editing.mitarbeiter)
          ? editing.mitarbeiter
          : (editing.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean),
        status: editing.status || 'Geplant',
      });
      setDirty(false);
    } else if (initialDate) {
      setForm(prev => ({ ...prev, datum: initialDate }));
      setDirty(false);
    }
  }, [editing, initialDate]);

  useEffect(() => { setLocalCustomers(customers || []); }, [customers]);
  useEffect(() => { setLocalEmployees(employees || []); }, [employees]);

  function update(field: string, value: any) { setDirty(true); setForm((prev: any) => ({ ...prev, [field]: value })); }

  const autoStundenlohn = useMemo(() => {
    return form.mitarbeiter.reduce((sum: number, name: string) => {
      const emp = localEmployees.find((e: any) => e.name === name || e.id === name);
      return sum + (parseFloat(emp?.stundenlohn) || 0);
    }, 0);
  }, [form.mitarbeiter, localEmployees]);

  useEffect(() => {
    update('stundenlohn', autoStundenlohn.toString());
    // Don't mark form dirty — this is an automatic calculation, not user input
    setDirty(false);
  }, [autoStundenlohn]);

  const teamSize = form.mitarbeiter.length;

  const hours = parseFloat(form.stunden) || 0;
  const rate = autoStundenlohn;
  const cost = hours * rate;
  const revenue = parseFloat(form.umsatz) || 0;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const grade = getGrade(margin);
  const rootCause = useMemo(() => {
    if (!form.umsatz && !form.stunden) return null;
    return analyzeRootCause(form, assignments || []);
  }, [form, assignments]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kunde) { alert('Bitte wähle einen Kunden aus.'); return; }
    if (!form.datum) { alert('Bitte wähle ein Datum.'); return; }
    try {
      await onSave({
        projekt: form.projekt,
        kunde: form.kunde,
        datum: form.datum,
        umsatz: form.umsatz || '0',
        stunden: form.stunden || '0',
        stundenlohn: autoStundenlohn.toFixed(2),
        mitarbeiter: form.mitarbeiter,
        status: form.status,
      });
      setDirty(false);
    } catch (e) { console.error('Assignment save failed:', e); }
  }

  async function addQuickCustomer() {
    const fullName = [quickCustVorname, quickCustNachname].filter(Boolean).join(' ').trim();
    if (!fullName || !companyId || !user) return;
    setQuickSaving(true);
    try {
      const data = { name: fullName, vorname: quickCustVorname.trim(), nachname: quickCustNachname.trim(), email: quickCustEmail.trim(), telefon: quickCustPhone.trim(), adresse: quickCustAdresse.trim(), notizen: quickCustNotes.trim(), companyId, createdBy: user.uid, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, 'customers'), data);
      const newC = { id: ref.id, ...data };
      setLocalCustomers((prev: any[]) => prev.some((c: any) => c.id === ref.id) ? prev : [...prev, newC]);
      update('kunde', fullName);
      setShowAddCustomer(false);
      setQuickCustVorname(''); setQuickCustNachname(''); setQuickCustEmail(''); setQuickCustPhone(''); setQuickCustAdresse(''); setQuickCustNotes('');
    } finally { setQuickSaving(false); }
  }

  async function addQuickEmployee() {
    const fullName = [quickEmpVorname, quickEmpNachname].filter(Boolean).join(' ').trim();
    const rate = parseFloat(quickRate);
    if (!fullName || !companyId || !user) return;
    if (!rate || rate <= 0) { alert('Bitte gib einen gültigen Stundenlohn ein.'); return; }
    // Mitarbeiter-Limit des Plans auch hier erzwingen (wie auf der Mitarbeiter-Seite)
    if (hasReachedLimit(company?.subscriptionPlan, 'employees', (employees || []).length)) {
      const limit = getPlanLimit(company?.subscriptionPlan, 'employees');
      alert(`Mitarbeiter-Limit erreicht. Dein Plan erlaubt maximal ${limit === Infinity ? 'unbegrenzt' : limit} Mitarbeiter. Bitte upgrade deinen Plan, um weitere anzulegen.`);
      return;
    }
    setQuickSaving(true);
    try {
      const data = {
        name: fullName,
        vorname: quickEmpVorname.trim(),
        nachname: quickEmpNachname.trim(),
        berufsfeld: quickBerufsfeld.trim(),
        email: quickEmail.trim(),
        telefon: quickPhone.trim(),
        stundenlohn: parseFloat(quickRate) || 0,
        companyId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'employees'), data);
      const newE = { id: ref.id, ...data };
      setLocalEmployees((prev: any[]) => prev.some((e: any) => e.id === ref.id) ? prev : [...prev, newE]);
      update('mitarbeiter', [...form.mitarbeiter, fullName]);
      setShowAddEmployee(false);
      setQuickEmpVorname(''); setQuickEmpNachname(''); setQuickRate(''); setQuickEmail(''); setQuickPhone(''); setQuickBerufsfeld('');
    } finally { setQuickSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 bg-black/30 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{editing ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
          <button onClick={() => { setDirty(false); onClose(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Projekt */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Projekt <span className="text-red-400">*</span></label>
              <input value={form.projekt} onChange={e => update('projekt', e.target.value)} required placeholder="z.B. Webentwicklung"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>

            {/* Kunde mit Kacheln */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kunde <span className="text-red-400">*</span></label>
              {localCustomers.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-sm text-slate-500 mb-3">Keine Kunden vorhanden</p>
                  <button type="button" onClick={() => { setShowAddCustomer(true); setShowAddEmployee(false); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Kunden anlegen
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {localCustomers.map((c: any) => (
                    <button key={c.id} type="button" onClick={() => update('kunde', form.kunde === c.name ? '' : c.name)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-[0.95] flex items-center gap-2 ${
                        form.kunde === c.name
                          ? 'bg-teal-50 text-teal-700 border-teal-300 shadow-sm ring-1 ring-teal-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}>
                      {c.imageUrl?.startsWith('https://') || c.imageUrl?.startsWith('data:image/') ? (
                        <img src={c.imageUrl} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0 shadow-sm" />
                      ) : (
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: form.kunde === c.name ? '#0d9488' : '#94a3b8' }}>{c.name.charAt(0).toUpperCase()}</span>
                      )}
                      <span>{c.name}</span>
                      {form.kunde === c.name && (
                        <svg className="w-4 h-4 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setShowAddCustomer(true); setShowAddEmployee(false); }}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.95] transition-all flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Neu
                  </button>
                </div>
              )}
              {showAddCustomer && (
                <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                  <label className="block text-xs font-semibold text-teal-700 mb-1.5">Neuer Kunde</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input value={quickCustVorname} onChange={e => setQuickCustVorname(e.target.value)} placeholder="Vorname *"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickCustNachname} onChange={e => setQuickCustNachname(e.target.value)} placeholder="Name *"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickCustEmail} onChange={e => setQuickCustEmail(e.target.value)} placeholder="E-Mail"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickCustPhone} onChange={e => setQuickCustPhone(e.target.value)} placeholder="Telefon"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickCustAdresse} onChange={e => setQuickCustAdresse(e.target.value)} placeholder="Adresse"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <textarea value={quickCustNotes} onChange={e => setQuickCustNotes(e.target.value)} placeholder="Notizen" rows={2}
                    className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all resize-none mb-2" />
                  <div className="flex gap-2">
                    <button type="button" onClick={addQuickCustomer} disabled={quickSaving || !quickCustVorname.trim() || !quickCustNachname.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white active:scale-[0.95] transition-all">
                      {quickSaving ? '...' : 'Hinzufügen'}
                    </button>
                    <button type="button" onClick={() => { setShowAddCustomer(false); setQuickCustVorname(''); setQuickCustNachname(''); setQuickCustEmail(''); setQuickCustPhone(''); setQuickCustAdresse(''); setQuickCustNotes(''); }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 active:scale-[0.95] transition-all">
                      Abbr.
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Datum & Status */}
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Datum <span className="text-red-400">*</span></label>
              <button type="button" onClick={() => setShowCalendar(!showCalendar)}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all hover:border-slate-300">
                <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className={form.datum ? 'text-slate-900 font-medium' : 'text-slate-400'}>{form.datum || 'Datum wählen'}</span>
              </button>
              {showCalendar && (
                <CalendarPopover value={form.datum} onChange={v => update('datum', v)} onClose={() => setShowCalendar(false)} />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <div className="flex gap-1 h-[42px] items-center">
                {['Geplant', 'In Bearbeitung', 'Abgeschlossen'].map(s => (
                  <button key={s} type="button" onClick={() => update('status', s)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-[0.95] flex-1 ${
                      form.status === s
                        ? s === 'Geplant' ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm'
                          : s === 'In Bearbeitung' ? 'bg-blue-100 text-blue-800 border border-blue-300 shadow-sm'
                          : 'bg-green-100 text-green-800 border border-green-300 shadow-sm'
                        : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'
                    }`}>
                    {s === 'In Bearbeitung' ? 'Laufend' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Umsatz & Stunden */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Umsatz (€)</label>
              <input type="number" step="0.01" min="0" value={form.umsatz} onChange={e => update('umsatz', e.target.value)} placeholder="0,00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stunden</label>
              <input type="number" step="0.5" min="0" value={form.stunden} onChange={e => update('stunden', e.target.value)} placeholder="0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>

            {/* Mitarbeiter mit Quick-Add */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mitarbeiter</label>
              <div className="flex flex-wrap gap-1.5">
                {localEmployees.map((e: any) => {
                  const sel = form.mitarbeiter.includes(e.name);
                  return (
                    <button key={e.id} type="button" onClick={() => update('mitarbeiter', sel ? form.mitarbeiter.filter((n: string) => n !== e.name) : [...form.mitarbeiter, e.name])}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-[0.95] flex items-center gap-1.5 ${
                        sel ? 'bg-teal-50 text-teal-700 border-teal-200 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      {e.imageUrl?.startsWith('https://') || e.imageUrl?.startsWith('data:image/') ? (
                        <img src={e.imageUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                          style={{ backgroundColor: sel ? '#0d9488' : '#94a3b8' }}>{e.name.charAt(0).toUpperCase()}</span>
                      )}
                      {e.name}
                      <span className="text-[10px] opacity-60">{parseFloat(e.stundenlohn || 0).toFixed(0)}€/h</span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => { setShowAddEmployee(true); setShowAddCustomer(false); }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.95] transition-all flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Mitarbeiter
                </button>
                {localEmployees.length === 0 && !showAddEmployee && (
                  <p className="text-xs text-slate-400 w-full">Keine Mitarbeiter vorhanden</p>
                )}
              </div>
              {showAddEmployee && (
                <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                  <label className="block text-xs font-semibold text-teal-700 mb-1.5">Neuer Mitarbeiter</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input value={quickEmpVorname} onChange={e => setQuickEmpVorname(e.target.value)} placeholder="Vorname *"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickEmpNachname} onChange={e => setQuickEmpNachname(e.target.value)} placeholder="Name *"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickBerufsfeld} onChange={e => setQuickBerufsfeld(e.target.value)} placeholder="Berufsfeld"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickRate} onChange={e => setQuickRate(e.target.value)} type="number" step="0.01" min="0" placeholder="€/h *" required
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickEmail} onChange={e => setQuickEmail(e.target.value)} placeholder="E-Mail"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickPhone} onChange={e => setQuickPhone(e.target.value)} placeholder="Telefon"
                      className="px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={addQuickEmployee} disabled={quickSaving || !quickEmpVorname.trim() || !quickEmpNachname.trim() || !quickRate.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white active:scale-[0.95] transition-all">
                      {quickSaving ? '...' : 'Hinzufügen'}
                    </button>
                    <button type="button" onClick={() => { setShowAddEmployee(false); setQuickEmpVorname(''); setQuickEmpNachname(''); setQuickRate(''); setQuickEmail(''); setQuickPhone(''); setQuickBerufsfeld(''); }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 active:scale-[0.95] transition-all">
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stundenlohn (Auto) & Team-Größe */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stundenlohn (€)</label>
              <div className="w-full px-3.5 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800 font-bold flex items-center gap-2">
                <span>{autoStundenlohn.toFixed(2)} €/h</span>
                {form.mitarbeiter.length > 1 && <span className="text-[10px] text-teal-500 font-normal">(∑ {form.mitarbeiter.length} MA)</span>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Team-Größe</label>
              <div className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-semibold flex items-center gap-2">
                <span>{teamSize}</span>
                <span className="text-slate-400 font-normal text-xs">Mitarbeiter</span>
              </div>
            </div>
          </div>

          {/* Vorkalkulation / Smart Pricing */}
          {hours > 0 || revenue > 0 ? (
            <div className="border-t border-slate-100 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vorab-Kalkulation</span>
                <span className="flex-1 border-t border-slate-100" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border"
                  style={{ color: getGradeColor(grade), backgroundColor: getGradeBg(grade), borderColor: getGradeColor(grade) + '33' }}>
                  {grade}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kosten</p>
                  <p className="text-sm font-bold text-slate-800">{hours.toFixed(1)}h × {rate.toFixed(2)}€ = {formatCurrency(cost)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Umsatz</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(revenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{profit >= 0 ? 'Gewinn' : 'Verlust'}</p>
                  <p className={`text-sm font-extrabold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>
                    {formatCurrency(profit)}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Marge</p>
                  <p className={`text-sm font-extrabold ${margin >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </div>
              {/* Smart Pricing Insight */}
              {revenue > 0 && hours === 0 ? (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <p className="text-xs text-blue-700 font-semibold">Umsatz erfasst – Stunden fehlen für Marge</p>
                  </div>
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <ul className="space-y-0.5">
                      {rootCause!.suggestions!.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-blue-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-blue-600 mt-1 font-medium">
                      Bei Ø-Dauer: {formatCurrency(rootCause!.requiredPrice!)} nötig für 20% Marge
                    </p>
                  )}
                </div>
              ) : revenue > 0 && profit >= 0 && margin >= 20 ? (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p className="text-xs text-green-700 font-semibold">Gesunder Termin mit {margin.toFixed(1)}% Marge ({grade}-Bewertung)</p>
                </div>
              ) : revenue > 0 && profit >= 0 && margin < 20 && margin >= 10 ? (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <p className="text-xs text-amber-700 font-semibold">Marge ausbaufähig ({grade})</p>
                  </div>
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rootCause!.suggestions!.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-amber-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-amber-600 mt-1 font-medium">
                      Empfohlener Preis für 20% Marge: {formatCurrency(rootCause!.requiredPrice!)}
                    </p>
                  )}
                </div>
              ) : revenue > 0 && profit >= 0 && margin < 10 ? (
                <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <p className="text-xs text-rose-700 font-semibold">Niedrige Marge ({grade}) – fast kein Gewinn</p>
                  </div>
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rootCause!.suggestions!.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-rose-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">
                      Empfohlener Preis für 20% Marge: {formatCurrency(rootCause!.requiredPrice!)}
                    </p>
                  )}
                </div>
              ) : revenue > 0 && profit < 0 && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <p className="text-xs text-red-700 font-semibold">Verlust – Kosten übersteigen Umsatz ({grade})</p>
                  </div>
                  {(rootCause?.reasons?.length ?? 0) > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rootCause!.reasons!.map((r: string, i: number) => (
                        <li key={i} className="text-[11px] text-red-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-100">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">Empfehlungen</p>
                      <ul className="space-y-0.5">
                        {rootCause!.suggestions!.map((s: string, i: number) => (
                          <li key={i} className="text-[11px] text-red-600 flex items-start gap-1.5">
                            <span className="mt-0.5">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-red-600 mt-2 pt-2 border-t border-red-100 font-medium">
                      Nötiger Preis für 20% Marge: {formatCurrency(rootCause!.requiredPrice!)}
                    </p>
                  )}
                </div>
              )}
              {revenue === 0 && hours === 0 && (
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <p className="text-xs text-slate-500 font-semibold">Daten eingeben für Kalkulation</p>
                </div>
              )}
            </div>
          ) : null}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => { setDirty(false); onClose(); }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">
              Abbrechen
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Termin anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
