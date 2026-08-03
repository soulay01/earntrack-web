'use client';

/**
 * Preisvergleich für den häufigsten Fall: ein Betrieb mit fünf Mitarbeitern.
 *
 * WICHTIG für spätere Pflege:
 * - Alle Beträge sind NETTO. Die Wettbewerber weisen netto aus, EarnTrack
 *   brutto (49,99 € inkl. MwSt. = 42,01 € netto). Brutto gegen netto zu
 *   stellen wäre irreführend.
 * - Die Fremdpreise sind Listenpreise von den Anbieterseiten, Stand siehe
 *   STAND. Wer die Zahlen anfasst, muss das Datum mitziehen — ein veralteter
 *   Vergleich ist wettbewerbsrechtlich angreifbar.
 */
const STAND = 'Juli 2026';

const ROWS = [
  { name: 'EarnTrack Team', net: 42.01, note: 'für den ganzen Betrieb', own: true },
  { name: 'Craftboxx', net: 99.95, note: '19,99 € je Nutzer × 5' },
  { name: 'Plancraft Pro', net: 109.9, note: 'Jahresabo' },
  { name: 'ToolTime Team', net: 112.0, note: 'Lizenzmodell' },
];

const MAX = Math.max(...ROWS.map((r) => r.net));

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PriceCompare() {
  return (
    <section aria-labelledby="cmp-heading">
      <h2 id="cmp-heading" className="et-h2">Was fünf Mitarbeiter im Monat kosten</h2>

      <div className="et-cmp">
        {ROWS.map((r) => (
          <div key={r.name} className={`et-cmp__row${r.own ? ' et-cmp__row--own' : ''}`}>
            <div className="et-cmp__label">
              <span className="et-cmp__name">{r.name}</span>
              <span className="et-cmp__note">{r.note}</span>
            </div>
            <div className="et-cmp__track">
              <div className="et-cmp__bar" style={{ width: `${(r.net / MAX) * 100}%` }}>
                <span className="et-cmp__value">{eur(r.net)}&nbsp;€</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="et-cmp__foot">
        Alle Beträge netto pro Monat, Stand {STAND}. EarnTrack kostet 49,99&nbsp;€ inkl.
        MwSt., hier zum Vergleich netto ausgewiesen. Fremdpreise sind Listenpreise der
        jeweiligen Anbieter und können sich ändern.
      </p>
    </section>
  );
}
