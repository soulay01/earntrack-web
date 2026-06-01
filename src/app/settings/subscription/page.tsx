'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import { getFirebase, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { PLAN_LIMITS, PLAN_LABELS, EXCESS_CLEANUP_DAYS } from '@/lib/plans';
import Sidebar from '@/components/Sidebar';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'soulaymanking@gmail.com').split(',');

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: '27,99 €',
    originalPrice: '39,99 €',
    desc: 'Ideal für Einzelunternehmer',
    limitLabel: 'Max. 2 Mitarbeiter',
    popular: false,
    features: [
      'Web-App & Mobile-App',
      'Projekte, Kunden, Termine',
      'Zeiterfassung & Pausen',
      'Rechnungen & Mahnwesen',
      'Angebote & Kalkulation',
      'Profit Score & Analysen',
      'E-Rechnung (ZUGFeRD)',
      'PDF-Export ohne Wasserzeichen',
      'Projektkommunikation',
      'Team-Optimierung',
      '3 Rechnungsvorlagen',
      'E-Mail-Support',
      'Mitarbeiter (max. 2)',
    ],
    gradient: 'from-slate-100 to-slate-200',
    badgeGradient: 'from-slate-600 to-slate-700',
    btnGradient: 'from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800',
    borderColor: 'border-slate-200',
    icon: '🛠️',
  },
  {
    id: 'team',
    name: 'Team',
    price: '49,99 €',
    originalPrice: '69,99 €',
    desc: 'Das beliebteste Abo',
    limitLabel: 'Bis zu 5 Mitarbeiter',
    popular: true,
    features: [
      'Web-App & Mobile-App',
      'Projekte, Kunden, Termine',
      'Zeiterfassung & Pausen',
      'Rechnungen & Mahnwesen',
      'Angebote & Kalkulation',
      'Profit Score & Analysen',
      'E-Rechnung (ZUGFeRD)',
      'PDF-Export ohne Wasserzeichen',
      'Projektkommunikation',
      'Team-Optimierung',
      '3 Rechnungsvorlagen',
      'E-Mail-Support',
      'Datenexport (CSV/PDF)',
      'DATEV-Export',
      'Mitarbeiter (max. 5)',
    ],
    gradient: 'from-teal-50 via-teal-50 to-emerald-50',
    badgeGradient: 'from-emerald-600 to-teal-600',
    btnGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700',
    borderColor: 'border-teal-200',
    icon: '👥',
  },
  {
    id: 'business',
    name: 'Business',
    price: '99,99 €',
    originalPrice: '119,99 €',
    desc: 'Für wachsende Betriebe',
    limitLabel: 'Unbegrenzt Mitarbeiter',
    popular: false,
    features: [
      'Web-App & Mobile-App',
      'Projekte, Kunden, Termine',
      'Zeiterfassung & Pausen',
      'Rechnungen & Mahnwesen',
      'Angebote & Kalkulation',
      'Profit Score & Analysen',
      'E-Rechnung (ZUGFeRD)',
      'PDF-Export ohne Wasserzeichen',
      'Projektkommunikation',
      'Team-Optimierung',
      '3 Rechnungsvorlagen',
      'E-Mail-Support',
      'Datenexport (CSV/PDF)',
      'DATEV-Export',
      'Mitarbeiter (unbegrenzt)',
    ],
    gradient: 'from-purple-100 to-indigo-100',
    badgeGradient: 'from-purple-600 to-indigo-600',
    btnGradient: 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    borderColor: 'border-purple-200',
    icon: '🏢',
  },
];

const isTestMode = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === 'true';

const PRICE_IDS: Record<string, string> = {
  solo: isTestMode
    ? process.env.NEXT_PUBLIC_STRIPE_TEST_PRICE_SOLO || ''
    : process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO || '',
  team: isTestMode
    ? process.env.NEXT_PUBLIC_STRIPE_TEST_PRICE_TEAM || ''
    : process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM || '',
  business: isTestMode
    ? process.env.NEXT_PUBLIC_STRIPE_TEST_PRICE_BUSINESS || ''
    : process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS || '',
};

