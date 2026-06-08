'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit } from '@/lib/plans';
import UpgradeModal from '@/components/UpgradeModal';
import { compressImageToDataUrl } from '@/lib/utils';

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981','#f97316','#6366f1'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

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
  if (loading || !user) return null;

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
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 ">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Kunden</h1>
              <p className="text-slate-500 text-sm mt-1">{raw.length} Kunden</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Kunde
            </button>
          </div>

          <div className="relative mb-6 ">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Kunden durchsuchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all shadow-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
            {customers.map((c, i) => (
              <div key={c.id}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden "
                style={{ animationDelay: `${i * 50}ms` }}>
                {/* Color accent */}
                <div className="h-1.5 w-full" style={{ backgroundColor: colorFor(c.name) }} />

                <div className="p-5 text-center">
                  {/* Avatar */}
                  {c.imageUrl?.startsWith('https://') || c.imageUrl?.startsWith('data:image/') ? (
                    <img src={c.imageUrl} alt="" className="w-16 h-16 mx-auto mb-3 rounded-2xl object-cover shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm"
                      style={{ backgroundColor: colorFor(c.name) }}>
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}

                  <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-teal-700 transition-colors">{c.name || 'Unbekannt'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{c.email || 'Keine E-Mail'}</p>
                  {c.adresse && <p className="text-xs text-slate-400 mb-3 truncate">{c.adresse}</p>}
                  {!c.adresse && <p className="text-xs text-slate-400 mb-3">&nbsp;</p>}

                  {/* Contact badges */}
                  <div className="flex items-center justify-center gap-2">
                    {c.telefon && (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        {c.telefon}
                      </div>
                    )}
                    {c.notizen && (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.63 2.09 14.98 14.98 0 0 0 3.76 7.2 14.98 14.98 0 0 0 8.3 16.98"/></svg>
                        Notizen
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex border-t border-slate-100 divide-x divide-slate-100 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <button onClick={() => { setEditing(c); setShowModal(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all active:scale-[0.95]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Bearbeiten
                  </button>
                  <button onClick={() => setDeleting(c.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-red-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-[0.95]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    Löschen
                  </button>
                </div>
              </div>
            ))}
            {customers.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01"/></svg>
                </div>
                <p className="text-slate-500 text-base mb-4">{search ? 'Keine Ergebnisse' : 'Noch keine Kunden'}</p>
                {!search && (
                  <button onClick={() => { setEditing(null); setShowModal(true); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Kunden anlegen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <CustomerModal editing={editing} saving={saving} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} user={user} companyId={companyId} />
      )}

      {deleting && (() => {
        const c = raw.find(c => c.id === deleting);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 ">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 ">
            <h3 className="text-lg font-bold text-slate-900">Kunden "{c?.name || 'Unbekannt'}" löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
              <button onClick={() => remove(deleting)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.97] text-white transition-all shadow-sm">Löschen</button>
            </div>
          </div>
        </div>
      )})()}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dismissable
        title="Kunden-Limit erreicht"
        description="In der Testphase kannst du maximal 3 Kunden anlegen. Wähle einen Plan, um unbegrenzt Kunden zu verwalten."
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fullName = [form.vorname, form.nachname].filter(Boolean).join(' ').trim();
    if (!fullName) { alert('Bitte gib Vor- und Nachnamen ein.'); return; }
    await onSave({
      name: fullName, vorname: form.vorname, nachname: form.nachname,
      email: form.email, telefon: form.telefon, adresse: form.adresse, notizen: form.notizen,
      imageUrl: photoPreview || '',
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] pb-8 bg-black/30 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{editing ? 'Kunden bearbeiten' : 'Neuer Kunde'}</h2>
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
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="text-xs font-semibold text-teal-600 hover:text-teal-800 disabled:text-slate-300 active:scale-[0.97] transition-all">
                {uploading ? 'Wird hochgeladen...' : photoPreview ? 'Foto ändern' : 'Foto hinzufügen'}
              </button>
              {photoPreview && (
                <button type="button" onClick={() => setPhotoPreview('')}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 active:scale-[0.97] transition-all">
                  Entfernen
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Vorname</label>
              <input value={form.vorname} onChange={e => update('vorname', e.target.value)} required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name</label>
              <input value={form.nachname} onChange={e => update('nachname', e.target.value)} required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
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
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adresse</label>
            <input value={form.adresse} onChange={e => update('adresse', e.target.value)} placeholder="z.B. Musterstr. 12, 12345 Berlin"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notizen</label>
            <textarea rows={3} value={form.notizen} onChange={e => update('notizen', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Kunden anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
