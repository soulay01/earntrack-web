'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit } from '@/lib/plans';
import UpgradeModal from '@/components/UpgradeModal';
import { compressImageToDataUrl } from '@/lib/utils';
import { Plus, Search, Pencil, Trash2, X, StickyNote } from 'lucide-react';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  btnDanger: 'px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

export default function CustomersPage() {
  const { user, loading, customers: raw, companyId, company, refresh } = useData();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const customers = useMemo(() => {
    if (!search) return raw;
    const q = search.toLowerCase();
    return (raw || []).filter(c => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.adresse || '').toLowerCase().includes(q) || (c.telefon || '').toLowerCase().includes(q));
  }, [raw, search]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-7xl" />;

  async function save(form: any) {
    if (!user || !companyId) return;
    if (!editing && hasReachedLimit(company?.subscriptionPlan, 'customers', raw.length)) {
      setShowUpgrade(true); return;
    }
    const fullName = [form.vorname, form.nachname].filter(Boolean).join(' ').trim();
    if (!fullName || !form.email?.trim()) {
      console.warn('Missing required fields (name/email) – aborting save', { fullName, email: form.email });
      alert('Bitte fülle alle Pflichtfelder aus');
      setSaving(false); return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { createdAt: _, ...rest } = form;
        await updateDoc(doc(db, 'customers', editing.id), { ...rest, companyId });
      } else {
        await addDoc(collection(db, 'customers'), { ...form, companyId, createdAt: serverTimestamp() });
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
      await deleteDoc(doc(db, 'customers', id));
    } catch (e) {
      alert('Fehler beim Löschen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
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
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Kunden</h1>
              <p className="text-slate-500 text-sm mt-0.5">{raw.length} {raw.length === 1 ? 'Kunde' : 'Kunden'}</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
              <Plus className="w-4 h-4" />
              Neuer Kunde
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Suchen nach Name, E-Mail, Adresse …" value={search} onChange={e => setSearch(e.target.value)}
              className={`${ui.input} pl-9`} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_88px] gap-4 px-4 py-2.5 border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <span>Kunde</span>
              <span>Telefon</span>
              <span>Adresse</span>
              <span className="text-right">Aktionen</span>
            </div>
            <div className="divide-y divide-slate-100">
              {customers.map(c => (
                <div key={c.id} onClick={() => router.push(`/customers/${c.id}`)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') router.push(`/customers/${c.id}`); }}
                  className="group grid grid-cols-[minmax(0,1fr)_88px] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_88px] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 min-w-0">
                    {c.imageUrl?.startsWith('https://') || c.imageUrl?.startsWith('data:image/') ? (
                      <img src={c.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-sm font-medium flex items-center justify-center shrink-0">
                        {(c.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                        {c.name || 'Unbekannt'}
                        {c.notizen && <StickyNote className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{c.email || 'Keine E-Mail'}</p>
                    </div>
                  </div>
                  <span className="hidden md:block text-sm text-slate-600 truncate">{c.telefon || '–'}</span>
                  <span className="hidden md:block text-sm text-slate-600 truncate">{c.adresse || '–'}</span>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={e => { e.stopPropagation(); setEditing(c); setShowModal(true); }} title="Bearbeiten"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setDeleting(c.id); }} title="Löschen"
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {customers.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">{search ? 'Keine Ergebnisse' : 'Noch keine Kunden'}</p>
                  <p className="text-sm text-slate-500 mb-5">{search ? 'Passe deine Suche an.' : 'Lege deinen ersten Kunden an, um loszulegen.'}</p>
                  {!search && (
                    <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
                      <Plus className="w-4 h-4" />
                      Ersten Kunden anlegen
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showModal && (
        <CustomerModal editing={editing} saving={saving} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} user={user} companyId={companyId} />
      )}

      {deleting && (() => {
        const c = raw.find(c => c.id === deleting);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900">Kunden "{c?.name || 'Unbekannt'}" löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setDeleting(null)} className={ui.btnGhost}>Abbrechen</button>
              <button onClick={() => remove(deleting)} className={ui.btnDanger}>Löschen</button>
            </div>
          </div>
        </div>
      )})()}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dismissable
        title="Kunden-Limit erreicht"
        description="Dein Plan unterstützt aktuell keine weiteren Kunden. Wähle einen höheren Plan, um unbegrenzt Kunden zu verwalten."
      />
    </div>
  );
}

function CustomerModal({ editing, saving, onSave, onClose, user, companyId }: any) {
  const [form, setForm] = useState({
    vorname: editing?.vorname || '',
    nachname: editing?.nachname || editing?.name || '',
    email: editing?.email || '',
    telefon: editing?.telefon || '',
    adresse: editing?.adresse || '',
    notizen: editing?.notizen || '',
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
    const phoneErr = validatePhone(form.telefon);
    if (phoneErr) { alert(phoneErr); return; }
    await onSave({
      name: fullName, vorname: form.vorname, nachname: form.nachname,
      email: form.email, telefon: form.telefon, adresse: form.adresse, notizen: form.notizen,
      imageUrl: photoPreview || '',
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] pb-8 bg-slate-900/40 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{editing ? 'Kunden bearbeiten' : 'Neuer Kunde'}</h2>
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
              <input value={form.vorname} onChange={e => update('vorname', e.target.value)} required className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Name</label>
              <input value={form.nachname} onChange={e => update('nachname', e.target.value)} required className={ui.input} />
            </div>
          </div>
          <div>
            <label className={ui.label}>E-Mail</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>Telefon</label>
            <input value={form.telefon} onChange={e => update('telefon', e.target.value)} placeholder="+49 30 12345678" className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>Adresse</label>
            <input value={form.adresse} onChange={e => update('adresse', e.target.value)} placeholder="z.B. Musterstr. 12, 12345 Berlin" className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>Notizen</label>
            <textarea rows={3} value={form.notizen} onChange={e => update('notizen', e.target.value)} className={`${ui.input} resize-none`} />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className={ui.btnGhost}>Abbrechen</button>
            <button type="submit" disabled={saving} className={`${ui.btnPrimary} disabled:opacity-50`}>
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Kunden anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
