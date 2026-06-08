'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginEmail, loginGoogle, resetPw } from '@/lib/auth';
import { useData } from '@/app/Provider';
import { Suspense } from 'react';

function authMsg(x: any): string {
  if (!x || typeof x !== 'object') return 'Ein Fehler ist aufgetreten – bitte nochmal versuchen';
  const m: Record<string, string> = {
    'auth/invalid-credential': 'E-Mail oder Passwort stimmen nicht',
    'auth/user-not-found': 'Noch kein Konto mit dieser E-Mail',
    'auth/wrong-password': 'Falsches Passwort',
    'auth/email-already-in-use': 'E-Mail wird bereits verwendet',
    'auth/weak-password': 'Passwort zu schwach – mindestens 6 Zeichen',
    'auth/invalid-email': 'Ungültige E-Mail-Adresse',
    'auth/too-many-requests': 'Zu viele Versuche – bitte später probieren',
    'auth/email-not-verified': 'E-Mail noch nicht bestätigt – Postfach prüfen',
    'auth/popup-blocked': 'Popup blockiert – bitte Popups erlauben',
    'auth/argument-error': 'Google-Anmeldung fehlgeschlagen – bitte später probieren',
    'auth/popup-closed-by-user': 'Google-Fenster geschlossen – nochmal versuchen',
    'auth/network-request-failed': 'Netzwerkfehler – Internetverbindung prüfen',
    'auth/requires-recent-login': 'Bitte erneut anmelden und nochmal versuchen',
    'auth/operation-not-allowed': 'Diese Anmeldung ist nicht aktiviert',
    'auth/user-disabled': 'Konto wurde deaktiviert',
    'auth/timeout': 'Zeitüberschreitung – bitte nochmal versuchen',
    'auth/web-storage-unsupported': 'Browser wird nicht unterstützt – anderen verwenden',
  };
  return m[x.code] || x.message?.replace(/^Firebase:\s*/i, '') || 'Ein Fehler ist aufgetreten – bitte nochmal versuchen';
}

