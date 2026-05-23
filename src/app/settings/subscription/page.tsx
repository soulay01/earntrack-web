'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';

export default function SubscriptionPage() {
  const { user, loading } = useData();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  const plan = {
    name: 'Pro',
    price: '8,99 €',
    interval: 'Monat',
    status: 'active',
    nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE'),
    features: [
      'Unbegrenzte Mitarbeiter', 'Unbegrenzte Kunden', 'Unbegrenzte Einsätze',
      'PDF-Export ohne Wasserzeichen', 'Volle Rechnungsvorlage', 'Kostenvoranschläge',
      'Profit Score & Analysen', 'Team-Optimierung', 'Prioritäts-Support',
    ],
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-2xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Abonnement &amp; Vertrag</h1>
            <p className="text-slate-500 text-sm mt-1">Dein aktueller Plan und Zahlungsdetails</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp">
            <div className="px-6 py-6 bg-gradient-to-r from-teal-600 via-teal-600 to-emerald-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-teal-100">Aktueller Plan</p>
                  <p className="text-3xl font-black mt-1">{plan.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black">{plan.price}</p>
                  <p className="text-sm text-teal-100 font-medium">pro {plan.interval}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 shadow-sm">
                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-bold text-green-800">Aktiv &middot; Nächste Abrechnung: {plan.nextBilling}</span>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <p className="text-sm font-bold text-slate-700 mb-3">Enthaltene Funktionen</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-all">
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center shadow-sm">✓</span>
                      <span className="text-sm text-slate-600">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 flex flex-col items-center text-center">
                <p className="text-xs text-slate-400 mb-4">
                  Bei Fragen zum Abonnement wende dich bitte an den Support.
                </p>
                <a href="mailto:support@earntrack.app"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-700 border border-teal-200 rounded-xl text-sm font-bold hover:from-teal-100 hover:to-emerald-100 hover:shadow-md active:scale-[0.97] transition-all shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Support kontaktieren
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
