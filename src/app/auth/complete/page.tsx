'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';

const LOGIN_URL = process.env.NEXT_PUBLIC_LOGIN_URL || 'https://app.earntrack.de/login';

function CompleteInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setErrorMsg('Keine Session-ID gefunden.');
      return;
    }

    let cancelled = false;
    let unsubAuth = () => {};
    let unsubCompany = () => {};
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const res = await fetch('/api/verify-stripe-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (!data.verified) {
          if (!cancelled) {
            setStatus('error');
            setErrorMsg('Zahlung konnte nicht verifiziert werden. Bitte wende dich an den Support.');
          }
          return;
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg('Verbindungsfehler. Bitte versuche es erneut.');
        }
        return;
      }

      if (cancelled) return;

      unsubAuth = onAuthStateChanged(auth, async u => {
        if (!u || cancelled) return;
        const uid = u.uid;
        const companyRef = doc(db, 'companies', uid);

        const snap = await getDoc(companyRef);
        if (snap.exists()) {
          const s = snap.data().subscriptionStatus;
          if (s === 'active' || s === 'trialing') {
            if (!cancelled) setStatus('success');
            return;
          }
        }

        if (cancelled) return;

        unsubCompany = onSnapshot(companyRef, snap => {
          if (!snap.exists() || cancelled) return;
          const s = snap.data().subscriptionStatus;
          if (s === 'active' || s === 'trialing') {
            setStatus('success');
            unsubCompany();
          }
        });

        timeoutId = setTimeout(() => {
          unsubCompany();
          if (!cancelled) {
            setStatus('error');
            setErrorMsg('Die Zahlung konnte nicht bestätigt werden. Bitte wende dich an den Support.');
          }
        }, 30000);
      });
    })();

    return () => {
      cancelled = true;
      unsubAuth();
      unsubCompany();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [sessionId]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-teal-200 border-t-teal-500 animate-spin" />
          <h1 className="text-2xl font-bold text-slate-900">Zahlung wird verarbeitet...</h1>
          <p className="text-slate-500 mt-2">Dein Account wird eingerichtet.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-red-50 via-white to-red-50">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">Zahlung fehlgeschlagen</h1>
          <p className="text-slate-500 mb-6">{errorMsg || 'Bitte versuche es erneut oder kontaktiere den Support.'}</p>
          <a href="/settings/subscription"
            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:from-teal-700 hover:to-emerald-700 active:scale-[0.97] transition-all">
            Erneut versuchen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-teal-50 via-white to-emerald-50">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-xl shadow-teal-200">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">Zahlung erfolgreich!</h1>
        <p className="text-slate-500 mb-6">
          Dein Abonnement ist aktiv. Wir haben dir eine E-Mail mit weiteren Schritten gesendet.<br />
          Bitte überprüfe dein E-Mail-Postfach.
        </p>
        <a href={LOGIN_URL}
          className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:from-teal-700 hover:to-emerald-700 active:scale-[0.97] transition-all">
          Zur App
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </a>
      </div>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <div className="w-16 h-16 rounded-full border-4 border-teal-200 border-t-teal-500 animate-spin" />
      </div>
    }>
      <CompleteInner />
    </Suspense>
  );
}
