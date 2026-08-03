'use client';

import { INCLUDED_EVERYWHERE } from '@/lib/plans';

/**
 * Alles, was in jedem Tarif steckt — einmal in voller Breite statt dreimal in
 * den Karten. Die Menge ist das Argument, deshalb steht sie ungeteilt da.
 */
export default function IncludedGrid() {
  const total = INCLUDED_EVERYWHERE.reduce((n, g) => n + g.items.length, 0);

  return (
    <section aria-labelledby="included-heading">
      <h2 id="included-heading" className="et-h2">Das ist überall drin</h2>

      <p className="et-included__claim">
        <span className="et-included__count">{total}</span>
        <span className="et-included__claimtext">
          Funktionen sind in <strong>jedem</strong> Tarif enthalten —
          auch im kleinsten für 27,99&nbsp;€ im Monat.
        </span>
      </p>

      <div className="et-included">
        {INCLUDED_EVERYWHERE.map((group) => (
          <div key={group.group} className="et-included__group">
            <h3 className="et-included__title">{group.group}</h3>
            <ul className="et-included__list">
              {group.items.map((item) => (
                <li key={item} className="et-included__item">
                  <span className="et-included__mark" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
