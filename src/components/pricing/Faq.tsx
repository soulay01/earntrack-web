'use client';

/**
 * Die Fragen, die vor dem Kauf im Weg stehen. Alle Antworten sind aus AGB und
 * Anwendungsverhalten belegt — wer hier etwas ändert, muss vorher prüfen, ob
 * die AGB (src/app/agb/page.tsx) dasselbe sagt.
 *
 * Aufklappen läuft über natives <details>. Kein Zustand, keine Bibliothek,
 * funktioniert ohne JavaScript und ist von Haus aus tastaturbedienbar.
 */
const ITEMS = [
  {
    q: 'Kommen zu dem Preis noch Kosten dazu?',
    a: 'Nein. Keine Einrichtungsgebühr, keine Schulungspakete, keine Kosten pro Mitarbeiter. Der Tarifpreis ist alles, was du zahlst.',
  },
  {
    q: 'Zahle ich pro Mitarbeiter?',
    a: 'Nein, der Preis gilt für den ganzen Betrieb. Ob du zwei oder fünf Leute im Team-Tarif anlegst, ändert nichts am Betrag. Nur wenn du über die Mitarbeiterzahl deines Tarifs hinauswächst, wechselst du in den nächstgrößeren.',
  },
  {
    q: 'Was passiert nach den 14 Testtagen?',
    a: 'Nichts wird automatisch abgebucht — du musst dich aktiv für einen Tarif entscheiden. Ohne Tarif kommst du nicht mehr in die App, deine Daten bleiben aber gespeichert und sind sofort wieder da, sobald du buchst.',
  },
  {
    q: 'Wie bezahle ich?',
    a: 'Per SEPA-Lastschrift über unseren Zahlungsdienstleister Stripe. Der Betrag wird monatlich von deinem Konto eingezogen.',
  },
  {
    q: 'Kann ich den Tarif später wechseln?',
    a: 'Ja, jederzeit. Der neue Tarif greift sofort, der Rest des laufenden Monats wird verrechnet.',
  },
  {
    q: 'Wo liegen meine Daten?',
    a: 'Auf Servern in der Europäischen Union, DSGVO-konform. Wir geben deine Daten nicht an Dritte weiter und werten sie nicht für Werbung aus.',
  },
];

export default function Faq() {
  return (
    <section aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="et-h2">Häufige Fragen</h2>

      <div className="et-faq">
        {ITEMS.map((item) => (
          <details key={item.q} className="et-faq__item">
            <summary className="et-faq__q">
              {item.q}
              <span className="et-faq__sign" aria-hidden="true" />
            </summary>
            <p className="et-faq__a">{item.a}</p>
          </details>
        ))}
      </div>

      <p className="et-faq__contact">
        Etwas anderes auf dem Herzen?{' '}
        <a href="mailto:info@earntrack.de" className="et-foot__link">info@earntrack.de</a>
        {' '}— wir antworten normalerweise noch am selben Werktag.
      </p>
    </section>
  );
}
