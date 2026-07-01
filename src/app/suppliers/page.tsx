'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit, getPlanLimit } from '@/lib/plans';
import UpgradeModal from '@/components/UpgradeModal';
import { Plus, Search, Pencil, Trash2, X } from 'lucide-react';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  btnDanger: 'px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

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
  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-7xl" />;

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
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Lieferanten</h1>
              <p className="text-slate-500 text-sm mt-0.5">{raw.length} {raw.length === 1 ? 'Lieferant' : 'Lieferanten'}</p>
            </div>
            <button onClick={() => { if (hasReachedLimit(company?.subscriptionPlan, 'suppliers', raw.length)) { setShowUpgrade(true); return; } setEditing(null); setShowModal(true); }}
              className={ui.btnPrimary}>
              <Plus className="w-4 h-4" />
              Neuer Lieferant
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Suchen nach Name, Nummer, E-Mail, Ort …" value={search} onChange={e => setSearch(e.target.value)}
              className={`${ui.input} pl-9`} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_88px] gap-4 px-4 py-2.5 border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <span>Lieferant</span>
              <span>Liefert</span>
              <span>Kontakt</span>
              <span className="text-right">Aktionen</span>
            </div>
            <div className="divide-y divide-slate-100">
              {suppliers.map(s => (
                <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_88px] md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_88px] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center shrink-0">
                      {(s.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{s.name || 'Unbekannt'}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[s.supplierNo && `#${s.supplierNo}`, s.city].filter(Boolean).join(' · ') || s.description || '–'}
                      </p>
                    </div>
                  </div>
                  <div className="hidden md:flex flex-wrap gap-1 min-w-0">
                    {(s.supplies || []).slice(0, 3).map(cat => {
                      const label = SUPPLY_CATEGORIES.find(c => c.value === cat)?.label || cat;
                      return (
                        <span key={cat} className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                          {label}
                        </span>
                      );
                    })}
                    {(s.supplies || []).length > 3 && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-500">
                        +{(s.supplies || []).length - 3}
                      </span>
                    )}
                    {(!s.supplies || s.supplies.length === 0) && <span className="text-sm text-slate-400">–</span>}
                  </div>
                  <div className="hidden md:block min-w-0">
                    <p className="text-sm text-slate-600 truncate">{s.email || s.telefon || '–'}</p>
                    {s.email && s.telefon && <p className="text-xs text-slate-500 truncate">{s.telefon}</p>}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setEditing(s); setShowModal(true); }} title="Bearbeiten"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleting(s.id)} title="Löschen"
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {suppliers.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">{search ? 'Keine Ergebnisse' : 'Noch keine Lieferanten'}</p>
                  <p className="text-sm text-slate-500 mb-5">{search ? 'Passe deine Suche an.' : 'Lege deinen ersten Lieferanten an, um loszulegen.'}</p>
                  {!search && (
                    <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
                      <Plus className="w-4 h-4" />
                      Ersten Lieferanten anlegen
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showModal && (
        <SupplierModal editing={editing} saving={saving} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900">Lieferanten löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setDeleting(null)} className={ui.btnGhost}>Abbrechen</button>
              <button onClick={() => remove(deleting)} className={ui.btnDanger}>Löschen</button>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 bg-slate-900/40 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{editing ? 'Lieferanten bearbeiten' : 'Neuer Lieferant'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Name (required) */}
          <div>
            <label className={ui.label}>Lieferantenname *</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required placeholder="z.B. Baustoff GmbH"
              className={ui.input} />
          </div>

          {/* Description */}
          <div>
            <label className={ui.label}>Beschreibung</label>
            <textarea rows={2} value={form.description} onChange={e => update('description', e.target.value)} placeholder="z.B. Großhändler für Sanitärbedarf"
              className={`${ui.input} resize-none`} />
          </div>

          {/* Supplies - tile selector */}
          <div>
            <label className="block text-[13px] font-medium text-slate-900 mb-2">Liefert</label>
            <div className="flex flex-wrap gap-1.5">
              {SUPPLY_CATEGORIES.map(cat => {
                const active = (form.supplies || []).includes(cat.value);
                return (
                  <button key={cat.value} type="button" onClick={() => toggleSupply(cat.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-teal-50 text-teal-800 border-teal-300'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
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
              <label className={ui.label}>Lieferantennummer</label>
              <input value={form.supplierNo} onChange={e => update('supplierNo', e.target.value)} placeholder="z.B. L-10042"
                className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Kreditorennummer</label>
              <input value={form.creditorNo} onChange={e => update('creditorNo', e.target.value)} placeholder="z.B. KR-0815"
                className={ui.input} />
            </div>
          </div>

          {/* Address */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 mb-2">Adresse</p>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="col-span-2">
                <input value={form.street} onChange={e => update('street', e.target.value)} placeholder="z.B. Industriestraße"
                  className={ui.input} />
              </div>
              <div>
                <input value={form.houseNumber} onChange={e => update('houseNumber', e.target.value)} placeholder="z.B. 42"
                  className={ui.input} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <input value={form.zip} onChange={e => update('zip', e.target.value)} placeholder="z.B. 12345"
                  className={ui.input} />
              </div>
              <div>
                <input value={form.city} onChange={e => update('city', e.target.value)} placeholder="z.B. Berlin"
                  className={ui.input} />
              </div>
              <div>
                <select value={form.country} onChange={e => update('country', e.target.value)}
                  className={ui.input}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 mb-2">Kontaktdaten</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ui.label}>Ansprechpartner</label>
                <input value={form.contactPerson} onChange={e => update('contactPerson', e.target.value)} placeholder="z.B. Max Mustermann"
                  className={ui.input} />
              </div>
              <div>
                <label className={ui.label}>Telefon</label>
                <input value={form.telefon} onChange={e => update('telefon', e.target.value)} placeholder="z.B. +49 30 12345678"
                  className={ui.input} />
              </div>
            </div>
            <div className="mt-3">
              <label className={ui.label}>E-Mail</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="z.B. info@baustoff-gmbh.de"
                className={ui.input} />
            </div>
          </div>

          {/* Payment */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 mb-2">Zahlungsdaten</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className={ui.label}>IBAN</label>
                <input value={form.iban} onChange={e => update('iban', e.target.value)} placeholder="z.B. DE12 1234 5678 9012 3456 78"
                  className={ui.input} />
              </div>
              <div>
                <label className={ui.label}>BIC</label>
                <input value={form.bic} onChange={e => update('bic', e.target.value)} placeholder="z.B. BELADEBEXXX"
                  className={ui.input} />
              </div>
            </div>
            <div>
              <label className={ui.label}>Zahlungsbedingungen</label>
              <input value={form.paymentTerms} onChange={e => update('paymentTerms', e.target.value)} placeholder="z.B. 30 Tage netto"
                className={ui.input} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className={ui.btnGhost}>Abbrechen</button>
            <button type="submit" disabled={saving} className={`${ui.btnPrimary} disabled:opacity-50`}>
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Lieferanten anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
