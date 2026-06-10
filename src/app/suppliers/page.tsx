'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit, getPlanLimit } from '@/lib/plans';
import UpgradeModal from '@/components/UpgradeModal';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const SUPPLY_CATEGORIES = [
  { value: 'material', label: 'Material' },
  { value: 'werkzeug', label: 'Werkzeug' },
  { value: 'subunternehmer', label: 'Subunternehmer' },
  { value: 'miete', label: 'Miete' },
  { value: 'strom', label: 'Strom/Energie' },
  { value: 'fahrzeug', label: 'Fahrzeug' },
  { value: 'buro', label: 'Büro/Verwaltung' },
  { value: 'versicherung', label: 'Versicherung' },
  { value: 'entsorgung', label: 'Entsorgung' },
  { value: 'it', label: 'IT/Software' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const COUNTRIES = [
  'Deutschland', 'Österreich', 'Schweiz', 'Belgien', 'Niederlande',
  'Frankreich', 'Italien', 'Spanien', 'Polen', 'Tschechien',
  'Dänemark', 'Luxemburg', 'Großbritannien', 'Andere',
];

export default function SuppliersPage() {
  const { user, loading, suppliers: raw, companyId, company, refresh } = useData();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const suppliers = useMemo(() => {
    if (!search) return raw;
    const q = search.toLowerCase();
    return raw.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.supplierNo || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q)
    );
  }, [raw, search]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  async function save(form: any) {
    if (!user || !companyId) return;
    if (!editing && hasReachedLimit(company?.subscriptionPlan, 'suppliers', raw.length)) {
      setShowUpgrade(true); return;
    }
    if (!form.name?.trim()) {
      console.warn('Supplier name is empty – aborting save');
      alert('Bitte fülle alle Pflichtfelder aus');
      setSaving(false); return;
    }
    setSaving(true);
    try {
      if (editing) {
        const data = { ...form, companyId, updatedAt: serverTimestamp() };
        await updateDoc(doc(db, 'suppliers', editing.id), data);
      } else {
        const data = { ...form, companyId, createdAt: serverTimestamp() };
        await addDoc(collection(db, 'suppliers'), data);
      }
      setShowModal(false); setEditing(null);
      refresh();
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (e) {
      alert('Fehler beim Löschen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
      console.error('delete supplier error:', e);
    }
    setDeleting(null); refresh();
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Lieferanten</h1>
              <p className="text-slate-500 text-sm mt-1">{raw.length} Lieferanten</p>
            </div>
            <button onClick={() => { if (hasReachedLimit(company?.subscriptionPlan, 'suppliers', raw.length)) { setShowUpgrade(true); return; } setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Lieferant
            </button>
          </div>

          <div className="relative mb-6">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Lieferanten durchsuchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all shadow-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
            {suppliers.map((s, i) => (
              <div key={s.id}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className="h-1.5 w-full" style={{ backgroundColor: colorFor(s.name) }} />
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-sm shrink-0"
                      style={{ backgroundColor: colorFor(s.name) }}>
                      {(s.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-teal-700 transition-colors">{s.name || 'Unbekannt'}</h3>
                      {s.supplierNo && <p className="text-[11px] text-slate-400 font-mono">#{s.supplierNo}</p>}
                    </div>
                  </div>

                  {s.description && (
                    <p className="text-xs text-slate-500 mb-3 line-clamp-2">{s.description}</p>
                  )}

                  {s.supplies && s.supplies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {s.supplies.map(cat => {
                        const label = SUPPLY_CATEGORIES.find(c => c.value === cat)?.label || cat;
                        return (
                          <span key={cat}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {s.city && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {s.city}
                      </span>
                    )}
                    {s.email && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        {s.email}
                      </span>
                    )}
                    {s.telefon && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        {s.telefon}
                      </span>
                    )}
                    {s.iban && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M2 10h20"/></svg>
                        IBAN
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex border-t border-slate-100 divide-x divide-slate-100">
                  <button onClick={() => { setEditing(s); setShowModal(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all active:scale-[0.95]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Bearbeiten
                  </button>
                  <button onClick={() => setDeleting(s.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-red-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-[0.95]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    Löschen
                  </button>
                </div>
              </div>
            ))}
            {suppliers.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" transform="rotate(45 12 12)"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                </div>
                <p className="text-slate-500 text-base mb-4">{search ? 'Keine Ergebnisse' : 'Noch keine Lieferanten'}</p>
                {!search && (
                  <button onClick={() => { setEditing(null); setShowModal(true); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Lieferanten anlegen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <SupplierModal editing={editing} saving={saving} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900">Lieferanten löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
              <button onClick={() => remove(deleting)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.97] text-white transition-all shadow-sm">Löschen</button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dismissable
        title="Lieferanten-Limit erreicht"
        description={`Dein aktueller Plan erlaubt maximal ${getPlanLimit(company?.subscriptionPlan, 'suppliers') === Infinity ? 'unbegrenzt' : getPlanLimit(company?.subscriptionPlan, 'suppliers')} Lieferanten. Wähle einen höheren Plan für mehr.`}
      />
    </div>
  );
}

function SupplierModal({ editing, saving, onSave, onClose }: any) {
  const [form, setForm] = useState({
    name: editing?.name || '',
    description: editing?.description || '',
    supplierNo: editing?.supplierNo || '',
    creditorNo: editing?.creditorNo || '',
    street: editing?.street || '',
    houseNumber: editing?.houseNumber || '',
    zip: editing?.zip || '',
    city: editing?.city || '',
    country: editing?.country || 'Deutschland',
    contactPerson: editing?.contactPerson || '',
    email: editing?.email || '',
    telefon: editing?.telefon || '',
    iban: editing?.iban || '',
    bic: editing?.bic || '',
    paymentTerms: editing?.paymentTerms || '',
    supplies: editing?.supplies || [],
  });

  function update(field: string, value: any) { setForm((prev: any) => ({ ...prev, [field]: value })); }

  function toggleSupply(cat: string) {
    const current: string[] = form.supplies || [];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    update('supplies', next);
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
    if (!form.name.trim()) { alert('Bitte gib einen Lieferantennamen ein.'); return; }
    const phoneErr = validatePhone(form.telefon);
    if (phoneErr) { alert(phoneErr); return; }
    await onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 bg-black/30 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{editing ? 'Lieferanten bearbeiten' : 'Neuer Lieferant'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Name (required) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lieferantenname *</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required placeholder="z.B. Baustoff GmbH"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Beschreibung</label>
            <textarea rows={2} value={form.description} onChange={e => update('description', e.target.value)} placeholder="z.B. Großhändler für Sanitärbedarf"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all resize-none" />
          </div>

          {/* Supplies - tile selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Liefert</label>
            <div className="flex flex-wrap gap-1.5">
              {SUPPLY_CATEGORIES.map(cat => {
                const active = (form.supplies || []).includes(cat.value);
                return (
                  <button key={cat.value} type="button" onClick={() => toggleSupply(cat.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300 hover:text-teal-600'
                    }`}>
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supplier numbers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lieferantennummer</label>
              <input value={form.supplierNo} onChange={e => update('supplierNo', e.target.value)} placeholder="z.B. L-10042"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kreditorennummer</label>
              <input value={form.creditorNo} onChange={e => update('creditorNo', e.target.value)} placeholder="z.B. KR-0815"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
          </div>

          {/* Address */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Adresse</p>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="col-span-2">
                <input value={form.street} onChange={e => update('street', e.target.value)} placeholder="z.B. Industriestraße"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <input value={form.houseNumber} onChange={e => update('houseNumber', e.target.value)} placeholder="z.B. 42"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <input value={form.zip} onChange={e => update('zip', e.target.value)} placeholder="z.B. 12345"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <input value={form.city} onChange={e => update('city', e.target.value)} placeholder="z.B. Berlin"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <select value={form.country} onChange={e => update('country', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all">
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Kontaktdaten</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Ansprechpartner</label>
                <input value={form.contactPerson} onChange={e => update('contactPerson', e.target.value)} placeholder="z.B. Max Mustermann"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Telefon</label>
                <input value={form.telefon} onChange={e => update('telefon', e.target.value)} placeholder="z.B. +49 30 12345678"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">E-Mail</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="z.B. info@baustoff-gmbh.de"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
          </div>

          {/* Payment */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Zahlungsdaten</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">IBAN</label>
                <input value={form.iban} onChange={e => update('iban', e.target.value)} placeholder="z.B. DE12 1234 5678 9012 3456 78"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">BIC</label>
                <input value={form.bic} onChange={e => update('bic', e.target.value)} placeholder="z.B. DEUTDEFFXXX"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Zahlungsbedingungen</label>
              <input value={form.paymentTerms} onChange={e => update('paymentTerms', e.target.value)} placeholder="z.B. 30 Tage netto"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Lieferanten anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
