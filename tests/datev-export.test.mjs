// Unit-Tests für den DATEV-Export (src/lib/datev.ts).
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/datev-export.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { generateDatevBuchungsstapel, generateDatevFilename } from '../src/lib/datev.ts';

const assignment = { umsatz: '1000', datum: '15.03.2026', kunde: 'Musterkunde GmbH', projekt: 'Badsanierung' };

// DATEV verlangt Windows-1252 (ANSI), keine UTF-8-Kodierung (bestätigt durch das datev-Gem
// und das DATEV-Community-Forum) — eine BOM ist ein reines UTF-Konzept und darf hier nicht
// mehr vorkommen. Die eigentliche Byte-Kodierung passiert separat via encodeWindows1252()
// (siehe tests/cp1252.test.mjs), hier wird nur sichergestellt, dass der String selbst sauber ist.
test('Kein BOM am Anfang der generierten CSV', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  assert.notStrictEqual(csv.charCodeAt(0), 0xFEFF, 'BOM (U+FEFF) darf nicht vorhanden sein — DATEV erwartet Windows-1252, kein UTF-Format');
});

// Offizielle Formatbeschreibung (developer.datev.de + unabhängig verifiziert): Zeile 1 =
// EXTF-Vorsatzzeile, Zeile 2 = Spaltenüberschriften, Zeile 3+ = Buchungen — OHNE Leerzeile
// dazwischen. Eine Leerzeile verschiebt jede Zeile um eins und lässt DATEV-Importer entweder
// ablehnen oder Felder falsch zuordnen.
test('Keine Leerzeile zwischen Vorsatzzeile und Spaltenüberschriften', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.notStrictEqual(lines[1], '', 'Zeile 2 muss die Spaltenüberschriften sein, keine Leerzeile');
  assert.ok(lines[1].startsWith('Umsatz'), 'Zeile 2 muss mit der ersten Spaltenüberschrift beginnen');
});

test('Kopfzeile und jede Datenzeile haben dieselbe Feldanzahl (kein Spalten-Offset)', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  const headerFieldCount = lines[1].split(';').length;
  const dataLines = lines.slice(2).filter(Boolean);
  assert.ok(dataLines.length > 0, 'Es sollte mindestens eine Buchungszeile geben');
  for (const line of dataLines) {
    assert.strictEqual(line.split(';').length, headerFieldCount, `Zeile "${line}" muss ${headerFieldCount} Felder haben`);
  }
});

// Vorher nahmen wir an, eine Zeile dürfe nach "Buchungstext" (Spalte 14) enden — das war
// unbelegt (nur aus einer vagen Web-Zusammenfassung übernommen). Zwei unabhängige echte
// Referenzdateien (datev-Gem: 125 Felder; JensWalter/datev-types-rs: 124 Felder bei
// Formatversion 12) haben JEDE Datenzeile exakt so lang wie die Spaltenüberschriften — nie
// abgeschnitten. Ein unabhängiger Parser (pydatev) lehnt kürzere Zeilen sogar hart ab.
test('Spaltenüberschriften umfassen alle 125 Felder von Formatversion 13, letztes Feld "Abw. Skontokonto"', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  const headers = lines[1].split(';');
  assert.strictEqual(headers.length, 125, 'Formatversion 13 hat laut formaler DATEV-Feldspezifikation 125 Felder');
  assert.strictEqual(headers[13], 'Buchungstext', 'Feld 14 bleibt Buchungstext (unsere letzte tatsächlich befüllte Spalte)');
  assert.strictEqual(headers[124], 'Abw. Skontokonto', 'Feld 125 ist das letzte laut Spec');
});

// Feldnamen 1:1 gegen die echte Spaltenüberschriften-Zeile einer realen Exportdatei
// verifiziert (github.com/JensWalter/datev-types-rs). "Basis-Umsatz"/"WKZ Basis-Umsatz" mit
// Bindestrich (vorher fälschlich "Basisumsatz" ohne), "Konto" statt "Kontonummer" (Alias).
test('Spaltenüberschriften (erste 14 Felder) matchen exakt die echte DATEV-Feldbezeichnung', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const headers = csv.replace(/^﻿/, '').split('\r\n')[1].split(';');
  assert.deepStrictEqual(headers.slice(0, 14), [
    'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs',
    'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext',
  ]);
});

