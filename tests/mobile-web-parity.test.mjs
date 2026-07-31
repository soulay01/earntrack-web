// Prüft, dass Mobile-App und Web-App bei identischen Daten identische Zahlen liefern.
//
// Hintergrund: Beide Codebasen haben eine eigene Kopie der Gewinnlogik
// (EarnTrack-Android/utils/{calculations,smartPricing}.js vs. src/lib/{calculations,smartPricing}.ts).
// Diese Kopien sind auseinandergedriftet — Mobile zählte Material-VK nicht zum Umsatz,
// Web schon. Ergebnis: derselbe Auftrag bekam auf Mobile "D" und auf Web "A".
// Dieser Test lädt BEIDE echten Implementierungen und vergleicht sie.
//
// Ausführen:
//   node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/mobile-web-parity.test.mjs
// Wird übersprungen, wenn das Mobile-Repo nicht daneben liegt (z.B. in CI).

import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileUtils = path.resolve(here, '../../EarnTrack-Android/utils');

const mobileAvailable = fs.existsSync(path.join(mobileUtils, 'smartPricing.js'));

// Mobile-Dateien sind ESM in .js-Dateien ohne "type": "module" — Node lädt sie so nicht.
// Deshalb 1:1 nach .mjs kopieren und nur die relativen Import-Pfade umbiegen.
function loadMobile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'earntrack-parity-'));
  for (const name of ['materials', 'calculations', 'smartPricing']) {
    let src = fs.readFileSync(path.join(mobileUtils, `${name}.js`), 'utf8');
    src = src.replace(/from '\.\/(materials|calculations)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(tmp, `${name}.mjs`), src);
  }
  return tmp;
}

const CASES = [
  { label: 'Material mit Aufschlag', a: { umsatz: '1000', stunden: '10', stundenlohn: '35', materialien: [{ qty: 1, unitPrice: 800, costPrice: 600 }] } },
  { label: 'Material ohne Aufschlag', a: { umsatz: '1000', stunden: '10', stundenlohn: '35', materialien: [{ qty: 2, unitPrice: 100, costPrice: 100 }] } },
  { label: 'Kein Material', a: { umsatz: '1000', stunden: '10', stundenlohn: '35' } },
  { label: 'Leeres Material-Array', a: { umsatz: '500', stunden: '5', stundenlohn: '40', materialien: [] } },
  { label: 'Alt-Daten ohne costPrice', a: { umsatz: '900', stunden: '8', stundenlohn: '40', materialien: [{ qty: 3, unitPrice: 50 }] } },
  { label: 'Verlust', a: { umsatz: '300', stunden: '12', stundenlohn: '45', materialien: [{ qty: 1, unitPrice: 100, costPrice: 90 }] } },
  { label: 'Deutsches Zahlenformat', a: { umsatz: '1.250,50', stunden: '7', stundenlohn: '38', materialien: [{ qty: 1, unitPrice: 200, costPrice: 150 }] } },
  { label: 'Umsatz als number', a: { umsatz: 2000, stunden: '15', stundenlohn: '42', materialien: [{ qty: 4, unitPrice: 75, costPrice: 55 }] } },
  { label: 'Null Stunden, nur Material', a: { umsatz: '0', stunden: '0', stundenlohn: '0', materialien: [{ qty: 1, unitPrice: 500, costPrice: 350 }] } },
  { label: 'Umsatz leer', a: { umsatz: '', stunden: '4', stundenlohn: '35', materialien: [{ qty: 1, unitPrice: 120, costPrice: 100 }] } },
];

const r2 = (n) => Math.round(n * 100) / 100;

test('Mobile und Web berechnen Gewinn und Note identisch', { skip: mobileAvailable ? false : 'Mobile-Repo nicht gefunden' }, async () => {
  const tmp = loadMobile();
  const mobileSmart = await import(path.join(tmp, 'smartPricing.mjs'));
  const mobileCalc = await import(path.join(tmp, 'calculations.mjs'));
  const webSmart = await import('../src/lib/smartPricing.ts');
  const webCalc = await import('../src/lib/calculations.ts');

  for (const { label, a } of CASES) {
    const m = mobileSmart.calculateAssignmentProfitScore(a);
    const w = webSmart.calculateAssignmentProfitScore(a);
    assert.strictEqual(r2(m.revenue), r2(w.revenue), `${label}: Umsatz weicht ab`);
    assert.strictEqual(r2(m.cost), r2(w.cost), `${label}: Kosten weichen ab`);
    assert.strictEqual(r2(m.profit), r2(w.profit), `${label}: Gewinn weicht ab`);
    assert.strictEqual(m.grade, w.grade, `${label}: Note weicht ab`);

    const mf = mobileCalc.calculateAssignmentFinances(a);
    const wf = webCalc.calculateAssignmentFinances(a);
    assert.strictEqual(r2(mf.revenue), r2(wf.revenue), `${label}: Finances-Umsatz weicht ab`);
    assert.strictEqual(r2(mf.profit), r2(wf.profit), `${label}: Finances-Gewinn weicht ab`);

    // Innerhalb einer Codebasis müssen Profit Score und Finances dasselbe sagen.
    assert.strictEqual(r2(m.revenue), r2(mf.revenue), `${label}: Mobile intern inkonsistent (Score vs Finances)`);
    assert.strictEqual(r2(w.revenue), r2(wf.revenue), `${label}: Web intern inkonsistent (Score vs Finances)`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

// Nagelt die Umsatz-Definition fest: Material-VK gehört zum Umsatz, weil es dem Kunden
// berechnet wird (Rechnung: netAmount = umsatz + materialSum).
test('Umsatz enthält Material-VK, Kosten enthalten Material-EK', async () => {
  const { calculateAssignmentProfitScore } = await import('../src/lib/smartPricing.ts');
  const s = calculateAssignmentProfitScore({
    umsatz: '1000', stunden: '10', stundenlohn: '35',
    materialien: [{ qty: 1, unitPrice: 800, costPrice: 600 }],
  });
  assert.strictEqual(s.revenue, 1800, 'Umsatz muss 1000 Arbeit + 800 Material-VK sein');
  assert.strictEqual(s.cost, 950, 'Kosten muessen 350 Lohn + 600 Material-EK sein');
  assert.strictEqual(s.profit, 850);
  assert.strictEqual(s.grade, 'A');
});
