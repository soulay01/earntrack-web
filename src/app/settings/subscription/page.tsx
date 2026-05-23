'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: '29,99 €',
    originalPrice: '39,99 €',
    desc: 'Für Einzelunternehmer & Freelancer',
    popular: false,
    features: [
      'Alle Kernfunktionen',
      'Bis zu 1 Mitarbeiter',
      'Rechnungen & Angebote',
      'Zeiterfassung (App + Web)',
      'E-Rechnung (ZUGFeRD/XRechnung)',
      'Kostenvoranschläge',
      'Profit Score & Analysen',
      'E-Mail-Support',
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
    desc: 'Für wachsende Handwerksbetriebe',
    popular: true,
    features: [
      'Alles aus Solo',
      'Unbegrenzte Mitarbeiter',
      'Unbegrenzte Kunden & Termine',
      'Datanorm-Import (Artikelkatalog)',
      'Mahnwesen (automatisiert)',
      'DATEV-Export',
      'PDF-Export ohne Wasserzeichen',
      'Team-Optimierung',
      'Prioritäts-Support',
    ],
    gradient: 'from-teal-600 via-teal-600 to-emerald-600',
    badgeGradient: 'from-emerald-500 to-teal-500',
    btnGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700',
    borderColor: 'border-teal-200',
    icon: '👥',
  },
  {
    id: 'business',
    name: 'Business',
    price: '79,99 €',
    originalPrice: '99,99 €',
    desc: 'Für Unternehmen mit hohen Anforderungen',
    popular: false,
    features: [
      'Alles aus Team',
      'GAEB-Import / Export',
      'Aufmaß & Unterschriften (App)',
      'Projekt-Controlling',
      'API-Zugriff & Webhooks',
      'Individuelle Rechnungsvorlage',
      'GAEB & AVA-Schnittstelle',
      'Bevorzugter Support (Telefon + Chat)',
      'Persönlicher Account Manager',
    ],
    gradient: 'from-purple-100 to-indigo-100',
    badgeGradient: 'from-purple-600 to-indigo-600',
    btnGradient: 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    borderColor: 'border-purple-200',
    icon: '🏢',
  },
];

export default function SubscriptionPage() {
  const { user, loading } = useData();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

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
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 animate-slideUp flex items-center gap-4 shadow-sm">
            <span className="text-3xl">💡</span>
            <div>
              <p className="font-bold text-amber-900 text-sm">Aktionspreise – dauerhaft günstiger!</p>
              <p className="text-amber-700 text-sm mt-0.5">
                Die genannten Preise sind befristete Einführungspreise. <strong>Probiere 14 Tage kostenlos &amp; unverbindlich.</strong>
              </p>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <a
                    href="mailto:support@earntrack.app?subject=Planwechsel%20Anfrage"
                    className={`block w-full text-center py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-[0.97] bg-gradient-to-r ${plan.btnGradient} hover:shadow-xl`}
                  >
                    {plan.popular ? 'Jetzt starten' : 'Anfragen'}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ hint */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center animate-slideUp">
            <p className="text-slate-500 text-sm mb-3">Noch Fragen? Wir helfen dir gerne weiter.</p>
            <a href="mailto:support@earntrack.app"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-700 border border-teal-200 rounded-xl text-sm font-bold hover:from-teal-100 hover:to-emerald-100 hover:shadow-md active:scale-[0.97] transition-all shadow-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Support kontaktieren
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
