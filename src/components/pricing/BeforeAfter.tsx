'use client';

/**
 * Vorher/Nachher im Klartext.
 *
 * Bewusst ohne Metapher: links ein Handgriff, den der Chef heute selbst macht,
 * rechts auf gleicher Höhe, was stattdessen passiert. Die Paare stehen sich
 * zeilenweise gegenüber — der Tausch soll ohne Nachdenken lesbar sein.
 */
const PAIRS = [
  {
    before: 'Stundenzettel am Monatsende einsammeln und abtippen',
    after: 'Deine Leute stempeln am Handy — die Stunden sind sofort da',
  },
  {
    before: 'Excel-Liste, wer wann auf welcher Baustelle war',
    after: 'Jede Stunde hängt automatisch am richtigen Auftrag',
  },
  {
    before: 'Angebot schreiben, später alles nochmal als Rechnung tippen',
    after: 'Aus dem Angebot wird die Rechnung — ein Klick',
  },
  {
    before: 'Offene Rechnungen im Kopf behalten und hinterhertelefonieren',
    after: 'Alle offenen Posten auf einer Seite, Mahnung per Klick',
  },
  {
    before: 'Erst beim Steuerberater sehen, ob der Auftrag was gebracht hat',
    after: 'Du siehst pro Auftrag mit, was hängen bleibt',
  },
  {
    before: 'Belege und Fotos im Handschuhfach, auf WhatsApp, im Kopf',
    after: 'Alles am Auftrag — auf der Baustelle und im Büro dasselbe',
  },
];

export default function BeforeAfter() {
  return (
    <section aria-labelledby="ba-heading">
      <h2 id="ba-heading" className="et-h2">Was sich ab morgen ändert</h2>

      <div className="et-ba">
        <p className="et-ba__title et-ba__title--before">Ohne EarnTrack</p>
        <p className="et-ba__title et-ba__title--after">Mit EarnTrack</p>

        {PAIRS.map((p) => (
          <div key={p.before} className="et-ba__pair">
            <div className="et-ba__cell et-ba__cell--before">
              <span className="et-ba__icon" aria-hidden="true">✕</span>
              <span>{p.before}</span>
            </div>
            <div className="et-ba__cell et-ba__cell--after">
              <span className="et-ba__icon" aria-hidden="true">✓</span>
              <span>{p.after}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