test('WJ-Beginn liegt nie nach der frühesten Buchung (sonst lehnt DATEV den Import ab)', () => {
  // Absichtlich eine Buchung aus einem Vorjahr, damit WJ-Beginn nicht einfach der 1.1.
  // des aktuellen Jahres sein darf.
  const oldAssignment = { umsatz: '500', datum: '10.02.2020', kunde: 'Alt-Kunde', projekt: 'x' };
  const csv = generateDatevBuchungsstapel([oldAssignment], 'Testfirma', 19, '04');
  const vorsatz = csv.replace(/^﻿/, '').split('\r\n')[0].split(';');
  const wjBeginn = vorsatz[12]; // Feld 13: WJ-Beginn (YYYYMMDD)
  const datumVon = vorsatz[14]; // Feld 15: Datum von (YYYYMMDD)
  assert.ok(wjBeginn <= datumVon, `WJ-Beginn (${wjBeginn}) darf nicht nach Datum von (${datumVon}) liegen`);
  assert.strictEqual(wjBeginn, '20200101');
});

test('Beraternummer in der Vorsatzzeile ist >= 1001 (DATEV lehnt 0 als ungültig ab)', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const vorsatz = csv.replace(/^﻿/, '').split('\r\n')[0].split(';');
  const beraternummer = parseInt(vorsatz[10], 10);
  assert.ok(beraternummer >= 1001, `Beraternummer ${beraternummer} muss >= 1001 sein`);
});

// Position 21 = Festschreibung, Position 22 = WKZ laut offizieller Spec (verifiziert via
// datev-Gem header.rb). Vorher fehlte Festschreibung, wodurch WKZ auf Position 21 rutschte.
// Felder 23-31 (reserviert/optional) müssen laut echtem Gem-Beispiel als leere Felder bis
// Feld 31 vorhanden sein, nicht nach Feld 22 abgeschnitten.
test('Vorsatzzeile hat WKZ=EUR an der korrekten Position 22 und insgesamt 31 Felder', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const vorsatz = csv.replace(/^﻿/, '').split('\r\n')[0].split(';');
  assert.strictEqual(vorsatz.length, 31, 'Vorsatzzeile muss 31 Felder haben (wie im echten datev-Gem-Beispiel)');
  assert.strictEqual(vorsatz[19], '0', 'Feld 20: Rechnungslegungszweck');
  assert.strictEqual(vorsatz[20], '', 'Feld 21: Festschreibung (leer = nicht definiert)');
  assert.strictEqual(vorsatz[21], '"EUR"', 'Feld 22: WKZ (Text-Feldtyp, muss quotiert sein)');
});

test('Formatversion ist 13, nicht die veraltete "7"', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const vorsatz = csv.replace(/^﻿/, '').split('\r\n')[0].split(';');
  assert.strictEqual(vorsatz[4], '13', 'Feld 5: Formatversion');
});

// Feld 27 = SKR, bestätigt durch eine zweite unabhängige reale Exportdatei
// (github.com/JensWalter/datev-types-rs, dort mit "03" befüllt). Der SKR ist uns als
// Parameter bekannt, sollte also nicht ungenutzt leer bleiben.
test('Feld 27 (SKR) wird mit dem tatsächlichen Kontenrahmen befüllt', () => {
  const csvSkr03 = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '03');
  const csvSkr04 = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  assert.strictEqual(csvSkr03.split('\r\n')[0].split(';')[26], '"03"');
  assert.strictEqual(csvSkr04.split('\r\n')[0].split(';')[26], '"04"');
});

test('SKR04 bei 19% USt bucht auf Erlöskonto 4400 mit BU-Schlüssel 9', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[2];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[7], '4400', 'Gegenkonto (Erlöskonto)');
  assert.strictEqual(fields[8], '"9"', 'BU-Schlüssel für 19% USt (Text-Feldtyp, muss quotiert sein)');
});

