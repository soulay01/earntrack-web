'use client';

import { Check, Wrench, Users, Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPlanDisplay, PLAN_IDS, PLAN_DIFFERENCES } from '@/lib/plans';

interface PlanGridProps {
  loadingPlan: string | null;
  onSubscribe: (planId: string, planName: string) => void;
  currentPlanId?: string | null;
}

/**
 * Die Karten tragen ausschließlich das, was sich zwischen den Tarifen
 * unterscheidet. Alles Gemeinsame steht einmal in <IncludedGrid />, sonst
 * ertrinkt die Auswahl in dreifach wiederholten Häkchen.
 *
 * Optik übernommen aus der Preisliste auf earntrack.de (landing/Pricing.tsx).
 */
const PLAN_VISUALS: Record<
  string,
  { gradient: string; borderColor: string; btnGradient: string; icon: ReactNode }
> = {
  solo: {
    gradient: 'from-slate-100 to-slate-200',
    borderColor: 'border-slate-200',
    btnGradient: 'from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800',
    icon: <Wrench className="w-8 h-8 text-slate-600" />,
  },
  team: {
    gradient: 'from-teal-50 via-teal-50 to-emerald-50',
    borderColor: 'border-teal-400 ring-2 ring-teal-100',
    btnGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700',
    icon: <Users className="w-8 h-8 text-teal-600" />,
  },
  business: {
    gradient: 'from-purple-100 to-indigo-100',
    borderColor: 'border-purple-200',
    btnGradient: 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    icon: <Building2 className="w-8 h-8 text-purple-600" />,
  },
};

export default function PlanGrid({ loadingPlan, onSubscribe, currentPlanId }: PlanGridProps) {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {PLAN_IDS.map((id) => {
        const plan = getPlanDisplay(id);
        const visual = PLAN_VISUALS[id];
        const isCurrent = currentPlanId === plan.id;

        return (
          <article
            key={plan.id}
            className={`relative bg-white rounded-2xl border-2 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${visual.borderColor}`}
          >
            {plan.popular && (
              <div className="absolute top-4 right-4 z-10">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-200/30">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  Empfohlen
                </span>
              </div>
            )}

            <div className={`px-6 py-6 bg-gradient-to-r ${visual.gradient}`}>
              <span className="mb-2 block">{visual.icon}</span>
              <p className="text-sm font-semibold text-slate-500 mb-0.5">{plan.desc}</p>
              <p className="text-2xl font-black text-slate-900">{plan.name}</p>
              <div className="mt-2 inline-block px-3 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow-sm shadow-orange-200">
                {plan.limitLabel}
              </div>
            </div>

            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">
                  {plan.price},{plan.priceCents} €
                </span>
                <span className="text-sm text-slate-400 font-medium">/ Monat</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Einführungspreis · statt <span className="line-through">{plan.originalPrice}</span>
              </p>
            </div>

            <div className="px-6 py-5 space-y-3">
              {PLAN_DIFFERENCES.map((row) => {
                const val = row[id as keyof typeof row] as string | boolean;
                const isOff = val === false;
                return (
                  <div
                    key={row.label}
                    className={`flex items-baseline justify-between gap-2 ${isOff ? 'opacity-60' : ''}`}
                  >
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <span className="text-sm">
                      {typeof val === 'boolean' ? (
                        val ? (
                          <span className="inline-flex items-center gap-1 font-bold text-teal-600">
                            <Check className="w-3.5 h-3.5" />ja
                          </span>
                        ) : (
                          <span className="text-slate-300 font-medium">—</span>
                        )
                      ) : (
                        <span className="font-bold text-slate-900">{val}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="px-6 pb-6">
              {isCurrent ? (
                <span className="block w-full text-center py-3 rounded-xl text-sm font-bold border-2 border-teal-500 bg-teal-50 text-teal-700 cursor-default">
                  Dein Tarif
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSubscribe(plan.id, plan.name)}
                  disabled={loadingPlan !== null}
                  className={`block w-full text-center py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-[0.97] bg-gradient-to-r ${visual.btnGradient} hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
                >
                  {loadingPlan === plan.id ? 'Kasse wird geöffnet …' : `${plan.name} buchen`}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
