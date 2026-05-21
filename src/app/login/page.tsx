'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginEmail, registerEmail, loginGoogle, resetPw } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [reg, setReg] = useState(false);
  const [err, setErr] = useState('');
  const [load, setLoad] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoad(true);
    try {
      if (reg) await registerEmail(email, pw);
      else await loginEmail(email, pw);
      router.push('/dashboard');
    } catch (x: any) {
      const c = x.code;
      if (c === 'auth/invalid-credential') setErr('E-Mail oder Passwort falsch');
      else if (c === 'auth/user-not-found') setErr('Benutzer nicht gefunden');
      else if (c === 'auth/wrong-password') setErr('Falsches Passwort');
      else if (c === 'auth/email-already-in-use') setErr('E-Mail bereits registriert');
      else if (c === 'auth/weak-password') setErr('Passwort zu schwach (min. 6 Zeichen)');
      else if (c === 'auth/invalid-email') setErr('Ungültige E-Mail');
      else if (c === 'auth/too-many-requests') setErr('Zu viele Versuche, bitte später probieren');
      else setErr(x.message || 'Fehler');
    } finally { setLoad(false); }
  }

  async function google() {
    try { setErr(''); await loginGoogle(); router.push('/dashboard'); }
    catch { setErr('Google-Login fehlgeschlagen'); }
  }

  async function reset() {
    if (!email) { setErr('Bitte E-Mail eingeben'); return; }
    try { setErr(''); await resetPw(email); setSent(true); }
    catch { setErr('Fehler beim Zurücksetzen'); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-teal-50 via-white to-emerald-50">
      <div className="w-full max-w-sm animate-slideUp">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-teal-600 to-teal-400 shadow-lg shadow-teal-200 flex items-center justify-center">
            <span className="text-white text-xl font-black">E</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">EarnTrack</h1>
          <p className="text-slate-500 text-sm mt-1">Melde dich an, um fortzufahren</p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-7">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-Mail-Adresse</label>
              <input type="email" placeholder="name@beispiel.de" value={email} required autoComplete="email"
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all"
              />
            </div>
            {!sent && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Passwort</label>
                <input type="password" placeholder="••••••••" value={pw} required autoComplete={reg ? 'new-password' : 'current-password'}
                  onChange={e => setPw(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all"
                />
              </div>
            )}
            {sent && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3.5">
                <p className="text-green-700 text-sm font-medium">Link gesendet</p>
                <p className="text-green-600 text-xs mt-0.5">Prüfe dein E-Mail-Postfach.</p>
              </div>
            )}
            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3.5">
                <p className="text-red-700 text-sm">{err}</p>
              </div>
            )}
            <button type="submit" disabled={load}
              className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-all text-sm shadow-sm flex items-center justify-center gap-2"
            >
              {load && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {reg ? 'Konto erstellen' : 'Anmelden'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center"><span className="px-3 bg-white text-slate-400 text-xs">oder</span></div>
            </div>

            <button type="button" onClick={google}
              className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium rounded-lg transition-all text-sm flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
              Mit Google anmelden
            </button>

            <div className="flex flex-col items-center gap-2 pt-1">
              <button type="button" onClick={() => { setReg(!reg); setErr(''); setSent(false); }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium transition-colors"
              >
                {reg ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren'}
              </button>
              {!reg && !sent && (
                <button type="button" onClick={reset} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                  Passwort vergessen?
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
