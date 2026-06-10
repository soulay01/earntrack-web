'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { registerEmail, logout } from '@/lib/auth';
import { useData } from '@/app/Provider';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

function authMsg(x: any): string {
  const m: Record<string, string> = {
    'auth/invalid-credential': 'E-Mail oder Passwort stimmen nicht',
    'auth/email-already-in-use': 'E-Mail wird bereits verwendet',
    'auth/weak-password': 'Passwort zu schwach – mindestens 6 Zeichen',
    'auth/invalid-email': 'Ungültige E-Mail-Adresse',
    'auth/too-many-requests': 'Zu viele Versuche – bitte später probieren',
    'auth/network-request-failed': 'Netzwerkfehler – Internetverbindung prüfen',
    'auth/operation-not-allowed': 'Diese Anmeldung ist nicht aktiviert',
  };
  return m[x.code] || x.message?.replace(/^Firebase:\s*/i, '') || 'Ein Fehler ist aufgetreten';
}

export default function DemoPage() {
  const [form, setForm] = useState({ name: '', companyName: '', email: '', phone: '', address: '', password: '' });
  const [err, setErr] = useState('');
  const [load, setLoad] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const [consent, setConsent] = useState(false);
  const router = useRouter();
  const { user, loading } = useData();

  // Prevent the effect from logging out during registration
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (loading || isSubmittingRef.current || done) return;
    if (!user) return;
    if (user.emailVerified) router.push('/settings/subscription');
    else logout().catch(() => {});
  }, [user, loading, router, done]);

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function validatePw(p: string): string | null {
    if (p.length < 8) return 'Mindestens 8 Zeichen';
    if (!/[A-Z]/.test(p)) return 'Mindestens 1 Großbuchstabe';
    if (!/[0-9]/.test(p)) return 'Mindestens 1 Zahl';
    if (!/[!@#$%^&*(),.?":{}|<>_\-]/.test(p)) return 'Mindestens 1 Sonderzeichen';
    return null;
  }

  function validatePhone(p: string): string | null {
    if (!p || !p.trim()) return 'Telefonnummer ist erforderlich';
    const cleaned = p.replace(/[\s\-\(\)\/\.]/g, '');
    if (!/^(\+49|0)/.test(cleaned)) return 'Telefonnummer muss mit +49 oder 0 beginnen (z.B. +49 30 12345678)';
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 9) return 'Telefonnummer zu kurz – mindestens 9 Ziffern';
    if (digits.length > 15) return 'Telefonnummer zu lang – maximal 15 Ziffern';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');

    const fields = [
      { val: form.name, msg: 'Bitte gib deinen Namen ein' },
      { val: form.companyName, msg: 'Bitte gib deinen Unternehmensnamen ein' },
      { val: form.phone, msg: null, validate: validatePhone },
      { val: form.address, msg: 'Bitte gib deine Adresse ein' },
    ];
    for (const f of fields) {
      if (f.validate) {
        const e = f.validate(f.val);
        if (e) { setErr(e); return; }
      } else if (!f.val || !f.val.trim()) {
        setErr(f.msg!);
        return;
      }
    }

    const pwErr = validatePw(form.password);
    if (pwErr) { setErr(pwErr); return; }
    if (!consent) { setErr('Bitte stimme der Datenschutzerklärung zu'); return; }

    setLoad(true);
    isSubmittingRef.current = true;
    try {
      const cred = await registerEmail(form.email, form.password);
      const uid = cred.user?.uid;
      if (!uid) throw new Error('Keine UID nach Registrierung');

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      await setDoc(doc(db, 'demo_signups', uid), {
        uid,
        name: form.name,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        status: 'pending',
        source: 'website',
        trialEndsAt: trialEnd,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'users', uid), {
        email: form.email,
        companyId: uid,
        role: 'owner',
        displayName: form.name,
        createdAt: serverTimestamp(),
        emailVerified: false,
      });

      await setDoc(doc(db, 'companies', uid), {
        id: uid,
        name: form.companyName || form.name,
        createdAt: serverTimestamp(),
        onboardingSeen: false,
        trialEndsAt: trialEnd,
        subscriptionStatus: 'trial',
        subscriptionPlan: 'trial',
      });

      setDone(true);
    } catch (x: any) {
      setErr(authMsg(x));
    } finally {
      setLoad(false);
      isSubmittingRef.current = false;
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <div className="w-full max-w-md text-center animate-zoomIn">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-xl shadow-teal-200">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">Fast geschafft!</h1>
          <p className="text-slate-500 mb-6">
            Wir haben eine Bestätigungs-E-Mail an <strong className="text-teal-600">{form.email}</strong> gesendet.<br />
            Klicke auf den Link in der E-Mail, um dein Konto zu aktivieren und die 14-tägige Testphase zu starten.
          </p>
          <div className="bg-white rounded-2xl border border-teal-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500 mb-3">E-Mail nicht erhalten?</p>
            <button
              onClick={async () => {
                try {
                  if (auth.currentUser) {
                    const { sendEmailVerification } = await import('firebase/auth');
                    await sendEmailVerification(auth.currentUser);
                    setErr('E-Mail erneut gesendet!');
                  }
                } catch { setErr('Fehler beim Senden'); }
              }}
              className="text-teal-600 font-semibold text-sm hover:text-teal-700 transition-all"
            >
              Erneut senden
            </button>
          </div>
          {err && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-green-700 text-sm font-medium">{err}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden bg-slate-50">
      <div className="absolute inset-0 bg-gradient-to-br from-teal-50/50 via-white to-emerald-50/50" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[120px] top-[-10%] left-[-5%] bg-[radial-gradient(circle,#99f6e4,transparent_70%)]" />
        <div className="absolute w-[400px] h-[400px] rounded-full blur-[100px] bottom-[-8%] right-[-5%] bg-[radial-gradient(circle,#5eead4,transparent_70%)]" />
      </div>

      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8 animate-zoomIn">
          <img src="/logo.png?v=2" alt="EarnTrack" className="w-16 h-16 mx-auto mb-4 rounded-2xl object-cover shadow-xl shadow-teal-200/50 ring-4 ring-teal-100" />
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">14 Tage kostenlos testen</h1>
          <p className="text-slate-400 text-sm mt-1">Keine Zahlungsdaten erforderlich. Jederzeit kündbar.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-teal-100 p-7 animate-zoomIn">
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 1 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-400'}`}>1</div>
            <div className={`h-px flex-1 transition-all ${step >= 2 ? 'bg-teal-400' : 'bg-slate-200'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 2 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-400'}`}>2</div>
          </div>

          <form onSubmit={submit}>
            {step === 1 && (
              <div className="space-y-4">
                <div className="animate-stagger-1 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Name *</label>
                  <input type="text" placeholder="Max Mustermann" value={form.name} required
                    onChange={e => update('name', e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all" />
                </div>
                <div className="animate-stagger-2 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Unternehmen *</label>
                  <input type="text" placeholder="Mustermann GmbH" value={form.companyName} required
                    onChange={e => update('companyName', e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all" />
                </div>
                <div className="animate-stagger-3 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">E-Mail-Adresse *</label>
                  <input type="email" placeholder="max@mustermann.de" value={form.email} required autoComplete="email"
                    onChange={e => update('email', e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all" />
                </div>
                <button type="button" onClick={() => setStep(2)}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all text-sm shadow-lg shadow-teal-200/50 animate-stagger-4 opacity-0">
                  Weiter
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="animate-stagger-1 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Telefon *</label>
                  <input type="tel" placeholder="+49 30 12345678" value={form.phone} required
                    onChange={e => update('phone', e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all" />
                </div>
                <div className="animate-stagger-2 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Adresse *</label>
                  <input type="text" placeholder="Musterstr. 1, 12345 Berlin" value={form.address} required
                    onChange={e => update('address', e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all" />
                </div>
                <div className="animate-stagger-3 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Passwort *</label>
                  <input type="password" placeholder="8+ Zeichen, Großbuchstabe, Zahl, Sonderzeichen" value={form.password} required autoComplete="new-password"
                    onChange={e => update('password', e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all" />
                </div>
                <div className="animate-stagger-3 opacity-0">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={consent}
                      onChange={e => setConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm text-slate-500 leading-relaxed">
                      Ich habe die <a href="/datenschutz" target="_blank" className="text-teal-600 underline hover:text-teal-700">Datenschutzerklärung</a> gelesen und stimme der Verarbeitung meiner Daten zur Bereitstellung der App zu. *
                    </span>
                  </label>
                </div>
                {err && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 animate-stagger-3 opacity-0">
                    <p className="text-red-700 text-sm font-medium">{err}</p>
                  </div>
                )}
                <div className="flex gap-3 pt-1 animate-stagger-4 opacity-0">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 py-3.5 bg-white hover:bg-slate-50 active:scale-[0.98] border-2 border-slate-200 text-slate-600 font-bold rounded-2xl transition-all text-sm">
                    Zurück
                  </button>
                  <button type="submit" disabled={load}
                    className="flex-1 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] disabled:opacity-40 text-white font-bold rounded-2xl transition-all text-sm shadow-lg shadow-teal-200/50 flex items-center justify-center gap-2">
                    {load && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Kostenlos testen
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="text-xs text-slate-400 text-center mt-6">
            Mit der Registrierung akzeptierst du unsere <a href="/agb" className="text-teal-600 underline">AGB</a> und <a href="/datenschutz" className="text-teal-600 underline">Datenschutzerklärung</a>.
          </p>
        </div>

        <p className="text-center mt-4 text-sm text-slate-400">
          Bereits registriert? <a href="/login" className="text-teal-600 font-semibold hover:text-teal-700 transition-all">Anmelden</a>
        </p>
      </div>
    </div>
  );
}
