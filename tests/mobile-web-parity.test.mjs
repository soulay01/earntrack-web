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

// Auch mit gesetzter Gemeinkosten-Quote muss die Parität halten.
const OVERHEAD_VARIANTS = [0, 15, 25.5, '20', '12,5'];

test('Mobile und Web berechnen Gewinn und Note identisch', { skip: mobileAvailable ? false : 'Mobile-Repo nicht gefunden' }, async () => {
  const tmp = loadMobile();
  const mobileSmart = await import(path.join(tmp, 'smartPricing.mjs'));
  const mobileCalc = await import(path.join(tmp, 'calculations.mjs'));
  const webSmart = await import('../src/lib/smartPricing.ts');
  const webCalc = await import('../src/lib/calculations.ts');

  const employees = [{ name: 'Max', stundenlohn: 35 }];
  const withEmp = CASES.map(({ label, a }) => ({ label, a: { ...a, kunde: 'Testkunde', mitarbeiter: 'Max' } }));

  for (const overhead of OVERHEAD_VARIANTS) {
    const tag = `Gemeinkosten=${overhead}`;
    for (const { label, a } of withEmp) {
      const m = mobileSmart.calculateAssignmentProfitScore(a, overhead);
      const w = webSmart.calculateAssignmentProfitScore(a, overhead);
      assert.strictEqual(r2(m.revenue), r2(w.revenue), `${tag} / ${label}: Umsatz weicht ab`);
      assert.strictEqual(r2(m.cost), r2(w.cost), `${tag} / ${label}: Kosten weichen ab`);
      assert.strictEqual(r2(m.profit), r2(w.profit), `${tag} / ${label}: Gewinn weicht ab`);
      assert.strictEqual(m.grade, w.grade, `${tag} / ${label}: Note weicht ab`);

      const mf = mobileCalc.calculateAssignmentFinances(a, overhead);
      const wf = webCalc.calculateAssignmentFinances(a, overhead);
      assert.strictEqual(r2(mf.revenue), r2(wf.revenue), `${tag} / ${label}: Finances-Umsatz weicht ab`);
      assert.strictEqual(r2(mf.profit), r2(wf.profit), `${tag} / ${label}: Finances-Gewinn weicht ab`);

      // Innerhalb einer Codebasis müssen Profit Score und Finances dasselbe sagen.
      assert.strictEqual(r2(m.profit), r2(mf.profit), `${tag} / ${label}: Mobile intern inkonsistent (Score vs Finances)`);
      assert.strictEqual(r2(w.profit), r2(wf.profit), `${tag} / ${label}: Web intern inkonsistent (Score vs Finances)`);
    }

    // Aggregate (Mitarbeiter, Kunde, Dashboard) muessen die Quote ebenfalls gleich anwenden.
    const list = withEmp.map(c => c.a);
    const mEmp = mobileSmart.calculateEmployeeProfitScore('Max', employees[0], list, overhead);
    const wEmp = webSmart.calculateEmployeeProfitScore('Max', employees[0], list, overhead);
    assert.strictEqual(r2(mEmp.profit), r2(wEmp.profit), `${tag}: Mitarbeiter-Gewinn weicht ab`);
    assert.strictEqual(mEmp.grade, wEmp.grade, `${tag}: Mitarbeiter-Note weicht ab`);

    const mCust = mobileSmart.calculateCustomerProfitScore('Testkunde', list, overhead);
    const wCust = webSmart.calculateCustomerProfitScore('Testkunde', list, overhead);
    assert.strictEqual(r2(mCust.profit), r2(wCust.profit), `${tag}: Kunden-Gewinn weicht ab`);
    assert.strictEqual(mCust.grade, wCust.grade, `${tag}: Kunden-Note weicht ab`);

    const mSum = mobileSmart.calculateDashboardSummary(list, overhead);
    const wSum = webSmart.calculateDashboardSummary(list, overhead);
    assert.strictEqual(r2(mSum.netProfit), r2(wSum.netProfit), `${tag}: Dashboard-Nettogewinn weicht ab`);
    assert.deepStrictEqual(mSum.gradeDistribution, wSum.gradeDistribution, `${tag}: Notenverteilung weicht ab`);
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

test('Gemeinkosten-Quote senkt Gewinn und Note wie erwartet', async () => {
  const { calculateAssignmentProfitScore } = await import('../src/lib/smartPricing.ts');
  const a = { umsatz: '1000', stunden: '10', stundenlohn: '35' };

  const ohne = calculateAssignmentProfitScore(a);
  assert.strictEqual(ohne.cost, 350);
  assert.strictEqual(ohne.profit, 650);
  assert.strictEqual(ohne.overheadCost, 0, 'ohne Quote darf kein Gemeinkostenanteil anfallen');

  // 20% von 1000 Umsatz = 200 Gemeinkosten -> Kosten 550, Gewinn 450, Marge 45% = A
  const mit = calculateAssignmentProfitScore(a, 20);
  assert.strictEqual(mit.overheadCost, 200);
  assert.strictEqual(mit.cost, 550);
  assert.strictEqual(mit.profit, 450);
  assert.strictEqual(mit.grade, 'A');
  assert.strictEqual(ohne.grade, 'A+', 'ohne Quote war es noch A+');
});

// Das Dashboard (src/app/dashboard/page.tsx) rechnet Umsatz/Kosten/Gewinn aus
// Performance-Gruenden inline statt ueber calculateAssignmentProfitScore – also eine
// weitere Kopie derselben Formel. Dieser Test bildet die Inline-Formel exakt nach und
// vergleicht sie mit der zentralen Engine, damit die beiden nicht auseinanderlaufen.
test('Dashboard-Inline-Formel stimmt mit der zentralen Engine ueberein', async () => {
  const { calculateAssignmentProfitScore } = await import('../src/lib/smartPricing.ts');
  const { getMaterialSum, getMaterialCost, calculateOverheadCost } = await import('../src/lib/calculations.ts');
  const { parseGermanCurrency } = await import('../src/lib/utils.ts');

  for (const overhead of [0, 18, '22,5']) {
    for (const { label, a } of CASES) {
      // 1:1 die Formel aus dashboard/page.tsx
      const r = parseGermanCurrency(a.umsatz) + getMaterialSum(a);
      const h = parseFloat(String(a.stunden)) || 0;
      const l = parseFloat(String(a.stundenlohn)) || 0;
      const c = h * l + getMaterialCost(a) + calculateOverheadCost(r, overhead);

      const engine = calculateAssignmentProfitScore(a, overhead);
      assert.strictEqual(r2(r), r2(engine.revenue), `${label} (Gemeinkosten=${overhead}): Dashboard-Umsatz weicht ab`);
      assert.strictEqual(r2(c), r2(engine.cost), `${label} (Gemeinkosten=${overhead}): Dashboard-Kosten weichen ab`);
      assert.strictEqual(r2(r - c), r2(engine.profit), `${label} (Gemeinkosten=${overhead}): Dashboard-Gewinn weicht ab`);
    }
  }
});

test('Gemeinkosten-Quote: Grenzfaelle und Rueckwaertskompatibilitaet', async () => {
  const { calculateOverheadCost } = await import('../src/lib/calculations.ts');
  assert.strictEqual(calculateOverheadCost(1000, 0), 0, '0% = keine Gemeinkosten');
  assert.strictEqual(calculateOverheadCost(1000, undefined), 0, 'undefined = wie vorher');
  assert.strictEqual(calculateOverheadCost(1000, null), 0, 'null = wie vorher');
  assert.strictEqual(calculateOverheadCost(1000, ''), 0, 'leerer String = wie vorher');
  assert.strictEqual(calculateOverheadCost(1000, 'abc'), 0, 'Unsinn-Eingabe darf nicht NaN liefern');
  assert.strictEqual(calculateOverheadCost(1000, -5), 0, 'negative Quote wird ignoriert');
  assert.strictEqual(calculateOverheadCost(1000, '12,5'), 125, 'deutsches Dezimalkomma');
  assert.strictEqual(calculateOverheadCost(1000, '12.5'), 125, 'Punkt-Dezimaltrenner');
  assert.strictEqual(calculateOverheadCost(0, 20), 0, 'kein Umsatz = keine Gemeinkosten');
});
