'use client';

/**
 * Die Zusicherungen direkt über den Tarifkarten — genau dort, wo der Kunde
 * anfängt zu rechnen und die letzten Einwände hochkommen.
 *
 * Jede Aussage ist belegbar: kein Setup-Preis im Produkt, Preis gilt je
 * Betrieb (siehe PLAN_LIMITS), Kündigung über die App, Testphase 14 Tage.
 */
const ITEMS = [
  {
    title: 'Keine Einrichtungsgebühr',
    text: 'Kein Setup-Paket, keine Pflichtschulung. Du legst los und zahlst nur den Tarif.',
  },
  {
    title: 'Pro Betrieb, nicht pro Kopf',
    text: 'Ein Preis für dein Team. Ein Mitarbeiter mehr kostet dich keinen Cent extra.',
  },
  {
    title: 'Monatlich kündbar',
    text: 'Keine Jahresbindung, kein Kleingedrucktes. Kündigen geht direkt in der App.',
  },
  {
    title: '14 Tage kostenlos testen',
    text: 'Mit dem ganzen Team, allen Funktionen und ohne dass etwas abgebucht wird.',
  },
];

export default function Promises() {
  return (
    <div className="et-promise">
      {ITEMS.map((i) => (
        <div key={i.title} className="et-promise__item">
          <p className="et-promise__title">{i.title}</p>
          <p className="et-promise__text">{i.text}</p>
        </div>
      ))}
    </div>
  );
}
