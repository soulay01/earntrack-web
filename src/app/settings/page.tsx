'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage, auth } from '@/lib/firebase';

export default function SettingsPage() {
  const { user, loading, logout, company, companyId, refresh, refreshUser } = useData();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', street: '', zip: '', city: '', email: '', phone: '', taxId: '',
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '', street: company.street || '', zip: company.zip || '',
        city: company.city || '', email: company.email || '', phone: company.phone || '',
        taxId: company.taxId || '',
      });
    }
  }, [company]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !companyId) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `profiles/${user.uid}/avatar.${ext}`;
      const storageRef = ref(storage, path);
      const snap = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snap.ref);
      await Promise.all([
        updateProfile(user, { photoURL: url }),
        updateDoc(doc(db, 'users', user.uid), { photoURL: url }),
        setDoc(doc(db, 'companies', companyId), { profileImage: url }, { merge: true }),
      ]);
      await refresh();
    } catch (e) {
      console.error('Photo upload error:', e);
      alert('Fehler beim Hochladen: ' + (e as Error).message);
    }
    finally { setUploadingPhoto(false); if (photoInputRef.current) photoInputRef.current.value = ''; }
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !companyId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), { ...form, updatedAt: serverTimestamp() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      refresh();
    } finally { setSaving(false); }
  }

  function update(field: string, value: string) {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  }

  const input = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  const navCards = [
    { href: '/settings/invoice-template', label: 'Rechnungsvorlage', desc: 'Layout, Bankdaten & Steuersatz anpassen', icon: '📄', gradient: 'from-teal-50 to-emerald-50', border: 'border-teal-200' },
    { href: '/settings/employee-credentials', label: 'Mitarbeiter-Zugangsdaten', desc: 'E-Mails & Passwörter aller Accounts', icon: '🔑', gradient: 'from-blue-50 to-indigo-50', border: 'border-blue-200' },
    { href: '/settings/notifications', label: 'Benachrichtigungen', desc: 'E-Mail- und Push-Benachrichtigungen', icon: '🔔', gradient: 'from-amber-50 to-orange-50', border: 'border-amber-200' },
    { href: '/settings/subscription', label: 'Abonnement & Vertrag', desc: 'Plan verwalten & Zahlungsdetails', icon: '💳', gradient: 'from-purple-50 to-violet-50', border: 'border-purple-200' },
    { href: '/settings/export', label: 'Datencxport', desc: 'Alle Daten als CSV/PDF exportieren', icon: '📊', gradient: 'from-slate-50 to-slate-100', border: 'border-slate-200' },
    { href: '/settings/articles', label: 'Artikelkatalog', desc: 'Datanorm-Import & Artikel verwalten', icon: '📦', gradient: 'from-green-50 to-teal-50', border: 'border-green-200' },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-2xl mx-auto space-y-8">
          <div className="mb-2 animate-fadeIn">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Einstellungen</h1>
            <p className="text-slate-500 text-sm mt-1">Account, Firma &amp; System</p>
          </div>

          {/* Nav Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slideUp">
            {navCards.map((card, i) => (
              <a key={card.href} href={card.href} onClick={e => { e.preventDefault(); router.push(card.href); }}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp"
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className={`h-1.5 w-full bg-gradient-to-r ${card.gradient}`} />
                <div className="p-5">
                  <span className="text-2xl mb-3 block">{card.icon}</span>
                  <p className="text-slate-900 font-bold text-base group-hover:text-teal-700 transition-colors">{card.label}</p>
                  <p className="text-slate-400 text-xs mt-1">{card.desc}</p>
                </div>
              </a>
            ))}
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6 animate-slideUp">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                {company?.profileImage ? (
                  <img src={company.profileImage} alt="" className="w-16 h-16 rounded-2xl object-cover shadow-lg shadow-teal-200/30" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-teal-200/30">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                  <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                {uploadingPhoto && (
                  <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-slate-900 font-bold text-lg">{user.email?.split('@')[0]}</p>
                <p className="text-slate-400 text-sm">{user.email}</p>
              </div>
            </div>
            <div className="h-px bg-slate-100 mb-4" />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-200">
                <p className="text-slate-400 text-xs font-semibold mb-1">Rolle</p>
                <p className="text-slate-900 text-sm font-bold">Owner</p>
              </div>
              <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-200">
                <p className="text-slate-400 text-xs font-semibold mb-1">User-ID</p>
                <p className="text-slate-400 text-sm font-mono">{user.uid.slice(0, 12)}...</p>
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            <button onClick={() => logout()}
              className="px-5 py-2.5 bg-gradient-to-br from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 text-red-600 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 border border-red-200 hover:border-red-300 active:scale-[0.97] shadow-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Abmelden
            </button>
          </div>

          {/* Company Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50">
              <h2 className="text-lg font-bold text-slate-900">Firmendaten</h2>
            </div>
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
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {saved && <p className="text-sm text-green-600 font-bold animate-slideUp">✅ Gespeichert</p>}
                <div className="ml-auto" />
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg flex items-center gap-2">
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
