// Unit-Tests für den Datanorm-Import (src/lib/datanorm.ts).
// Feldlayout gegen 13 echte, MIT-lizenzierte Beispieldateien verifiziert:
// https://github.com/halo/datanorm/tree/main/test/assets
// Zusätzlich gegen eine echte, aktuell produktive Lieferantendatei getestet (ARI Armaturen,
// ari-armaturen.com/de/downloads/datanorm, 1827 Artikel, 0 Fehler, 100% korrekte Preise/EAN).
//
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/datanorm.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { parseDatanorm, validateDatanorm } from '../src/lib/datanorm.ts';

// Reale V4-Kopfzeile + A-Satz (Warengruppe an Index 3, Name1 an Index 4, Preis an Index 9).
const v4Header = 'V 050321(C) Beispiel KG, Beispielstadt              Preispflege Datanorm                                     04EUR';
const v4Article = 'A;N;Z-0159;30;Aufbewahrungspult;ABP;2;0;St;19900; ; ;TZ-0159;';

test('V4: Artikelnummer, Name und Preis werden korrekt aus dem A-Satz gelesen (nicht "N" als Artikelnummer)', () => {
  const result = parseDatanorm([v4Header, v4Article].join('\r\n'));
  assert.strictEqual(result.articles.length, 1);
  const a = result.articles[0];
  assert.strictEqual(a.articleNo, 'Z-0159', 'Artikelnummer darf nicht der Aktionscode "N" sein');
  assert.strictEqual(a.name1, 'Aufbewahrungspult');
  assert.strictEqual(a.unit, 'St');
  assert.strictEqual(a.price, 199, '19900 Cent = 199,00 €');
});

// Feldposition 9 im V4-B-Satz = EAN, an einer echten Lieferantendatei verifiziert (ARI
// Armaturen: 1827 von 1827 Sätzen hatten dort ein gültiges 13-stelliges EAN).
test('V4: EAN wird aus Feld 9 des B-Satzes übernommen', () => {
  const bRecord = 'B;N;Z-0159; ; ; ;0;0;0;4054287000006; ;560999;0;0; ; ;';
  const result = parseDatanorm([v4Header, v4Article, bRecord].join('\r\n'));
  assert.strictEqual(result.articles[0].ean, '4054287000006');
});

test('B-Satz-Feld 9 wird nur als EAN übernommen, wenn es wie eine echte EAN aussieht (rein numerisch, plausible Länge)', () => {
  const bRecordJunk = 'B;N;Z-0159; ; ; ;0;0;0;keine-ean; ;560999;0;0; ; ;';
  const result = parseDatanorm([v4Header, v4Article, bRecordJunk].join('\r\n'));
  assert.strictEqual(result.articles[0].ean, '', 'Unplausible Werte dürfen nicht als EAN übernommen werden');
});

// Reale V5-Kopfzeile + A-Satz (kein Warengruppe-Feld, Name1 direkt an Index 3, Preis an Index 8).
const v5Header = 'V;050;A;20200730;EUR;Beispiel GmbH;;EXAMPLE;EXAMPLE GMBH;www.example.de;info@example.de;;;;;';
const v5Article = 'A;N;100033152;DIS-AM 20 BUS;Infrarot-Bewegungsmelder;St.;1;1;13900;06;004;004.050;;;;EXAMPLE;100033152;;;;;;4;TNT6841;;;;;;';

test('V5: Artikelnummer, Name und Preis werden korrekt aus dem A-Satz gelesen (anderes Feldlayout als V4)', () => {
  const result = parseDatanorm([v5Header, v5Article].join('\r\n'));
  assert.strictEqual(result.articles.length, 1);
  const a = result.articles[0];
  assert.strictEqual(a.articleNo, '100033152');
  assert.strictEqual(a.name1, 'DIS-AM 20 BUS');
  assert.strictEqual(a.name2, 'Infrarot-Bewegungsmelder');
  assert.strictEqual(a.unit, 'St.');
  assert.strictEqual(a.price, 139, '13900 Cent = 139,00 €');
});

