// Unit-Tests für den DATEV-Export (src/lib/datev.ts).
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/datev-export.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { generateDatevBuchungsstapel, generateDatevFilename } from '../src/lib/datev.ts';

const assignment = { umsatz: '1000', datum: '15.03.2026', kunde: 'Musterkunde GmbH', projekt: 'Badsanierung' };

test('Kopfzeile und jede Datenzeile haben dieselbe Feldanzahl (kein Spalten-Offset)', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  const headerFieldCount = lines[2].split(';').length;
  const dataLines = lines.slice(3).filter(Boolean);
  assert.ok(dataLines.length > 0, 'Es sollte mindestens eine Buchungszeile geben');
  for (const line of dataLines) {
    assert.strictEqual(line.split(';').length, headerFieldCount, `Zeile "${line}" muss ${headerFieldCount} Felder haben`);
  }
});

test('Spaltenüberschriften enden bei Buchungstext, keine erfundenen Feldnamen danach', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  const headers = lines[2].split(';');
  assert.strictEqual(headers[headers.length - 1], 'Buchungstext');
  assert.strictEqual(headers.length, 14);
});

// Feldnamen 1:1 gegen die offizielle DATEV-Spec verifiziert (via `datev` Ruby-Gem,
// die selbst auf DATEVs Dok.-Nr. 1036228/D103622800010 referenziert).
test('Spaltenüberschriften matchen exakt die offizielle DATEV-Feldbezeichnung', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const headers = csv.replace(/^﻿/, '').split('\r\n')[2].split(';');
  assert.deepStrictEqual(headers, [
    'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs',
    'Basisumsatz', 'WKZ Basisumsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext',
  ]);
});

test('Beraternummer in der Vorsatzzeile ist >= 1001 (DATEV lehnt 0 als ungültig ab)', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const vorsatz = csv.replace(/^﻿/, '').split('\r\n')[0].split(';');
  const beraternummer = parseInt(vorsatz[10], 10);
  assert.ok(beraternummer >= 1001, `Beraternummer ${beraternummer} muss >= 1001 sein`);
});

// Position 21 = Festschreibung, Position 22 = WKZ laut offizieller Spec (verifiziert via
// datev-Gem header.rb). Vorher fehlte Festschreibung, wodurch WKZ auf Position 21 rutschte.
test('Vorsatzzeile hat WKZ=EUR an der korrekten Position 22 (nach Festschreibung)', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04');
  const vorsatz = csv.replace(/^﻿/, '').split('\r\n')[0].split(';');
  assert.strictEqual(vorsatz.length, 22, 'Vorsatzzeile muss 22 Felder haben');
  assert.strictEqual(vorsatz[19], '0', 'Feld 20: Rechnungslegungszweck');
  assert.strictEqual(vorsatz[20], '', 'Feld 21: Festschreibung (leer = nicht definiert)');
  assert.strictEqual(vorsatz[21], 'EUR', 'Feld 22: WKZ');
});

test('SKR04 bei 19% USt bucht auf Erlöskonto 4400 mit BU-Schlüssel 9', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[3];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[7], '4400', 'Gegenkonto (Erlöskonto)');
  assert.strictEqual(fields[8], '9', 'BU-Schlüssel für 19% USt');
});

test('SKR03 bei 7% USt bucht auf Erlöskonto 8300 mit BU-Schlüssel 2', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 7, '03', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[3];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[7], '8300');
  assert.strictEqual(fields[8], '2');
});

test('Bruttoumsatz wird korrekt aus Netto + Steuersatz berechnet', () => {
  const csv = generateDatevBuchungsstapel([assignment], 'Testfirma', 19, '04', [{ name: 'Musterkunde GmbH' }]);
  const dataLine = csv.replace(/^﻿/, '').split('\r\n')[3];
  const fields = dataLine.split(';');
  assert.strictEqual(fields[0], '1190,00', 'Netto 1000 + 19% USt = 1190,00');
});

test('generateDatevFilename enthält SKR-Kennzeichen und Buchungsanzahl', () => {
  const name = generateDatevFilename(3, '04');
  assert.match(name, /^EarnTrack_DATEV_SKR04_\d{4}_\d{2}_\d{2}_3Buchungen\.csv$/);
});
