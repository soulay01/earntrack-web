'use client';

import { useState } from 'react';
import { useData } from '@/app/Provider';
import { getFirebase } from '@/lib/firebase';
import { useIsAdmin } from '@/lib/useIsAdmin';
import { getPriceIds } from '@/lib/plans';
import PlanGrid from '@/components/PlanGrid';
import BeforeAfter from '@/components/pricing/BeforeAfter';
import WorkflowChain from '@/components/pricing/WorkflowChain';
import IncludedGrid from '@/components/pricing/IncludedGrid';
import PriceCompare from '@/components/pricing/PriceCompare';
import Promises from '@/components/pricing/Promises';
import Faq from '@/components/pricing/Faq';
import '@/components/pricing/pricing.css';

export default function PaywallOverlay() {
  const { company, logout } = useData();
  const { isAdmin } = useIsAdmin();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activating, setActivating] = useState(false);

  async function handleAdminActivate() {
    setActivating(true);
    try {
      const user = getFirebase().auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      const res = await fetch('/api/test-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ plan: 'business' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler bei der Aktivierung');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Fehler bei der Aktivierung');
      setActivating(false);
    }
  }

  const status = company?.subscriptionStatus === 'trial' && company?.trialEndsAt?.toDate && company.trialEndsAt.toDate() < new Date()
    ? 'expired'
    : company?.subscriptionStatus;

  let eyebrow = 'Zugang gesperrt';
  let headline = <>Wähle einen Tarif, dann geht es <em>weiter</em>.</>;
  let subline = 'Deine Daten liegen unverändert bereit.';

  if (status === 'expired') {
    eyebrow = 'Testphase beendet';
    headline = <>Deine 14 Tage sind um. <em>Deine Daten sind da.</em></>;
    subline = 'Projekte, Zeiten, Kunden und Rechnungen aus der Testphase liegen alle noch bereit. Such dir einen Tarif aus, dann arbeitest du weiter, wo du aufgehört hast.';
  } else if (status === 'past_due') {
    eyebrow = 'Zahlung offen';
    headline = <>Die letzte Zahlung <em>kam nicht durch</em>.</>;
    subline = 'Meist ist nur die Karte abgelaufen. Buche einen Tarif neu, dann ist der Zugang sofort wieder offen.';
  } else if (status === 'paused') {
    eyebrow = 'Tarif pausiert';
    headline = <>Pausiert. <em>Jederzeit weiter.</em></>;
    subline = 'Dein Betrieb ist gespeichert und wartet. Wähle einen Tarif, um weiterzuarbeiten.';
  }

  async function handleSubscribe(planId: string) {
    const priceId = getPriceIds()[planId];
    if (!priceId) { alert('Keine Preis-ID für diesen Plan konfiguriert.'); return; }
    setLoadingPlan(planId);
    try {
      const user = getFirebase().auth.currentUser;
      if (!user) { alert('Bitte anmelden.'); setLoadingPlan(null); return; }
      const idToken = await user.getIdToken();
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ priceId, planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler bei der Zahlungsabwicklung');
      if (data.url) { window.location.href = data.url; }
      else { throw new Error('Keine Checkout-URL erhalten'); }
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert(err.message || 'Fehler bei der Zahlungsabwicklung');
      setLoadingPlan(null);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); }
  }

  return (
    <div className="et-sheet fixed inset-0 z-[100] overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">

        <div className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-sm object-cover" />
            <span className="et-label" style={{ color: 'var(--et-ink)' }}>EarnTrack</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="et-label"
            style={{ background: 'none', border: 0, cursor: 'pointer', padding: '0.5rem 0' }}
          >
            {loggingOut ? 'Wird abgemeldet …' : 'Abmelden'}
          </button>
        </div>

        <header className="pt-4 pb-8 sm:pt-6 sm:pb-10">
          <p className="et-label" style={{ marginBottom: '1rem' }}>{eyebrow}</p>
          <h1 className="et-head__title">{headline}</h1>
          <p className="et-head__sub">{subline}</p>
          <div className="et-head__stats">
            <span className="et-head__stat">Ab 27,99 € im Monat</span>
            <span className="et-head__stat">Monatlich kündbar</span>
            <span className="et-head__stat">14 Tage kostenlos testen</span>
          </div>
        </header>

        {/* Preise zuerst: Wer hier landet, hat sich meist schon entschieden zu
            zahlen und sucht nur noch den Betrag. Die Argumente stehen darunter
            für alle, die sie brauchen. */}
        <section aria-labelledby="plans-heading" id="tarife" className="pb-16">
          <PlanGrid loadingPlan={loadingPlan} onSubscribe={handleSubscribe} />
          <h2 id="plans-heading" className="sr-only">Tarife</h2>
          <div className="pt-4">
            <Promises />
          </div>
        </section>

        <div className="pb-16">
          <PriceCompare />
        </div>

        <div className="pb-16">
          <BeforeAfter />
        </div>

        <div className="pb-16">
          <WorkflowChain />
        </div>

        <div className="pb-16">
          <IncludedGrid />
        </div>

        <div className="pb-10">
          <Faq />
        </div>

        <div className="pb-16">
          <a href="#tarife" className="et-btn et-btn--primary et-backlink">
            Nach oben zu den Tarifen
          </a>
        </div>

        <footer className="pb-16">
          <p className="et-label" style={{ lineHeight: 1.9 }}>
            Jederzeit kündbar · Server und Daten in der EU · Keine Weitergabe deiner Daten
          </p>

          {isAdmin && (
            <button
              type="button"
              onClick={handleAdminActivate}
              disabled={activating}
              className="et-label"
              style={{
                marginTop: '1.5rem',
                padding: '0.5rem 0.875rem',
                border: '1px dashed var(--et-line)',
                borderRadius: '2px',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {activating ? 'Wird freigeschaltet …' : 'Admin: Business ohne Zahlung freischalten'}
            </button>
          )}
        </footer>

      </div>
    </div>
  );
}
