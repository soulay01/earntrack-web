'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

const UNITS = ['Stk', 'm', 'm²', 'kg', 'l', 'Paket', 'Rolle', 'Karton'];

export interface InventoryItem {
  id?: string;
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  quantity: number;
  minQuantity?: number;
  price?: number;
  location?: string;
  supplierId?: string;
  notizen?: string;
  companyId?: string;
}

export default function ItemModal({ editing, saving, suppliers, onSave, onClose }: { editing: InventoryItem | null; saving: boolean; suppliers: any[]; onSave: (f: Partial<InventoryItem>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name || '',
    sku: editing?.sku || '',
    category: editing?.category || '',
    unit: editing?.unit || 'Stk',
    quantity: editing?.quantity?.toString() || '0',
    minQuantity: editing?.minQuantity?.toString() || '',
    price: editing?.price?.toString() || '',
    location: editing?.location || '',
    supplierId: editing?.supplierId || '',
    notizen: editing?.notizen || '',
  });

  function update(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })); }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: form.name.trim(), sku: form.sku.trim(), category: form.category.trim(),
      unit: form.unit, quantity: parseFloat(form.quantity) || 0,
      minQuantity: parseFloat(form.minQuantity) || 0, price: parseFloat(form.price) || 0,
      location: form.location.trim(), supplierId: form.supplierId, notizen: form.notizen,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] pb-8 bg-slate-900/40 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{editing ? 'Artikel bearbeiten' : 'Neuer Artikel'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className={ui.label}>Artikelname *</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required placeholder="z.B. Akkuschrauber Makita" className={ui.input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>Artikelnummer</label>
              <input value={form.sku} onChange={e => update('sku', e.target.value)} placeholder="z.B. WZ-0042" className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Kategorie</label>
              <input value={form.category} onChange={e => update('category', e.target.value)} placeholder="z.B. Werkzeug" className={ui.input} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={ui.label}>{editing ? 'Bestand' : 'Anfangsbestand'}</label>
              <input type="number" step="any" min="0" value={form.quantity} onChange={e => update('quantity', e.target.value)} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Mindestbestand</label>
              <input type="number" step="any" min="0" value={form.minQuantity} onChange={e => update('minQuantity', e.target.value)} placeholder="0" className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Einheit</label>
              <select value={form.unit} onChange={e => update('unit', e.target.value)} className={ui.input}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>EK-Preis (€)</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={e => update('price', e.target.value)} placeholder="0,00" className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Lagerort</label>
              <input value={form.location} onChange={e => update('location', e.target.value)} placeholder="z.B. Regal A3 / Bus 1" className={ui.input} />
            </div>
          </div>
          <div>
            <label className={ui.label}>Lieferant</label>
            <select value={form.supplierId} onChange={e => update('supplierId', e.target.value)} className={ui.input}>
              <option value="">Kein Lieferant</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={ui.label}>Notizen</label>
            <textarea rows={2} value={form.notizen} onChange={e => update('notizen', e.target.value)} className={`${ui.input} resize-none`} />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className={ui.btnGhost}>Abbrechen</button>
            <button type="submit" disabled={saving} className={`${ui.btnPrimary} disabled:opacity-50`}>
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Artikel anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
