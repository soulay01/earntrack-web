'use client';

/**
 * Der Weg einer Stunde, als Fließschema mit Positionsnummern.
 *
 * Die Nummerierung ist hier zulässig, weil der Inhalt tatsächlich eine
 * Reihenfolge ist: die Stunde durchläuft diese Stationen in genau dieser
 * Folge. Wo keine Reihenfolge besteht, hätte die Nummer nichts zu sagen.
 *
 * Gegenstück zur Bemaßung darüber: dort sieben getrennte Felder, hier eine
 * durchgehende Linie. Das ist derselbe Gedanke, einmal als Zustand und
 * einmal als Ablauf.
 */
const STATIONS = [
  {
    title: 'Stempeln',
    where: 'auf der Baustelle',
    text: 'Deine Leute stempeln am Handy, Pausen inklusive. Du siehst die Stunden im Büro, ohne hinterherzutelefonieren.',
  },
  {
    title: 'Sammeln',
    where: 'am Auftrag',
    text: 'Stunden, Material, Fotos und Absprachen hängen am selben Auftrag. Du suchst nichts mehr zusammen.',
  },
  {
    title: 'Abrechnen',
    where: 'ohne Neu-Tippen',
    text: 'Aus dem Auftrag wird das Angebot, daraus die Rechnung — als E-Rechnung nach ZUGFeRD. Offene Posten stehen auf einer Seite, die Mahnung erzeugst du per Klick.',
  },
  {
    title: 'Nachrechnen',
    where: 'während es läuft',
    text: 'Der Profit Score zeigt pro Auftrag, was hängen bleibt. Der Steuerberater bekommt die Zahlen als DATEV-Export.',
  },
];

export default function WorkflowChain() {
  return (
    <section aria-labelledby="chain-heading">
      <h2 id="chain-heading" className="et-h2">
        So läuft eine Stunde durch — von der Baustelle bis auf die Rechnung
      </h2>

      <ol className="et-chain">
        {STATIONS.map((s, i) => (
          <li key={s.title} className="et-chain__station">
            <span className="et-chain__pos" aria-hidden="true">{i + 1}</span>
            <h3 className="et-chain__title">{s.title}</h3>
            <p className="et-chain__where">{s.where}</p>
            <p className="et-chain__text">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