export default function SubscriptionPage() {
  const { user, loading, employees, company } = useData();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showExcessWarning, setShowExcessWarning] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [retentionCouponId, setRetentionCouponId] = useState<string | null>(null);
  const [reactivateWithCoupon, setReactivateWithCoupon] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ planId: string; planName: string; priceId: string; excessCount: number; limit: number } | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    if (params.has('canceled') || params.has('cancelled')) {
      setShowCancelAlert(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('canceled');
      url.searchParams.delete('cancelled');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    }
    if (params.has('success')) {
      setShowSuccess(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());

      import('canvas-confetti').then(({ default: confetti }) => {
        const duration = 4000;
        const end = Date.now() + duration;
        const frame = () => {
          confetti({
            particleCount: 5,
            spread: 160,
            startVelocity: 35,
            origin: { x: Math.random(), y: Math.random() * 0.4 },
            colors: ['#087F63', '#10D6A3', '#0D9488', '#FFD700', '#FF6B6B'],
            zIndex: 100001,
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      });
    }
  }, []);

  // Listen live for retention coupon changes from Firestore
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'companies', user.uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.retentionCouponId) {
        setRetentionCouponId(d.retentionCouponId);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!showSuccess || !user?.uid) return;
    const MIN_DISPLAY_MS = 3000;
    const showSince = Date.now();

    const companyRef = doc(db, 'companies', user.uid);
    const unsub = onSnapshot(companyRef, (snap) => {
      if (snap.exists() && snap.data().subscriptionStatus === 'active') {
        const elapsed = Date.now() - showSince;
        const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
        setTimeout(() => { unsub(); router.push('/dashboard'); }, delay);
      }
    });
    const timeout = setTimeout(() => {
      unsub();
      router.push('/dashboard');
    }, 15000);
    return () => { unsub(); clearTimeout(timeout); };
  }, [showSuccess, router, user?.uid]);

  async function handleSubscribe(planId: string, planName: string) {
    const priceId = PRICE_IDS[planId];
    if (!priceId) { alert('Keine Preis-ID für diesen Plan konfiguriert.'); return; }

    const planLimit = PLAN_LIMITS[planId]?.employees ?? Infinity;
    const currentCount = employees.length;
    if (currentCount > planLimit && planLimit !== Infinity) {
      setPendingPlan({ planId, planName, priceId, excessCount: currentCount - planLimit, limit: planLimit });
      setShowExcessWarning(true);
      return;
    }

    await doSubscribe(priceId, planId, planName);
  }

  async function doSubscribe(priceId: string, planId: string, planName: string) {
    setLoadingPlan(planId);
    try {
      const user = getFirebase().auth.currentUser;
      if (!user) { alert('Bitte anmelden.'); setLoadingPlan(null); return; }
      const idToken = await user.getIdToken();

      let couponToUse = effectiveCouponId;
      if (couponToUse === 'pending' && reactivateWithCoupon) {
        try {
          const res = await fetch('/api/stripe/create-retention-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          });
          const data = await res.json();
          if (data.couponId) {
            setRetentionCouponId(data.couponId);
            couponToUse = data.couponId;
          }
        } catch (e) {
          console.error('Failed to create retention coupon:', e);
        }
      }

      const body: any = { priceId, planId, planName };
      if (couponToUse && couponToUse !== 'pending' && reactivateWithCoupon) {
        body.couponId = couponToUse;
        setReactivateWithCoupon(false);
      }

      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Fehler bei der Zahlungsabwicklung');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Keine Checkout-URL erhalten');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert(err.message || 'Fehler bei der Zahlungsabwicklung');
      setLoadingPlan(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const user = getFirebase().auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Fehler bei der Kündigung');
      }
      const data = await res.json();
      setShowCancelConfirm(false);
      setCancelDone(true);
      if (data.couponId) {
        setRetentionCouponId(data.couponId);
      }
      return;
    } catch (err: any) {
      alert(err.message || 'Fehler bei der Kündigung');
    } finally {
      setCancelling(false);
    }
  }

  // Effective coupon: from cancel API response (state) or Firestore (survives refresh)
  const effectiveCouponId = retentionCouponId || company?.retentionCouponId;

  if (loading || !user) return null;

  if (cancelDone) {
    return (
      <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center px-6 animate-fadeIn max-w-md mx-auto">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-slate-700/40 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="relative w-full h-full rounded-full bg-slate-700/30 flex items-center justify-center">
              <svg className="w-12 h-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 1 1 8 0v4" />
                <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                <path d="M12 16v2" strokeWidth={2} />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">Abo gekündigt</h1>
          <p className="text-slate-400 text-base leading-relaxed mb-8">
            Du hast <strong className="text-amber-400">7 Tage Zeit</strong>, um deine Daten zu sichern. Danach werden <strong className="text-slate-300">alle Daten unwiderruflich gelöscht</strong> (Mitarbeiter, Kunden, Einsätze, Rechnungen, Angebote).
          </p>
          <div className="space-y-3">
            <a href="/settings/export"
              className="block w-full py-3.5 bg-white text-slate-900 font-bold rounded-2xl hover:bg-slate-100 active:scale-[0.98] transition-all shadow-xl">
              Daten exportieren
            </a>
            <button
              onClick={() => { setCancelDone(false); window.location.href = '/settings/subscription'; }}
              className="block w-full py-3.5 bg-slate-700/50 text-slate-300 font-medium rounded-2xl hover:bg-slate-700 active:scale-[0.98] transition-all border border-slate-600/50"
            >
              Zurück zu den Plänen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900">
        <div className="text-center px-6 animate-fadeIn">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-400/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-3">Zahlung erfolgreich!</h1>
          <p className="text-emerald-200 text-lg mb-8">Dein Abonnement ist aktiv. Du wirst automatisch weitergeleitet...</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-8 py-3 bg-white text-emerald-900 font-bold rounded-xl hover:bg-emerald-50 transition-all shadow-xl active:scale-95"
          >
            Zur App
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">
          <div className="animate-fadeIn">
            <a href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 font-medium mb-3 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Zurück zu Einstellungen
            </a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Abonnement &amp; Preise</h1>
            <p className="text-slate-500 text-sm mt-1">Wähle den passenden Plan für deinen Betrieb</p>
          </div>

          {/* Current plan notice */}
          {company?.subscriptionStatus !== 'active' && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 animate-slideUp flex items-center gap-4 shadow-sm">
              <span className="text-3xl">💡</span>
              <div>
                <p className="font-bold text-amber-900 text-sm">Aktionspreise – dauerhaft günstiger!</p>
                <p className="text-amber-700 text-sm mt-0.5">
                  Die genannten Preise sind befristete Einführungspreise. <strong>Probiere 14 Tage kostenlos &amp; unverbindlich.</strong>
                </p>
              </div>
            </div>
          )}

          {/* Reactivate banner */}
          {reactivateWithCoupon && (
            <div className="animate-slideUp rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5 shadow-sm flex items-center gap-4">
              <span className="text-2xl shrink-0">🎉</span>
              <div>
                <p className="font-bold text-indigo-900 text-sm">15% Rabatt aktiviert!</p>
                <p className="text-indigo-700 text-sm mt-0.5">Wähle unten einen Plan – der Rabatt wird automatisch an der Kasse angewendet. Gültig für 3 Monate.</p>
              </div>
              <button onClick={() => { setReactivateWithCoupon(false); setRetentionCouponId(null); }}
                className="ml-auto shrink-0 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-all active:scale-[0.97]">
                Verwerfen
              </button>
            </div>
          )}

          {/* Plan cards */}
          <div id="plan-cards" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 animate-slideUp overflow-hidden ${plan.popular ? 'border-teal-400 ring-2 ring-teal-100' : plan.borderColor}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {plan.popular && (
                  <div className="absolute top-4 right-4 z-10">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-200/30">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      Empfohlen
                    </span>
                  </div>
                )}

                <div className={`px-6 py-6 bg-gradient-to-r ${plan.gradient}`}>
                  <span className="text-3xl mb-2 block">{plan.icon}</span>
                  <p className="text-sm font-semibold text-slate-500 mb-0.5">{plan.desc}</p>
                  <p className="text-2xl font-black text-slate-900">{plan.name}</p>
                  <div className="mt-2 inline-block px-3 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow-sm shadow-orange-200">
                    {plan.limitLabel}
                  </div>
                </div>

                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-slate-900">{plan.price}</span>
                    <span className="text-sm text-slate-400 font-medium">/ Monat</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-through">Statt {plan.originalPrice}</p>
                </div>

                <div className="px-6 py-5 space-y-3">
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">✓</span>
                      <span className="text-sm text-slate-600">{f}</span>
                    </div>
                  ))}
                </div>

                <div className="px-6 pb-6">
                  <button
                    onClick={() => handleSubscribe(plan.id, plan.name)}
                    disabled={loadingPlan === plan.id}
                    className={`block w-full text-center py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-[0.97] bg-gradient-to-r ${plan.btnGradient} hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {loadingPlan === plan.id ? 'Wird geöffnet...' : 'Jetzt starten'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Current plan info + Kündigen */}
          {company?.subscriptionStatus === 'active' && (
            <div className="animate-slideUp rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dein aktueller Plan</p>
                  <p className="text-xl font-black text-slate-900 mt-1">{PLAN_LABELS[company.subscriptionPlan] || company.subscriptionPlan} <span className="text-sm font-normal text-[#10D6A3]">● Aktiv</span></p>
                </div>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelling}
                  className="rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 hover:border-red-300 active:scale-[0.97] disabled:opacity-50"
                >
                  Abo kündigen
                </button>
              </div>
            </div>
          )}



          {/* Retention-Banner nach Kündigung */}
          {effectiveCouponId && (company?.subscriptionStatus === 'cancelled' || company?.subscriptionStatus === 'expired') && (
            <div className="animate-slideUp rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="text-3xl shrink-0">😢</span>
                <div>
                  <p className="font-bold text-indigo-900 text-lg">Wir vermissen dich schon!</p>
                  <p className="text-sm text-indigo-700 mt-1 leading-relaxed">
                    Möchtest du nicht doch zurückkommen? Als Dankeschön für deine Treue erhältst du <strong className="text-indigo-900">15% Rabatt</strong> auf jedes Abo – für die nächsten <strong className="text-indigo-900">3 Monate</strong>.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        if (effectiveCouponId === 'pending') {
                          try {
                            const user = getFirebase().auth.currentUser;
                            if (!user) return;
                            const idToken = await user.getIdToken();
                            const res = await fetch('/api/stripe/create-retention-coupon', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                            });
                            const data = await res.json();
                            if (data.couponId) {
                              setRetentionCouponId(data.couponId);
                            }
                          } catch (e) {
                            console.error('Failed to create retention coupon:', e);
                          }
                        }
                        setReactivateWithCoupon(true);
                        document.getElementById('plan-cards')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:from-indigo-700 hover:to-purple-700 active:scale-[0.97]"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      Ja, ich will zurückkommen!
                    </button>
                    <button
                      onClick={() => {
                        setRetentionCouponId(null);
                        setReactivateWithCoupon(false);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-500 transition-all hover:bg-slate-50 active:scale-[0.97]"
                    >
                      Nein, danke
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cancel confirm modal */}

          {showCancelConfirm && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
                <div className="px-6 pt-6 pb-2">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Abo wirklich kündigen?</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Dein Abonnement wird sofort bei Stripe gekündigt. Du hast danach <strong>7 Tage Zeit</strong>, um deine Daten zu sichern. Nach Ablauf dieser Frist werden <strong>alle deine Daten unwiderruflich gelöscht</strong> (Mitarbeiter, Kunden, Einsätze, Rechnungen, Angebote).
                  </p>
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-800">Was passiert nach der Kündigung?</p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-700">
                      <li className="flex items-start gap-2">• <span>7 Tage Gnadenfrist zum Datensichern</span></li>
                      <li className="flex items-start gap-2">• <span>Datenexport jederzeit möglich unter Einstellungen → Export</span></li>
                      <li className="flex items-start gap-2">• <span>Nach 7 Tagen: alle Daten unwiderruflich gelöscht</span></li>
                    </ul>
                  </div>
                </div>
                <div className="px-6 py-4 flex gap-3">
                  <button onClick={() => setShowCancelConfirm(false)} disabled={cancelling}
                    className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all active:scale-[0.97] disabled:opacity-50">
                    Doch nicht
                  </button>
                  <button onClick={handleCancel} disabled={cancelling}
                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm shadow-lg transition-all active:scale-[0.97] disabled:opacity-50">
                    {cancelling ? 'Wird gekündigt...' : 'Ja, kündigen'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center animate-slideUp">
            <p className="text-slate-500 text-sm mb-3">Noch Fragen? Wir helfen dir gerne weiter.</p>
            <a href="mailto:earntrack@web.de"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-700 border border-teal-200 rounded-xl text-sm font-bold hover:from-teal-100 hover:to-emerald-100 hover:shadow-md active:scale-[0.97] transition-all shadow-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Support kontaktieren
            </a>
          </div>

          {isTestMode && (
            <div className="text-center animate-slideUp">
              <span className="inline-block px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold">
                🧪 TEST-MODUS AKTIV – Es wird kein echtes Geld abgebucht
              </span>
            </div>
          )}

          {user?.email && ADMIN_EMAILS.includes(user.email) && (
            <div className="text-center animate-slideUp">
              <button
                onClick={async () => {
                  try {
                    const user = getFirebase().auth.currentUser;
                    if (!user) return;
                    const idToken = await user.getIdToken();
                    const res = await fetch('/api/test-activate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                    });
                    const data = await res.json();
                    if (data.success) {
                      window.location.href = '/settings/subscription?success=true';
                    } else {
                      alert('Fehler: ' + (data.error || 'Unbekannt'));
                    }
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}
                className="px-4 py-2 text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-600 transition-all"
              >
                🧪 Zahlung simulieren (Test)
              </button>
            </div>
          )}

          {/* Cancel alert modal */}
          {showCancelAlert && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
                <div className="px-6 pt-6 pb-2">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Zahlung abgebrochen</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Ohh, da ist was schiefgelaufen. Der Zahlungsvorgang wurde nicht abgeschlossen.<br />
                    <strong>Versuche es einfach noch einmal.</strong>
                  </p>
                </div>
                <div className="px-6 py-4 flex gap-3">
                  <button onClick={() => setShowCancelAlert(false)}
                    className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all active:scale-[0.97]">
                    Schließen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Excess employee warning modal */}
          {showExcessWarning && pendingPlan && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
                <div className="px-6 pt-6 pb-2">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Zu viele Mitarbeiter</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Du hast aktuell <strong>{employees.length} Mitarbeiter</strong>, aber der <strong>{pendingPlan.planName}</strong>-Plan erlaubt maximal <strong>{pendingPlan.limit}</strong>.
                  </p>
                </div>
                <div className="px-6 py-4 bg-amber-50 border-y border-amber-100">
                  <p className="text-sm text-amber-800 font-medium">
                    Die <strong>{pendingPlan.excessCount} zuletzt angelegten Mitarbeiter</strong> werden nach <strong>{EXCESS_CLEANUP_DAYS} Tagen</strong> automatisch gelöscht.
                  </p>
                </div>
                <div className="px-6 py-4 flex gap-3">
                  <button onClick={() => { setShowExcessWarning(false); setPendingPlan(null); }}
                    className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all active:scale-[0.97]">
                    Anderen Plan wählen
                  </button>
                  <button onClick={async () => {
                    setShowExcessWarning(false);
                    await doSubscribe(pendingPlan.priceId, pendingPlan.planId, pendingPlan.planName);
                  }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-sm shadow-lg transition-all active:scale-[0.97]">
                    Trotzdem fortfahren
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
