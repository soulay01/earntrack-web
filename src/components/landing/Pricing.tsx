'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wrench, Users, Building2, Check } from 'lucide-react';

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: '27,99',
    originalPrice: '39,99',
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
      'Mitarbeiter (max. 2)',
    ],
    gradient: 'from-slate-100 to-slate-200',
    borderColor: 'border-slate-200',
    btnGradient: 'from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800',
    icon: <Wrench className="w-8 h-8 text-slate-600" />,
  },
  {
    id: 'team',
    name: 'Team',
    price: '49,99',
    originalPrice: '69,99',
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
      'Datenexport (CSV/PDF)',
      'DATEV-Export',
      'Mitarbeiter (max. 5)',
    ],
    gradient: 'from-teal-50 via-teal-50 to-emerald-50',
    borderColor: 'border-teal-200',
    btnGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700',
    icon: <Users className="w-8 h-8 text-teal-600" />,
  },
  {
    id: 'business',
    name: 'Business',
    price: '79,99',
    originalPrice: '99,99',
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
      'Datenexport (CSV/PDF)',
      'DATEV-Export',
      'Mitarbeiter (unbegrenzt)',
    ],
    gradient: 'from-purple-100 to-indigo-100',
    borderColor: 'border-purple-200',
    btnGradient: 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    icon: <Building2 className="w-8 h-8 text-purple-600" />,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-28 bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-4">
            Gratis testen.<br />
            <span className="gradient-text">Dann unschlagbar günstig.</span>
          </h2>
          <p className="text-lg text-slate-600">
            Starte kostenlos, upgrade wenn du bereit bist. Keine versteckten Kosten!
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLANS.map((plan, i) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl border-2 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${plan.popular ? 'border-teal-400 ring-2 ring-teal-100' : plan.borderColor}`}
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
                <span className="mb-2 block">{plan.icon}</span>
                <p className="text-sm font-semibold text-slate-500 mb-0.5">{plan.desc}</p>
                <p className="text-2xl font-black text-slate-900">{plan.name}</p>
                <div className="mt-2 inline-block px-3 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow-sm shadow-orange-200">
                  {plan.limitLabel}
                </div>
              </div>

              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-slate-900">{plan.price} €</span>
                  <span className="text-sm text-slate-400 font-medium">/ Monat</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 line-through">Statt {plan.originalPrice} €</p>
              </div>

              <div className="px-6 py-5 space-y-3">
                {plan.features.map((f, j) => (
                  <div key={j} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm"><Check className="w-3 h-3" /></span>
                    <span className="text-sm text-slate-600">{f}</span>
                  </div>
                ))}
              </div>

              <div className="px-6 pb-6">
                <Link
                  href="/login"
                  className={`block w-full text-center py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-[0.97] bg-gradient-to-r ${plan.btnGradient} hover:shadow-xl`}
                >
                  Jetzt starten
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          Alle Preise inkl. MwSt. · 14 Tage kostenlos testen · Jederzeit kündbar
        </p>
      </div>
    </section>
  );
}
