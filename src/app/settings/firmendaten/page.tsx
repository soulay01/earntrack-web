'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CheckCircle } from 'lucide-react';

export default function CompanyDataSettingsPage() {
  const { user, loading, company, companyId, refresh } = useData();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: '', owner: '', street: '', zip: '', city: '', email: '', phone: '', website: '', taxId: '', bankName: '', iban: '', bic: '',
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '', owner: company.owner || '', street: company.street || '', zip: company.zip || '',
        city: company.city || '', email: company.email || '', phone: company.phone || '', website: company.website || '',
        taxId: company.taxId || '', bankName: company.bankName || '', iban: company.iban || '', bic: company.bic || '',
      });
    }
  }, [company]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return <PageSkeleton variant="form" maxWidth="max-w-2xl" />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !companyId) return;
    if (!form.name.trim()) {
      console.warn('Company name is empty – aborting save');
      alert('Bitte fülle alle Pflichtfelder aus');
      setSaving(false); return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), { ...form, updatedAt: serverTimestamp() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await refresh();
    } finally { setSaving(false); }
  }

  function update(field: string, value: string) {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  }

  const input = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-6">
          <div>
            <a href="/settings" onClick={e => { e.preventDefault(); router.push('/settings'); }} className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Firmendaten</h1>
            <p className="text-slate-500 text-sm mt-1">Adresse, Steuernummer &amp; Bankdaten</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
            <form onSubmit={save} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Firmenname</label>
                <input value={form.name} onChange={e => update('name', e.target.value)} className={input} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Straße</label>
                  <input value={form.street} onChange={e => update('street', e.target.value)} className={input} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">PLZ</label>
                  <input value={form.zip} onChange={e => update('zip', e.target.value)} className={input} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Stadt</label>
                <input value={form.city} onChange={e => update('city', e.target.value)} className={input} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">E-Mail</label>
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={input} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Telefon</label>
                  <input value={form.phone} onChange={e => update('phone', e.target.value)} className={input} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Steuernummer</label>
                <input value={form.taxId} onChange={e => update('taxId', e.target.value)} className={input} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Inhaber / Geschäftsführer</label>
                <input value={form.owner} onChange={e => update('owner', e.target.value)} className={input} placeholder="z.B. Max Mustermann" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Website</label>
                <input value={form.website} onChange={e => update('website', e.target.value)} className={input} placeholder="z.B. https://earntrack.de" />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Bankdaten</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Bank</label>
                    <input value={form.bankName} onChange={e => update('bankName', e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">IBAN</label>
                    <input value={form.iban} onChange={e => update('iban', e.target.value)} className={input} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">BIC</label>
                  <input value={form.bic} onChange={e => update('bic', e.target.value)} className={input} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {saved && <p className="text-sm text-green-600 font-bold"><CheckCircle className="inline w-4 h-4 text-green-500 mr-1" /> Gespeichert</p>}
                <div className="ml-auto" />
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg flex items-center gap-2">
                  {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Speichern
                </button>
              </div>
            </form>
          </div>

          {/* Ganz unten, bewusst dezent: Account löschen */}
          <div className="flex justify-center pt-2 pb-6">
            <a
              href="/settings/delete-account"
              onClick={e => { e.preventDefault(); router.push('/settings/delete-account'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-300 hover:text-red-500 transition-colors font-medium"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Account löschen
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
