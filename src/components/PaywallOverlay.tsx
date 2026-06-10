'use client';

import { useState } from 'react';
import { useData } from '@/app/Provider';
import { getFirebase } from '@/lib/firebase';
import { getPlanDisplay, FEATURE_CATEGORIES, PLAN_IDS, BADGE_GRADIENTS, getPriceIds } from '@/lib/plans';

export default function PaywallOverlay() {
  const { company, logout } = useData();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const status = company?.subscriptionStatus;

  let headline = 'Premium erforderlich';
  let subline = 'Schalte EarnTrack wieder frei und verwalte dein Business ohne Unterbrechung.';
  if (status === 'expired') {
    headline = 'Testphase beendet';
    subline = 'Deine 14-tägige Testphase ist abgelaufen. Wähle einen Plan, um EarnTrack weiter zu nutzen.';
  } else if (status === 'past_due') {
    headline = 'Zahlung überfällig';
    subline = 'Deine letzte Zahlung konnte nicht verarbeitet werden. Aktualisiere deine Zahlungsmethode oder wähle einen neuen Plan.';
  } else if (status === 'paused') {
    headline = 'Abo pausiert';
    subline = 'Dein Abonnement ist pausiert. Reaktiviere es, um EarnTrack weiter zu nutzen.';
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
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-teal-50">
      <div className="min-h-screen flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="EarnTrack" className="w-9 h-9 rounded-full object-cover shadow-md shadow-teal-200" />
            <span className="font-bold text-slate-900 tracking-tight">EarnTrack</span>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-[0.97] flex items-center gap-2 disabled:opacity-50"
          >
            {loggingOut && <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />}
            Abmelden
          </button>
        </div>

        <div className="flex-1 px-4 pb-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 animate-slideUp">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 shadow-lg shadow-teal-200/40 mb-4">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mb-2">{headline}</h1>
              <p className="text-slate-500 max-w-xl mx-auto">{subline}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PLAN_IDS.map((id, i) => {
                const plan = getPlanDisplay(id);
                const badgeGrad = BADGE_GRADIENTS[id];
                return (
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

                    <div className="px-6 py-5 space-y-3 max-h-72 overflow-y-auto">
                      {FEATURE_CATEGORIES.map(cat => (
                        <div key={cat.category}>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2 mt-3 first:mt-0">{cat.category}</p>
                          {cat.features.map((f, j) => {
                            const val = f[id as keyof typeof f] as string | boolean;
                            const isAvailable = typeof val === 'boolean' ? val : true;
                            const displayVal = typeof val === 'boolean' ? f.label : val;
                            return (
                              <div key={j} className="flex items-start gap-2.5 py-0.5">
                                {typeof val === 'boolean' ? (
                                  isAvailable ? (
                                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">✓</span>
                                  ) : (
                                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">✗</span>
                                  )
                                ) : (
                                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">{f.label.charAt(0)}</span>
                                )}
                                <span className={`text-sm ${isAvailable ? 'text-slate-600' : 'text-slate-400'}`}>
                                  {typeof val === 'boolean' ? f.label : `${f.label}: ${displayVal}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    <div className="px-6 pb-6">
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        disabled={loadingPlan !== null}
                        className={`block w-full text-center py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-[0.97] bg-gradient-to-r ${plan.btnGradient} hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {loadingPlan === plan.id ? 'Wird geöffnet...' : 'Jetzt starten'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-slate-400 mt-8">
              14 Tage Geld-zurück-Garantie · Jederzeit kündbar · DSGVO-konform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
