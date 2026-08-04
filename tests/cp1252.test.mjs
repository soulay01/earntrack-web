// Unit-Test für die Windows-1252-Kodierung (src/lib/cp1252.ts), die von DATEV für den
// Buchungsstapel-Export zwingend verlangt wird (nicht UTF-8) — bestätigt durch das
// DATEV-Community-Forum und das aktiv gepflegte `datev`-Ruby-Gem (github.com/ledermann/datev),
// dessen Export-Code explizit `.encode('windows-1252', ...)` aufruft. Vorher exportierte die
// App UTF-8 mit BOM, was Umlaute in Kunden-/Firmennamen beim DATEV-Import verstümmelt hätte.
//
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/cp1252.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { encodeWindows1252 } from '../src/lib/cp1252.ts';

test('CP1252: deutsche Umlaute, ß und € werden korrekt kodiert (gegen echte CP1252-Bytes, per iconv erzeugt)', () => {
  // `printf 'Müller & Söhne "Bau" GmbH – Größe: 5€' | iconv -f UTF-8 -t CP1252 | xxd -p`
  const expectedHex = '4dfc6c6c657220262053f6686e6520224261752220476d62482096204772f6df653a203580';
  const encoded = encodeWindows1252('Müller & Söhne "Bau" GmbH – Größe: 5€');
  assert.strictEqual(Buffer.from(encoded).toString('hex'), expectedHex);
});

test('CP1252: unbekannte Zeichen (z.B. Emoji) werden durch Leerzeichen ersetzt statt zu crashen', () => {
  // Spiegelt das `invalid: :replace, undef: :replace, replace: \' \'` des datev-Gems.
  const encoded = encodeWindows1252('Test 😀 Ende');
  assert.doesNotThrow(() => encodeWindows1252('Test 😀 Ende'));
  assert.ok(Buffer.from(encoded).toString('latin1').includes('Test'));
  assert.ok(Buffer.from(encoded).toString('latin1').includes('Ende'));
});

test('CP1252: ASCII-Text bleibt unverändert (Identitätsabbildung 0x00-0x7F)', () => {
  const encoded = encodeWindows1252('Hello World 123');
  assert.strictEqual(Buffer.from(encoded).toString('ascii'), 'Hello World 123');
});
