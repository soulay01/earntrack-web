'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SettingsPage() {
  const { user, loading, logout, company, companyId, refresh } = useData();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: '',
    street: '',
    zip: '',
    city: '',
    email: '',
    phone: '',
    taxId: '',
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        street: company.street || '',
        zip: company.zip || '',
        city: company.city || '',
        email: company.email || '',
        phone: company.phone || '',
        taxId: company.taxId || '',
      });
    }
  }, [company]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !companyId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        ...form,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      refresh();
    } finally { setSaving(false); }
  }

  function update(field: string, value: any) {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  }

  const input = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all';

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-2xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Einstellungen</h1>
            <p className="text-slate-500 text-sm mt-1">Account &amp; Firmendaten</p>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6 animate-slideUp">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white text-xl font-bold shadow-sm">
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-slate-900 font-semibold text-lg">{user.email?.split('@')[0]}</p>
                <p className="text-slate-400 text-sm">{user.email}</p>
              </div>
            </div>
            <div className="h-px bg-slate-200 mb-4" />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-slate-400 text-xs font-medium mb-1">Rolle</p>
                <p className="text-slate-900 text-sm font-medium">Owner</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-slate-400 text-xs font-medium mb-1">User-ID</p>
                <p className="text-slate-400 text-sm font-mono">{user.uid.slice(0, 12)}...</p>
              </div>
            </div>
            <button onClick={() => logout()} className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-semibold transition-all flex items-center gap-2.5 border border-red-200 hover:border-red-300">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Abmelden
            </button>
          </div>

          {/* Company Form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Firmendaten</h2>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Firmenname</label>
                <input value={form.name} onChange={e => update('name', e.target.value)}
                  className={input} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Straße</label>
                  <input value={form.street} onChange={e => update('street', e.target.value)}
                    className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">PLZ</label>
                  <input value={form.zip} onChange={e => update('zip', e.target.value)}
                    className={input} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Stadt</label>
                <input value={form.city} onChange={e => update('city', e.target.value)}
                  className={input} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">E-Mail</label>
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
                    className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
                  <input value={form.phone} onChange={e => update('phone', e.target.value)}
                    className={input} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Steuernummer</label>
                <input value={form.taxId} onChange={e => update('taxId', e.target.value)}
                  className={input} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {saved && <p className="text-sm text-green-600 font-medium">Gespeichert</p>}
                <div className="ml-auto" />
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg transition-all text-sm shadow-sm flex items-center gap-2">
                  {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
