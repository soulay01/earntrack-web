'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { applyActionCode, signOut } from 'firebase/auth';
import { confirmPasswordReset } from '@/lib/auth';

function getParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  return p.get(key);
}

export default function EmailVerifiedPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'form' | 'sign-in' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionType, setActionType] = useState<'verifyEmail' | 'resetPassword' | 'other'>('other');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwError, setPwError] = useState('');
  const [resetting, setResetting] = useState(false);

  function validatePw(p: string): string | null {
    if (p.length < 8) return 'Mindestens 8 Zeichen';
    if (!/[A-Z]/.test(p)) return 'Mindestens 1 Großbuchstabe';
    if (!/[0-9]/.test(p)) return 'Mindestens 1 Zahl';
    if (!/[!@#$%^&*(),.?":{}|<>_\-]/.test(p)) return 'Mindestens 1 Sonderzeichen';
    return null;
  }

  useEffect(() => {
    const oobCode = getParam('oobCode');
    const mode = getParam('mode');
    setActionType(mode === 'resetPassword' ? 'resetPassword' : mode === 'verifyEmail' ? 'verifyEmail' : 'other');

    if (mode === 'verifyEmail' && oobCode) {
      applyActionCode(auth, oobCode)
        .then(async () => {
          try { await signOut(auth); } catch {}
          setStatus('sign-in');
        })
        .catch((e: any) => {
          if (e.code === 'auth/invalid-action-code') {
            setErrorMsg('Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an.');
          } else {
            setErrorMsg('Fehler: ' + (e.message || 'Unbekannter Fehler'));
          }
          setStatus('error');
        });
    } else if (mode === 'resetPassword' && oobCode) {
      setStatus('form');
    } else if (mode === 'resetPassword') {
      setErrorMsg('Ungültiger Link. Bitte fordere einen neuen an.');
      setStatus('error');
    } else {
      (async () => {
        if (auth.currentUser?.emailVerified) {
          router.replace('/dashboard');
          return;
        }
        try { await signOut(auth); } catch {}
        setStatus('sign-in');
      })();
    }
  }, [router]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    const oobCode = getParam('oobCode');
    if (!oobCode) return;
    if (newPw !== newPw2) { setPwError('Passwörter stimmen nicht überein'); return; }
    const pwErr = validatePw(newPw);
    if (pwErr) { setPwError(pwErr); return; }
    setPwError('');
    setResetting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPw);
      setStatus('sign-in');
    } catch (e: any) {
      setPwError(e.message || 'Fehler beim Zurücksetzen');
    }
    setResetting(false);
  }

  const title = actionType === 'verifyEmail' ? 'E-Mail bestätigt!' : actionType === 'resetPassword' ? 'Neues Passwort' : 'E-Mail bestätigt!';
  const message = actionType === 'verifyEmail'
    ? 'Deine E-Mail-Adresse wurde erfolgreich bestätigt.'
    : actionType === 'resetPassword'
    ? 'Dein Passwort wurde zurückgesetzt. Du kannst dich jetzt anmelden.'
    : 'Deine E-Mail-Adresse wurde erfolgreich bestätigt.';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">{title}</h1>
        {status === 'checking' && (
          <p className="text-slate-500 text-sm mb-6">Bestätigung wird durchgeführt…</p>
        )}
        {status === 'form' && (
          <p className="text-slate-500 text-sm mb-6">Gib dein neues Passwort ein.</p>
        )}
        {status === 'sign-in' && (
          <p className="text-slate-500 text-sm mb-6">{message}</p>
        )}
        {status === 'error' && (
          <p className="text-red-500 text-sm mb-6">{errorMsg}</p>
        )}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 space-y-4">
          {status === 'checking' ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
              Bestätigung läuft…
            </div>
          ) : status === 'form' ? (
            <form onSubmit={handleReset} className="space-y-4">
              <input
                type="password" placeholder="Neues Passwort" value={newPw} required autoFocus
                onChange={e => setNewPw(e.target.value)}
                className="w-full px-4 py-3 bg-emerald-50/50 border-2 border-emerald-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-emerald-400 focus:bg-white transition-all"
              />
              <input
                type="password" placeholder="Passwort bestätigen" value={newPw2} required
                onChange={e => setNewPw2(e.target.value)}
                className="w-full px-4 py-3 bg-emerald-50/50 border-2 border-emerald-200 rounded-2xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-emerald-400 focus:bg-white transition-all"
              />
              <p className="text-xs text-slate-400 text-left">Großbuchstabe, Zahl, Sonderzeichen, mind. 8 Zeichen</p>
              {pwError && <p className="text-red-600 text-sm text-left">{pwError}</p>}
              <button type="submit" disabled={resetting}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.97] disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm shadow-lg flex items-center justify-center gap-2">
                {resetting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Passwort zurücksetzen
              </button>
            </form>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {status === 'error'
                  ? 'Bitte versuche es erneut oder fordere eine neue Bestätigungs-E-Mail an.'
                  : 'Du kannst dich jetzt mit deiner E-Mail und deinem Passwort anmelden.'}
              </p>
              <button onClick={() => router.push('/login')}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.97] text-white font-bold rounded-xl transition-all text-sm shadow-lg">
                Zum Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