test('V5: C-Satz überschreibt den Preis nicht (C ist laut Format Arbeitszeit/Ausschreibungstext, kein Preisfeld)', () => {
  // Reales Beispiel: "C;N;ARBA;100033152;2;2;600;" ist ein Arbeitszeit-Satz, kein Preis-Satz.
  const cRecord = 'C;N;ARBA;100033152;2;2;600;';
  const result = parseDatanorm([v5Header, v5Article, cRecord].join('\r\n'));
  const a = result.articles.find(x => x.articleNo === '100033152');
  assert.strictEqual(a.price, 139, 'Preis muss weiterhin aus dem A-Satz stammen, nicht aus dem C-Satz verfälscht werden');
});

// P-Satz (reine Preisdatei, z.B. DATPREIS.001): Blockbreite 9 Felder je Artikel.
const pRecordHeader = 'V 050321(C) Beispiel KG, Beispielstadt              Preispflege Datanorm                                     04EUR';
const pRecord = 'P;A;RG6040640U1;1;85700;1;5500;;;;;RG6050840U1;1;107300;1;5500;;;;;RG6060950U1;1;161200;1;5500;;;;;';

test('P-Satz (reine Preisdatei ohne A-Sätze): alle drei Artikelblöcke werden mit korrektem Preis erkannt', () => {
  const result = parseDatanorm([pRecordHeader, pRecord].join('\r\n'));
  assert.strictEqual(result.articles.length, 3);
  const byNo = Object.fromEntries(result.articles.map(a => [a.articleNo, a.price]));
  assert.strictEqual(byNo['RG6040640U1'], 857, '85700 Cent = 857,00 €');
  assert.strictEqual(byNo['RG6050840U1'], 1073, '107300 Cent = 1073,00 €');
  assert.strictEqual(byNo['RG6060950U1'], 1612, '161200 Cent = 1612,00 €');
});

test('Formaterkennung findet den A-Satz auch, wenn tausende Langtext-Zeilen davor stehen', () => {
  // Reale Dateien haben oft zehntausende T-Sätze vor dem ersten Artikel (gemessen: Zeile 26098 von
  // 26106). Das alte 120-Zeilen-Limit hätte das als generic-csv statt Datanorm A/B/C erkannt.
  const manyTextLines = Array.from({ length: 500 }, (_, i) => `T;N;TZ-${i};;1;;Textzeile ${i};`);
  const content = [v4Header, ...manyTextLines, v4Article].join('\r\n');
  const result = parseDatanorm(content);
  assert.strictEqual(result.articles.length, 1);
  assert.strictEqual(result.articles[0].articleNo, 'Z-0159');
});

// Eine gewöhnliche, semikolon-getrennte CSV, deren erste Datenzeile zufällig mit "100" beginnt
// (z.B. eine Artikelnummer), wurde vorher fälschlich als "Datanorm 100/200/300" erkannt und
// validateDatanorm() meldete Erfolg — der Import lieferte aber still 0 Artikel. Dieses
// Satzformat wurde entfernt, da sich keine reale Quelle dafür finden ließ und die Erkennung
// nachweislich unsicher war. Jetzt muss ehrlich "nicht erkannt" gemeldet werden.
test('Gewöhnliche CSV, die zufällig mit "100" beginnt, wird nicht fälschlich als Datanorm erkannt', () => {
  const content = 'Artikelnummer;Bezeichnung;Preis\n100234;Schraube M6;0,45\n100235;Mutter M6;0,12';
  const validation = validateDatanorm(content);
  assert.strictEqual(validation.valid, false, 'Darf nicht als gültiges Datanorm-Format erkannt werden');
  const result = parseDatanorm(content);
  assert.strictEqual(result.articles.length, 0);
});
