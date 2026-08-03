'use client';

import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { compressImageToDataUrl } from '@/lib/utils';
import { validatePhone } from '@/components/CustomerModal';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

export default function EmployeeModal({ editing, saving, onSave, onClose, user, companyId }: any) {
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
            <input type="text" inputMode="email" autoComplete="email" value={form.email} onChange={e => update('email', e.target.value)}
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