test('SKR03 bei 7% USt bucht auf Erlöskonto 8300 mit BU-Schlüssel 2', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 7, '03', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[2];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[7], '8300');
  assert.strictEqual(fields[8], '"2"');
});

test('Bruttoumsatz wird korrekt aus Netto + Steuersatz berechnet', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[2];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[0], '1190,00', 'Netto 1000 + 19% USt = 1190,00');
});

// 890.50*1.19 ist intern 1059.6949999999999 (Floating-Point) — naives toFixed(2) rundet
// das fälschlich auf 1059,69 statt korrekt 1059,70 und weicht dann vom sichtbaren
// Rechnungsbetrag (der über toLocaleString korrekt rundet) um einen Cent ab.
test('Bruttoumsatz rundet korrekt trotz Floating-Point-Fehler (890,50€ + 19%)', () => {
  const roundingCase = { umsatz: '890,50', datum: '15.03.2026', kunde: 'Musterkunde GmbH', projekt: 'x' };
  const csv = generateDatevBuchungsstapel([roundingCase], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[2];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[0], '1059,70', 'Muss korrekt gerundet werden, nicht 1059,69');
});

// ';' ist der Feldtrenner. Ein Semikolon in Kunden- oder Projektname (z.B. "Müller; Schmidt
// GmbH") fügte vorher ein zusätzliches Feld ein und verschob die Zeile — per Test verifiziert:
// 16 statt 14 Felder.
test('Semikolon in Kunden-/Projektname zerstört nicht die Feldstruktur', () => {
  const a = { umsatz: '500', datum: '01.03.2026', kunde: 'Müller; Schmidt GmbH', projekt: 'Reinigung; Wartung' };
  const csv = generateDatevBuchungsstapel([a], 'Testfirma', 19, '04');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  const headerFieldCount = lines[1].split(';').length;
  assert.strictEqual(lines[2].split(';').length, headerFieldCount, 'Datenzeile muss trotz Semikolon im Freitext dieselbe Feldanzahl wie der Header haben');
  assert.ok(lines[2].includes('Müller, Schmidt GmbH'), 'Semikolon sollte durch Komma ersetzt werden, nicht die Zeile zerstören');
});

// Text-Feldtyp-Werte müssen in Anführungszeichen stehen — ohne das entfernt ein unabhängiger,
// spezifikationstreuer Parser (pydatev, github.com/Fjanks/pydatev) beim Wiedereinlesen
// unbedingt das erste und letzte Zeichen (in der Annahme, es seien Anführungszeichen) und
// zerstört dadurch echten Inhalt: "Buchungsstapel" unquotiert wurde beim Test zu "uchungsstape".
// Beide unabhängig geprüften realen Referenzdateien (datev-Gem, JensWalter/datev-types-rs)
// quotieren Text-Felder durchgängig.
test('Text-Felder (DATEV-Format-KZ, Formatname) sind in Anführungszeichen gesetzt', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const vorsatz = csv.split('\r\n')[0].split(';');
  assert.strictEqual(vorsatz[0], '"EXTF"', 'Feld 1: DATEV-Format-KZ');
  assert.strictEqual(vorsatz[3], '"Buchungsstapel"', 'Feld 4: Formatname');
});

test('Ein literales Anführungszeichen im Firmennamen wird korrekt verdoppelt (CSV-Escaping)', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Firma "Musterbau" GmbH', 19, '04');
  const vorsatz = csv.split('\r\n')[0].split(';');
  assert.strictEqual(vorsatz[16], '"Firma ""Musterbau"" GmbH"', 'Feld 17: Bezeichnung mit verdoppeltem Anführungszeichen');
});

test('generateDatevFilename enthält SKR-Kennzeichen und Buchungsanzahl', () => {
  const name = generateDatevFilename(3, '04');
  assert.match(name, /^EarnTrack_DATEV_SKR04_\d{4}_\d{2}_\d{2}_3Buchungen\.csv$/);
});
