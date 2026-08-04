// Unit-Test für die CP850-Dekodierung (src/lib/cp850.ts), der Standard-Zeichensatz von
// Datanorm-Dateien. Tabelle war vorher im Bereich 0xE0-0xFF fälschlich CP437 (Griechisch/
// Mathe-Symbole) statt CP850 — betraf u.a. das sehr häufige deutsche "ß".
//
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/cp850.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { decodeCP850 } from '../src/lib/cp850.ts';

test('CP850: deutsche Umlaute und ß werden korrekt dekodiert (gegen echte CP850-Bytes, per iconv erzeugt)', () => {
  // Bytes unabhängig von der App-Tabelle erzeugt: `echo -n 'Straße Größe Übergangsstück' | iconv -f UTF-8 -t CP850`
  const bytes = Uint8Array.from([
    0x53, 0x74, 0x72, 0x61, 0xE1, 0x65, 0x20,             // "Stra" + ß(0xE1) + "e "
    0x47, 0x72, 0x94, 0xE1, 0x65, 0x20,                   // "Gr" + ö(0x94) + ß(0xE1) + "e "
    0x9A, 0x62, 0x65, 0x72, 0x67, 0x61, 0x6E, 0x67, 0x73, 0x73, 0x74, 0x81, 0x63, 0x6B, // Ü(0x9A)+"bergangsst"+ü(0x81)+"ck"
  ]);
  const decoded = decodeCP850(bytes.buffer);
  assert.strictEqual(decoded, 'Straße Größe Übergangsstück');
});

test('CP850: Bereich 0xE0-0xFF matcht die offizielle Unicode.org-CP850-Tabelle (nicht CP437)', () => {
  // unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP850.TXT
  const officialSample = [
    [0xE1, 0xDF], // ß
    [0xE0, 0xD3], // Ó (vorher fälschlich α)
    [0xE9, 0xDA], // Ú (vorher fälschlich Θ)
    [0xF5, 0xA7], // § (vorher fälschlich ⌡)
  ];
  for (const [byte, expectedCodepoint] of officialSample) {
    const decoded = decodeCP850(Uint8Array.from([byte]).buffer);
    assert.strictEqual(decoded, String.fromCodePoint(expectedCodepoint), `Byte 0x${byte.toString(16)}`);
  }
});
