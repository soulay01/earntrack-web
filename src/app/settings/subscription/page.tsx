'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import { getFirebase, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { PLAN_LIMITS, PLAN_LABELS, EXCESS_CLEANUP_DAYS, getPriceIds } from '@/lib/plans';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import PlanGrid from '@/components/PlanGrid';
import BeforeAfter from '@/components/pricing/BeforeAfter';
import WorkflowChain from '@/components/pricing/WorkflowChain';
import IncludedGrid from '@/components/pricing/IncludedGrid';
import PriceCompare from '@/components/pricing/PriceCompare';
import Promises from '@/components/pricing/Promises';
import Faq from '@/components/pricing/Faq';
import '@/components/pricing/pricing.css';
import { useIsAdmin } from '@/lib/useIsAdmin';
import { FlaskConical } from 'lucide-react';

const isTestMode = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === 'true';

export default function SubscriptionPage() {
  const { user, loading, employees, company, companyId } = useData();
  const { isAdmin } = useIsAdmin();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showExcessWarning, setShowExcessWarning] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  // Zeitpunkt, zu dem das Abo tatsächlich endet (null = sofort beendet,
  // etwa bei Konten ohne Stripe-Abo).
  const [cancelEndsAt, setCancelEndsAt] = useState<number | null>(null);
  const [retentionCouponId, setRetentionCouponId] = useState<string | null>(null);
  const [reactivateWithCoupon, setReactivateWithCoupon] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ planId: string; planName: string; priceId: string; excessCount: number; limit: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  // Widerrufsverzicht (§ 356 Abs. 4 BGB): vor jedem Kauf/Wechsel muss der Kunde
  // ausdrücklich zustimmen, dass die Leistung sofort beginnt und das 14-tägige
  // Widerrufsrecht dadurch erlischt — sonst bleibt es trotz Nutzung bestehen.
  const [showWiderrufModal, setShowWiderrufModal] = useState(false);
  const [widerrufChecked, setWiderrufChecked] = useState(false);
  const [pendingSubscribeArgs, setPendingSubscribeArgs] = useState<{ priceId: string; planId: string; planName: string; excessCount?: number } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const showSuccessRef = useRef(showSuccess);
  showSuccessRef.current = showSuccess;
  const routerRef = useRef(router);
  routerRef.current = router;

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

  // Single listener for retention coupon + success redirect
  useEffect(() => {
    if (!user?.uid) return;
    const companyRef = doc(db, 'companies', companyId || user.uid);
    const MIN_DISPLAY_MS = 3000;
    const showSince = Date.now();

    let redirectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const unsub = onSnapshot(companyRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();

      // Retention coupon
      if (d.retentionCouponId) {
        setRetentionCouponId(d.retentionCouponId);
      }

      // Success redirect
      if (showSuccessRef.current && d.subscriptionStatus === 'active' && !redirectTimer) {
        const elapsed = Date.now() - showSince;
        const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
        redirectTimer = setTimeout(() => { unsub(); routerRef.current.push('/dashboard'); }, delay);
      }
    });

    // Fallback timeout
    if (showSuccessRef.current) {
      const elapsed = Date.now() - showSince;
      const remaining = Math.max(0, 60000 - elapsed);
      fallbackTimer = setTimeout(() => { unsub(); routerRef.current.push('/dashboard'); }, remaining);
    }

    return () => { unsub(); if (redirectTimer) clearTimeout(redirectTimer); if (fallbackTimer) clearTimeout(fallbackTimer); };
  }, [user?.uid]);

  async function handleSubscribe(planId: string, planName: string) {
    const priceId = getPriceIds()[planId];
    if (!priceId) { alert('Keine Preis-ID für diesen Plan konfiguriert.'); return; }

    const planLimit = PLAN_LIMITS[planId]?.employees ?? Infinity;
    const currentCount = employees.length;
    if (currentCount > planLimit && planLimit !== Infinity) {
      setPendingPlan({ planId, planName, priceId, excessCount: currentCount - planLimit, limit: planLimit });
      setShowExcessWarning(true);
      return;
    }

    requestWiderrufConsent({ priceId, planId, planName });
  }

  function requestWiderrufConsent(args: { priceId: string; planId: string; planName: string; excessCount?: number }) {
    setPendingSubscribeArgs(args);
    setWiderrufChecked(false);
    setShowWiderrufModal(true);
  }

  async function doSubscribe(priceId: string, planId: string, planName: string, excessCount?: number) {
    setLoadingPlan(planId);
    try {
      const user = getFirebase().auth.currentUser;
      if (!user) { alert('Bitte anmelden.'); setLoadingPlan(null); return; }
      const idToken = await user.getIdToken();

      // Bereits vorhandenen Coupon aus Firestore/State verwenden, erst neu erstellen wenn nötig
      let couponToUse = effectiveCouponId || (reactivateWithCoupon ? retentionCouponId : null);
      if ((!couponToUse || couponToUse === 'pending') && reactivateWithCoupon) {
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

      const body: any = { priceId, planId, planName, widerrufConsent: true };
      if (excessCount && excessCount > 0) {
        body.excessEmployees = excessCount;
      }
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
      if (!user) { setCancelling(false); return; }
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
      setCancelEndsAt(typeof data.endsAt === 'number' ? data.endsAt : null);
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

  if (loading || !user) return <PageSkeleton variant="cards" maxWidth="max-w-5xl" />;

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
          {cancelEndsAt ? (
            <p className="text-slate-400 text-base leading-relaxed mb-8">
              Du kannst bis zum{' '}
              <strong className="text-white">
                {new Date(cancelEndsAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
              </strong>{' '}
              normal weiterarbeiten — der Zeitraum ist bereits bezahlt, es wird nichts
              mehr abgebucht. Danach hast du noch{' '}
              <strong className="text-amber-400">7 Tage</strong>, um deine Daten zu exportieren.
            </p>
          ) : (
            <p className="text-slate-400 text-base leading-relaxed mb-8">
              Du hast <strong className="text-amber-400">7 Tage Zeit</strong>, um deine Daten
              zu sichern. Danach werden{' '}
              <strong className="text-slate-300">alle Daten unwiderruflich gelöscht</strong>{' '}
              (Mitarbeiter, Kunden, Einsätze, Rechnungen, Angebote).
            </p>
          )}
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

  const isActive = company?.subscriptionStatus === 'active';

  // Zum Periodenende gekündigt: Abo läuft noch, deshalb bleibt der Status
  // 'active'. Nur dieses Flag unterscheidet den Zustand von einem normalen Abo.
  const pendingCancelDate = company?.cancelAtPeriodEnd && company?.subscriptionEndsAt?.toDate
    ? company.subscriptionEndsAt.toDate()
    : null;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="et-sheet flex-1 overflow-y-auto">
        <div className="px-5 md:px-8 py-8 max-w-5xl mx-auto">

          <a href="/settings" className="et-label" style={{ display: 'inline-block', marginBottom: '1.75rem' }}>
            ← Einstellungen
          </a>

          <header className="pb-8">
            <p className="et-label" style={{ marginBottom: '1rem' }}>
              {isActive ? 'Dein Tarif' : 'Tarife'}
            </p>
            <h1 className="et-head__title">
              {isActive
                ? <>Läuft. <em>Alles an Bord.</em></>
                : <>Schluss mit <em>Zettelwirtschaft.</em></>}
            </h1>
            <p className="et-head__sub">
              {isActive
                ? 'Du kannst jederzeit wechseln — der neue Tarif greift sofort, der Rest wird verrechnet.'
                : 'Stunden, Termine, Angebote, Rechnungen und Auswertung an einer Stelle. Für deinen ganzen Betrieb, ab 27,99 € im Monat.'}
            </p>
            {!isActive && (
              <div className="et-head__stats">
                <span className="et-head__stat">Ab 27,99 € im Monat</span>
                <span className="et-head__stat">Monatlich kündbar</span>
                <span className="et-head__stat">14 Tage kostenlos testen</span>
              </div>
            )}
          </header>

          {/* Restlaufzeit der Testphase, als Maßstab gelesen */}
          {(() => {
            if (company?.subscriptionStatus !== 'trial' && company?.subscriptionStatus !== 'trialing') return null;
            const trialEnd = company?.trialEndsAt?.toDate ? company.trialEndsAt.toDate() : company?.trialEndsAt ? new Date(company.trialEndsAt) : null;
            if (!trialEnd || isNaN(trialEnd.getTime())) return null;

            const totalDays = 14;
            const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now) / (1000 * 60 * 60 * 24)));
            const hoursLeft = Math.max(0, Math.floor((trialEnd.getTime() - now) / (1000 * 60 * 60)));
            const used = Math.max(0, Math.min(1, 1 - daysLeft / totalDays));
            const knapp = daysLeft <= 3;

            return (
              <div className="et-trial">
                <div className="et-trial__head">
                  <span className="et-label">Testphase</span>
                  <span className="et-trial__count" style={knapp ? { color: '#b45309' } : undefined}>
                    {daysLeft > 0
                      ? hoursLeft < 24 ? `noch ${hoursLeft} Std.` : `noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}`
                      : 'abgelaufen'}
                  </span>
                </div>
                <div className="et-trial__scale" role="img"
                  aria-label={`Testphase: ${daysLeft} von ${totalDays} Tagen übrig`}>
                  <div className="et-trial__used" style={{ width: `${used * 100}%` }} />
                </div>
                <p className="et-trial__foot">
                  {daysLeft > 0 ? 'Danach brauchst du einen Tarif — die Daten bleiben.' : 'Wähle unten einen Tarif, dann geht es weiter.'}
                </p>
              </div>
            );
          })()}

          {/* Rabatt aus der Kündigungsstrecke */}
          {reactivateWithCoupon && (
            <div className="et-note">
              <p className="et-note__title">15 % Rabatt liegt im Warenkorb</p>
              <p className="et-note__text">
                Wähle unten einen Tarif — der Rabatt wird an der Kasse abgezogen und gilt drei Monate.
              </p>
              <button
                type="button"
                onClick={() => { setReactivateWithCoupon(false); setRetentionCouponId(null); }}
                className="et-note__dismiss"
              >
                Verwerfen
              </button>
            </div>
          )}

          {/* Preise zuerst — die Argumente stehen darunter für alle, die sie
              brauchen, statt sie vor den Betrag zu schieben. */}
          <section aria-labelledby="plans-heading" id="plan-cards" className="pb-16">
            <h2 id="plans-heading" className="sr-only">
              {isActive ? 'Tarif wechseln' : 'Tarife'}
            </h2>
            <PlanGrid
              loadingPlan={loadingPlan}
              onSubscribe={handleSubscribe}
              currentPlanId={isActive ? company?.subscriptionPlan : null}
            />
            {!isActive && (
              <div className="pt-4">
                <Promises />
              </div>
            )}
          </section>

          {!isActive && (
            <>
              <div className="pb-16">
                <PriceCompare />
              </div>
              <div className="pb-16">
                <BeforeAfter />
              </div>
              <div className="pb-16">
                <WorkflowChain />
              </div>
            </>
          )}

          <div className="pb-16">
            <IncludedGrid />
          </div>

          {/* Laufender Tarif + Kündigung */}
          {isActive && (
            <div className="et-current">
              <div>
                <span className="et-label">
                  {pendingCancelDate ? 'Gekündigt — läuft noch' : 'Aktiv seit Buchung'}
                </span>
                <p className="et-current__plan">{PLAN_LABELS[company.subscriptionPlan] || company.subscriptionPlan}</p>
                {pendingCancelDate && (
                  <p className="et-current__hint">
                    Zugriff bis {pendingCancelDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}.
                    Es wird nichts mehr abgebucht.
                  </p>
                )}
              </div>
              {!pendingCancelDate && (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelling}
                  className="et-current__cancel"
                >
                  Kündigen
                </button>
              )}
            </div>
          )}



          {/* Rückholangebot nach Kündigung */}
          {effectiveCouponId && (company?.subscriptionStatus === 'cancelled' || company?.subscriptionStatus === 'expired') && (
            <div className="et-note et-note--offer">
              <p className="et-note__title">15 % Rabatt, drei Monate lang</p>
              <p className="et-note__text">
                Falls du zurückwillst: der Rabatt gilt für jeden Tarif und wird an der Kasse abgezogen.
              </p>
              <div className="et-note__actions">
                <button
                  type="button"
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
                  className="et-btn et-btn--primary"
                  style={{ width: 'auto', padding: '0.625rem 1.25rem' }}
                >
                  Rabatt einlösen
                </button>
                <button
                  type="button"
                  onClick={() => { setRetentionCouponId(null); setReactivateWithCoupon(false); }}
                  className="et-note__dismiss"
                  style={{ position: 'static' }}
                >
                  Nein, danke
                </button>
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
                    Du behältst vollen Zugriff bis zum <strong>Ende des bereits bezahlten
                    Zeitraums</strong> — es wird nichts mehr abgebucht. Danach hast du
                    noch <strong>7 Tage</strong>, um deine Daten zu exportieren.
                  </p>
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-800">Was passiert nach der Kündigung?</p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-700">
                      <li className="flex items-start gap-2">• <span>Weiterarbeiten bis zum Ende des bezahlten Zeitraums</span></li>
                      <li className="flex items-start gap-2">• <span>Danach 7 Tage Zeit zum Datensichern</span></li>
                      <li className="flex items-start gap-2">• <span>Datenexport jederzeit unter Einstellungen → Export</span></li>
                      <li className="flex items-start gap-2">• <span>Erst danach werden die Daten unwiderruflich gelöscht</span></li>
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

          <div className="pb-10">
            <Faq />
          </div>

          {!isActive && (
            <div className="pb-16">
              <a href="#plan-cards" className="et-btn et-btn--primary et-backlink">
                Nach oben zu den Tarifen
              </a>
            </div>
          )}

          <footer className="et-foot">
            <p className="et-label" style={{ lineHeight: 1.9 }}>
              Jederzeit kündbar · Server und Daten in der EU · Keine Weitergabe deiner Daten
            </p>
            <a href="mailto:info@earntrack.de" className="et-foot__link">
              Frage an den Support
            </a>
          </footer>

          {isTestMode && (
            <p className="et-label" style={{ color: '#b45309', paddingBottom: '1rem' }}>
              <FlaskConical className="w-3.5 h-3.5 inline mr-1.5" />
              Testmodus — es wird kein Geld abgebucht
            </p>
          )}

          {isAdmin && (
            <button
              type="button"
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
              className="et-label"
              style={{
                marginBottom: '2.5rem',
                padding: '0.5rem 0.875rem',
                border: '1px dashed var(--et-line)',
                borderRadius: '2px',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              <FlaskConical className="w-3.5 h-3.5 inline mr-1.5" />Zahlung simulieren
            </button>
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

          {/* Widerrufsverzicht-Bestätigung (§ 356 Abs. 4 BGB) */}
          {showWiderrufModal && pendingSubscribeArgs && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
                <div className="px-6 pt-6 pb-2">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Bestellung bestätigen</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Du bestellst den Tarif <strong>{pendingSubscribeArgs.planName}</strong>. Die
                    Zahlung erfolgt über Stripe, der Zugriff auf den Tarif beginnt sofort nach
                    erfolgreicher Zahlung.
                  </p>
                  <label className="mt-4 flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={widerrufChecked}
                      onChange={(e) => setWiderrufChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs text-slate-500 leading-relaxed">
                      Ich stimme ausdrücklich zu, dass der Anbieter mit der Ausführung der
                      Dienstleistung sofort beginnt, bevor die 14-tägige Widerrufsfrist
                      abgelaufen ist. Mir ist bekannt, dass ich dadurch mein Widerrufsrecht
                      verliere, sobald die Leistung vollständig erbracht wurde (§ 356 Abs. 4
                      BGB). Die{' '}
                      <a href="/agb" target="_blank" className="text-teal-600 underline hover:text-teal-700">
                        Widerrufsbelehrung
                      </a>{' '}
                      und das{' '}
                      <a href="/widerrufsformular" target="_blank" className="text-teal-600 underline hover:text-teal-700">
                        Muster-Widerrufsformular
                      </a>{' '}
                      habe ich zur Kenntnis genommen.
                    </span>
                  </label>
                </div>
                <div className="px-6 py-4 flex gap-3">
                  <button
                    onClick={() => { setShowWiderrufModal(false); setPendingSubscribeArgs(null); }}
                    className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all active:scale-[0.97]"
                  >
                    Abbrechen
                  </button>
                  <button
                    disabled={!widerrufChecked}
                    onClick={async () => {
                      const args = pendingSubscribeArgs;
                      setShowWiderrufModal(false);
                      if (args) await doSubscribe(args.priceId, args.planId, args.planName, args.excessCount);
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl text-sm shadow-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Jetzt kostenpflichtig bestellen
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
                  <button onClick={() => {
                    const pp = pendingPlan;
                    setShowExcessWarning(false);
                    if (pp) requestWiderrufConsent({ priceId: pp.priceId, planId: pp.planId, planName: pp.planName, excessCount: pp.excessCount });
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
