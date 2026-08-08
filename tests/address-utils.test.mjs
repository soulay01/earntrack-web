// Testet die Adress-Helfer src/lib/addressUtils.ts (combineAddress + splitAddress).
//
// Ausführen:
//   node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/address-utils.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { combineAddress, splitAddress } from '../src/lib/addressUtils.ts';

test('combineAddress verbindet Straße, PLZ und Ort im alten Format', () => {
  assert.strictEqual(combineAddress('Musterstraße 12', '10115', 'Berlin'), 'Musterstraße 12, 10115 Berlin');
});

test('combineAddress mit nur Straße', () => {
  assert.strictEqual(combineAddress('Musterstraße 12', '', ''), 'Musterstraße 12');
});

test('combineAddress mit nur PLZ und Ort', () => {
  assert.strictEqual(combineAddress('', '10115', 'Berlin'), '10115 Berlin');
});

test('combineAddress mit Straße und PLZ ohne Ort', () => {
  assert.strictEqual(combineAddress('Musterstraße 12', '10115', ''), 'Musterstraße 12, 10115');
});

test('combineAddress mit leeren Feldern ergibt leeren String', () => {
  assert.strictEqual(combineAddress('', '', ''), '');
});

test('combineAddress trimmt Whitespace', () => {
  assert.strictEqual(combineAddress('  Musterstraße 12 ', ' 10115 ', ' Berlin '), 'Musterstraße 12, 10115 Berlin');
});

test('splitAddress zerlegt vollständige Adresse', () => {
  assert.deepStrictEqual(splitAddress('Musterstraße 12, 10115 Berlin'), { strasse: 'Musterstraße 12', plz: '10115', ort: 'Berlin' });
});

test('splitAddress ohne Komma landet alles in Straße', () => {
  assert.deepStrictEqual(splitAddress('Musterstraße 12'), { strasse: 'Musterstraße 12', plz: '', ort: '' });
});

test('splitAddress mit Ort ohne PLZ', () => {
  assert.deepStrictEqual(splitAddress('Musterstraße 12, Berlin'), { strasse: 'Musterstraße 12', plz: '', ort: 'Berlin' });
});

test('splitAddress nutzt das letzte Komma (mehrteilige Adresse)', () => {
  assert.deepStrictEqual(splitAddress('c/o Weber, Musterstraße 12, 10115 Berlin'), { strasse: 'c/o Weber, Musterstraße 12', plz: '10115', ort: 'Berlin' });
});

test('splitAddress mit mehrteiligem Ort', () => {
  assert.deepStrictEqual(splitAddress('Musterstraße 12, 10115 Berlin Mitte'), { strasse: 'Musterstraße 12', plz: '10115', ort: 'Berlin Mitte' });
});

test('splitAddress mit leerem String', () => {
  assert.deepStrictEqual(splitAddress(''), { strasse: '', plz: '', ort: '' });
});

test('Roundtrip: split(combine(a,b,c)) liefert die Eingaben zurück', () => {
  assert.deepStrictEqual(splitAddress(combineAddress('Musterstraße 12', '10115', 'Berlin')), { strasse: 'Musterstraße 12', plz: '10115', ort: 'Berlin' });
});
