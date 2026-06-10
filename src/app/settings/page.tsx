'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { useIsAdmin } from '@/lib/useIsAdmin';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Bell, BarChart3, CheckCircle, Wrench, FileText, Key, CreditCard, Package } from 'lucide-react';

export default function SettingsPage() {
  const { user, loading, logout, company, companyId, refresh } = useData();
  const { isAdmin } = useIsAdmin();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

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
  if (loading || !user) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !companyId) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
        reader.readAsDataURL(file);
      });
      await Promise.all([
        updateDoc(doc(db, 'users', user.uid), { photoURL: dataUrl }),
        setDoc(doc(db, 'companies', companyId), { profileImage: dataUrl }, { merge: true }),
      ]);
      await refresh();
    } catch (e) {
      console.error('photo upload error:', e);
      alert('Fehler beim Hochladen: ' + (e as Error).message);
    }
    finally { setUploadingPhoto(false); if (photoInputRef.current) photoInputRef.current.value = ''; }
  };

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

  const navCards = [
    { href: '/settings/invoice-template', label: 'Rechnungsvorlage', desc: 'Layout, Bankdaten & Steuersatz anpassen', icon: <FileText className="w-6 h-6 text-teal-600" />, gradient: 'from-teal-50 to-emerald-50', border: 'border-teal-200' },
    { href: '/settings/employee-credentials', label: 'Mitarbeiter-Zugangsdaten', desc: 'E-Mails & Passwörter aller Accounts', icon: <Key className="w-6 h-6 text-blue-600" />, gradient: 'from-blue-50 to-indigo-50', border: 'border-blue-200' },
    { href: '/settings/notifications', label: 'Benachrichtigungen', desc: 'Push-Benachrichtigungen im Browser', icon: <Bell className="w-6 h-6 text-amber-600" />, gradient: 'from-amber-50 to-orange-50', border: 'border-amber-200' },
    { href: '/settings/subscription', label: 'Abonnement & Vertrag', desc: 'Plan verwalten & Zahlungsdetails', icon: <CreditCard className="w-6 h-6 text-purple-600" />, gradient: 'from-purple-50 to-violet-50', border: 'border-purple-200' },
    { href: '/settings/export', label: 'Datenexport', desc: 'Alle Daten als CSV/PDF exportieren', icon: <BarChart3 className="w-6 h-6 text-slate-600" />, gradient: 'from-slate-50 to-slate-100', border: 'border-slate-200' },
    { href: '/settings/articles', label: 'Artikelkatalog', desc: 'Datanorm-Import & Artikel verwalten', icon: <Package className="w-6 h-6 text-green-600" />, gradient: 'from-green-50 to-teal-50', border: 'border-green-200' },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-8">
          <div className="mb-2 ">
            <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Einstellungen</h1>
            <p className="text-slate-500 text-sm mt-1">Account, Firma &amp; System</p>
          </div>

          {/* Nav Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ">
            {navCards.map((card, i) => (
              <a key={card.href} href={card.href} onClick={e => { e.preventDefault(); router.push(card.href); }}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden "
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className={`h-1.5 w-full bg-gradient-to-r ${card.gradient}`} />
                <div className="p-5">
                  <span className="mb-3 block">{card.icon}</span>
                  <p className="text-slate-900 font-bold text-base group-hover:text-teal-700 transition-colors">{card.label}</p>
                  <p className="text-slate-400 text-xs mt-1">{card.desc}</p>
                </div>
              </a>
            ))}
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 p-6 ">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                {company?.profileImage && (company.profileImage.startsWith('https://') || company.profileImage.startsWith('data:image/')) ? (
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
                <input value={form.name} onChange={e => update('name', e.target.value)}
                  className="text-slate-900 font-bold text-lg bg-transparent border-b border-transparent focus:border-teal-500 outline-none transition-all w-full" />
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ">
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
                {saved && <p className="text-sm text-green-600 font-bold "><CheckCircle className="inline w-4 h-4 text-green-500 mr-1" /> Gespeichert</p>}
                <div className="ml-auto" />
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg flex items-center gap-2">
                  {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Speichern
                </button>
              </div>
            </form>
          </div>

          {/* Account löschen */}
          <div className="flex justify-center pt-4">
            <a
              href="/settings/delete-account"
              onClick={e => { e.preventDefault(); router.push('/settings/delete-account'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-300 hover:text-red-500 transition-colors font-medium"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Account löschen
            </a>
          </div>

          {isAdmin && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-5 space-y-4">
              <p className="text-xs font-bold text-red-500 tracking-widest uppercase text-center"><Wrench className="inline w-4 h-4 mr-1" /> Entwickler-Konsole</p>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Aktueller Status</p>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${company?.subscriptionStatus === 'active' ? 'bg-green-100 text-green-700' : company?.subscriptionStatus === 'trial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {company?.subscriptionStatus || 'nicht gesetzt'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${company?.subscriptionPlan === 'solo' ? 'bg-slate-200 text-slate-700' : company?.subscriptionPlan === 'team' ? 'bg-teal-100 text-teal-700' : company?.subscriptionPlan === 'business' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-400'}`}>
                    {company?.subscriptionPlan || 'kein Plan'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Plan wechseln</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'solo', label: 'Solo', color: 'slate' },
                    { id: 'team', label: 'Team', color: 'teal' },
                    { id: 'business', label: 'Business', color: 'purple' },
                  ].map(p => {
                    const active = company?.subscriptionPlan === p.id;
                    const colorMap: Record<string, string> = {
                      slate: 'from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 border-slate-300',
                      teal: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 border-teal-300',
                      purple: 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 border-purple-300',
                    };
                    return (
                      <button
                        key={p.id}
                        disabled={active}
                        onClick={async () => {
                          if (!companyId) return;
                          try {
                            await updateDoc(doc(db, 'companies', companyId), {
                              subscriptionPlan: p.id,
                              subscriptionStatus: 'active',
                            });
                            await refresh();
                            alert(`Plan gewechselt zu ${p.label}!`);
                          } catch (err: any) {
                            alert('Fehler: ' + err.message);
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${colorMap[p.color]} transition-all active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}
                      >
                        {p.label}
                        {active && ' ✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const idToken = await user.getIdToken();
                      const res = await fetch('/api/test-activate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({ reset: true }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        refresh();
                        alert('Pro-Status entfernt! Kein Plan mehr gesetzt. Seite neu laden.');
                      } else {
                        alert('Fehler: ' + (data.error || 'Unbekannt'));
                      }
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-all font-semibold active:scale-[0.95]"
                >
                  Pro-Status entfernen
                </button>
                <button
                  onClick={async () => {
                    if (!companyId) return;
                    try {
                      const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                      await updateDoc(doc(db, 'companies', companyId), {
                        subscriptionPlan: 'trial',
                        subscriptionStatus: 'trial',
                        trialEndsAt: future,
                      });
                      refresh();
                      alert('Testphase zurückgesetzt (14 Tage ab jetzt)!');
                    } catch (err: any) {
                      alert('Fehler: ' + err.message);
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-all font-semibold active:scale-[0.95]"
                >
                  Testphase zurücksetzen
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