function LoginInner() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [reg, setReg] = useState(false);
  const [err, setErr] = useState('');
  const [load, setLoad] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();
  const { user, loading } = useData();
  const redirect = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    if (user?.emailVerified && !loading) router.push(redirect);
  }, [user, loading, router, redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoad(true);
    try {
      await loginEmail(email, pw);
      router.push(redirect);
    } catch (x: any) { setErr(authMsg(x)); }
    finally { setLoad(false); }
  }

  async function google() {
    setErr(''); setLoad(true);
    try { await loginGoogle(); }
    catch (x: any) { setErr(authMsg(x)); }
    finally { setLoad(false); }
  }

  async function reset() {
    if (!email) { setErr('Bitte E-Mail eingeben'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('Ungültige E-Mail-Adresse'); return; }
    try { setErr(''); await resetPw(email); setSent(true); }
    catch (x: any) { setErr(authMsg(x)); }
  }

  const isViolet = reg;

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden bg-slate-50">
      {/* Subtle background gradient */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{
          background: isViolet
            ? 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 40%, #fdf4ff 100%)'
            : 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 30%, #ecfdf5 100%)',
        }}
      />

      {/* Floating decorative orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] animate-drift"
          style={{
            top: '-10%', left: '-5%',
            background: isViolet
              ? 'radial-gradient(circle, #c4b5fd 0%, transparent 70%)'
              : 'radial-gradient(circle, #99f6e4 0%, transparent 70%)',
            transition: 'background 1s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] animate-driftSlow"
          style={{
            bottom: '-8%', right: '-5%',
            background: isViolet
              ? 'radial-gradient(circle, #e9d5ff 0%, transparent 70%)'
              : 'radial-gradient(circle, #5eead4 0%, transparent 70%)',
            transition: 'background 1s',
          }}
        />
        <div className="absolute top-1/4 left-[15%] w-2 h-2 rounded-full bg-slate-300/30 animate-float" />
        <div className="absolute top-2/3 right-[20%] w-2.5 h-2.5 rounded-full bg-slate-300/20 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/4 left-[25%] w-1.5 h-1.5 rounded-full bg-slate-300/30 animate-float" style={{ animationDelay: '0.5s' }} />
      </div>

      {/* Content */}
      <div className="w-full max-w-sm relative z-10" key={reg ? 'reg' : 'login'}>
        {/* Header */}
        <div className="text-center mb-8 animate-zoomIn">
          {reg ? (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg ring-4 transition-all duration-700 bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-violet-200/50 ring-violet-100">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">14 Tage kostenlos testen</h1>
              <p className="text-slate-400 text-sm mt-1">Keine Zahlungsdaten erforderlich. Jederzeit kündbar.</p>
            </>
          ) : (
            <>
              <img
                src="/logo.png?v=2" alt="EarnTrack"
                className="w-18 h-18 mx-auto mb-4 rounded-2xl object-cover shadow-xl shadow-teal-200/50 ring-4 ring-teal-100"
              />
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">EarnTrack</h1>
              <p className="text-slate-400 text-sm mt-1">Business-Management für Ihr Unternehmen</p>
            </>
          )}
        </div>

        {/* Card */}
        <div
          className="bg-white rounded-3xl shadow-xl border transition-all duration-500 animate-zoomIn"
          style={{
            borderColor: isViolet ? 'rgba(139, 92, 246, 0.15)' : 'rgba(20, 184, 166, 0.15)',
            boxShadow: isViolet
              ? '0 4px 30px rgba(139, 92, 246, 0.08), 0 1px 3px rgba(0,0,0,0.02)'
              : '0 4px 30px rgba(20, 184, 166, 0.08), 0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          {reg ? (
            <div className="p-7">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500" />
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">14-Tage-Demo</h2>
              </div>
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 rounded-2xl p-5 space-y-3 animate-stagger-1">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">✓</span>
                    <p className="text-sm text-slate-700"><strong className="text-slate-900">14 Tage</strong> unbegrenzt testen</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">✓</span>
                    <p className="text-sm text-slate-700"><strong className="text-slate-900">Keine Zahlungsdaten</strong> nötig</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">✓</span>
                    <p className="text-sm text-slate-700"><strong className="text-slate-900">Jederzeit kündbar</strong> – keine Risiko</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/demo')}
                  className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all text-sm shadow-lg shadow-violet-200/50 animate-stagger-2"
                >
                  Jetzt kostenlos testen
                </button>
                <button
                  type="button" onClick={() => { setReg(false); setErr(''); setSent(false); }}
                  className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium text-center transition-all py-2 animate-stagger-3"
                >
                  Bereits registriert? <span className="text-teal-600 font-semibold">Anmelden</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-7">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 rounded-full bg-gradient-to-b from-teal-500 to-emerald-500" />
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Anmeldung</h2>
              </div>
              <form onSubmit={submit} className="space-y-4">
                <div className="animate-stagger-1 opacity-0">
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">E-Mail-Adresse</label>
                  <input
                    type="email" placeholder="name@beispiel.de" value={email} required autoComplete="email"
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all"
                  />
                </div>
                {!sent && (
                  <div className="animate-stagger-2 opacity-0">
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">Passwort</label>
                    <input
                      type="password" placeholder="••••••••" value={pw} required autoComplete="current-password"
                      onChange={e => setPw(e.target.value)}
                      className="w-full px-4 py-3 bg-teal-50/50 border-2 border-teal-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-400 focus:bg-white transition-all"
                    />
                  </div>
                )}
                {sent && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 ">
                    <p className="text-green-700 text-sm font-bold">Link gesendet</p>
                    <p className="text-green-600 text-xs mt-0.5">Prüfe dein E-Mail-Postfach.</p>
                  </div>
                )}
                {err && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 ">
                    <p className="text-red-700 text-sm font-medium">{err}</p>
                  </div>
                )}
                <div className="animate-stagger-3 opacity-0 pt-1">
                  <button
                    type="submit" disabled={load}
                    className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] disabled:opacity-40 text-white font-bold rounded-2xl transition-all text-sm shadow-lg shadow-teal-200/50 flex items-center justify-center gap-2"
                  >
                    {load && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Anmelden
                  </button>
                </div>
              </form>
              <div className="mt-5 pt-5 border-t border-slate-100 animate-stagger-4 opacity-0">
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center"><span className="px-3 text-slate-400 text-xs bg-white">oder</span></div>
                </div>
                <button
                  type="button" onClick={google}
                  className="w-full py-3 bg-white hover:bg-teal-50 active:scale-[0.98] border-2 border-teal-200 text-teal-700 font-semibold rounded-2xl transition-all text-sm flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                  Mit Google anmelden
                </button>
                <div className="flex flex-col items-center gap-1 mt-4">
                  <button
                    type="button" onClick={() => { setReg(true); setErr(''); setSent(false); }}
                    className="text-sm text-slate-400 hover:text-slate-600 font-medium transition-all"
                  >
                    Noch kein Konto? <span className="text-teal-600 font-semibold">14 Tage testen</span>
                  </button>
                  {!sent && (
                    <button type="button" onClick={reset} className="text-sm text-slate-400 hover:text-slate-500 transition-all">
                      Passwort vergessen?
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <div className="w-16 h-16 rounded-full border-4 border-teal-200 border-t-teal-500 animate-spin" />
      </div>
    }>
      <LoginInner />
    </Suspense>
  );
}
