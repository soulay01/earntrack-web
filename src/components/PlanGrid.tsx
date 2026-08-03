'use client';

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
 */
export default function PlanGrid({ loadingPlan, onSubscribe, currentPlanId }: PlanGridProps) {
  return (
    <div className="et-plans">
      {PLAN_IDS.map((id) => {
        const plan = getPlanDisplay(id);
        const isCurrent = currentPlanId === plan.id;

        return (
          <article
            key={plan.id}
            className={`et-plan${plan.popular ? ' et-plan--popular' : ''}`}
          >
            {plan.popular && <span className="et-plan__flag">Meist gewählt</span>}

            <header className="et-plan__head">
              <h3 className="et-plan__name">{plan.name}</h3>
              <p className="et-plan__desc">{plan.desc}</p>

              <p className="et-plan__price">
                <span className="et-plan__amount">{plan.price}</span>
                <span className="et-plan__cents">,{plan.priceCents}&nbsp;€</span>
                <span className="et-plan__per">pro Monat</span>
              </p>
              <p className="et-plan__was">
                Einführungspreis · statt <s>{plan.originalPrice}</s>
              </p>
            </header>

            <div className="et-plan__body">
              {PLAN_DIFFERENCES.map((row) => {
                const val = row[id as keyof typeof row] as string | boolean;
                const isOff = val === false;
                return (
                  <div
                    key={row.label}
                    className={`et-plan__diff${isOff ? ' et-plan__diff--off' : ''}`}
                  >
                    <span className="et-plan__diffkey">{row.label}</span>
                    <span className="et-plan__diffval">
                      {typeof val === 'boolean' ? (val ? 'ja' : '—') : val}
                    </span>
                  </div>
                );
              })}
            </div>

            <footer className="et-plan__foot">
              {isCurrent ? (
                <span className="et-btn et-btn--current">Dein Tarif</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSubscribe(plan.id, plan.name)}
                  disabled={loadingPlan !== null}
                  className={`et-btn${plan.popular ? ' et-btn--primary' : ''}`}
                >
                  {loadingPlan === plan.id ? 'Kasse wird geöffnet …' : `${plan.name} buchen`}
                </button>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
