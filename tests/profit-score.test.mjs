// Pinnt die Profit-Score-Engine auf dieselben Zahlen wie die Mobile-App
// (EarnTrack-Android/utils/__tests__/smartPricing.test.js). Diese Fälle sind
// genau die, bei denen die frühere Inline-Kopie im Dashboard abgewichen ist.
// Ausführen: npm run test:profit-score

import assert from 'node:assert';
import { test } from 'node:test';
import {
  calculateAssignmentProfitScore,
  calculateAllEmployeeScores,
  analyzeRootCause,
  getGrade,
} from '../src/lib/smartPricing.ts';

const assignment = (over = {}) => ({
  id: 'a1', kunde: 'Kunde', projekt: 'Projekt', datum: '13.08.2026', status: 'Geplant',
  umsatz: '0', stunden: '8', stundenlohn: '50', materialien: [], ...over,
});

test('Verlust ohne Umsatz ist F, nicht D', () => {
  const s = calculateAssignmentProfitScore(assignment({ umsatz: '0', stunden: '8', stundenlohn: '50' }));
  assert.strictEqual(s.revenue, 0);
  assert.strictEqual(s.cost, 400);
  assert.strictEqual(s.profitMargin, -100);
  assert.strictEqual(s.grade, 'F');
});

test('leerer Einsatz bleibt bei 0 % / D', () => {
  assert.strictEqual(calculateAssignmentProfitScore(assignment({ stunden: '0', stundenlohn: '0' })).grade, 'D');
});

test('fehlende Stunden/Stundenlohn werden als unvollständig markiert', () => {
  assert.strictEqual(calculateAssignmentProfitScore(assignment({ umsatz: '1000', stundenlohn: '0' })).dataComplete, false);
  assert.strictEqual(calculateAssignmentProfitScore(assignment({ umsatz: '1000' })).dataComplete, true);
});

const twoMan = {
  id: 'E1', kunde: 'K', projekt: 'P', datum: '13.08.2026', status: 'Geplant',
  mitarbeiter: 'Anna, Bob', stunden: '10', stundenlohn: '30', umsatz: '600', materialien: [],
};
const anna = { name: 'Anna', stundenlohn: '40' };
const bob = { name: 'Bob', stundenlohn: '20' };

test('Kosten werden nach Stundenlohn verteilt, Noten unterscheiden sich', () => {
  const byName = Object.fromEntries(
    calculateAllEmployeeScores([anna, bob], [twoMan], 0).map(s => [s.name, s]));
  // Einsatzkosten 10h × 30 € = 300 €, Anteile 40:20 → 200 € / 100 €
  assert.ok(Math.abs(byName.Anna.totalCost - 200) < 1e-9);
  assert.ok(Math.abs(byName.Bob.totalCost - 100) < 1e-9);
  assert.notStrictEqual(byName.Anna.grade, byName.Bob.grade);
});

test('Summe der Mitarbeiter-Kosten bleibt die Einsatz-Kosten', () => {
  const sum = calculateAllEmployeeScores([anna, bob], [twoMan], 0)
    .reduce((s, e) => s + e.totalCost, 0);
  assert.ok(Math.abs(sum - calculateAssignmentProfitScore(twoMan, 0).cost) < 1e-9);
});

test('ohne vollständige Stundenlöhne wird gleichmäßig geteilt (kein 0-Kosten-A+)', () => {
  for (const s of calculateAllEmployeeScores([anna, { name: 'Bob' }], [twoMan], 0)) {
    assert.ok(Math.abs(s.totalCost - 150) < 1e-9);
  }
});

const loss = assignment({ umsatz: '700', stunden: '16', stundenlohn: '50' }); // 800 € Direktkosten

test('Preisempfehlung erreicht mit Gemeinkosten-Quote wirklich 20 % Marge', () => {
  const { requiredPrice } = analyzeRootCause(loss, [loss], 20);
  const realMargin = (requiredPrice - (800 + requiredPrice * 0.2)) / requiredPrice * 100;
  assert.ok(Math.abs(realMargin - 20) < 1e-9, `Marge war ${realMargin}`);
  assert.ok(Math.abs(requiredPrice - 800 / 0.6) < 1e-9);
});

test('ohne Quote bleibt es bei Kosten / 0,8', () => {
  assert.ok(Math.abs(analyzeRootCause(loss, [loss], 0).requiredPrice - 800 / 0.8) < 1e-9);
});

test('Notenschwellen', () => {
  assert.strictEqual(getGrade(51), 'A+');
  assert.strictEqual(getGrade(50), 'A');
  assert.strictEqual(getGrade(40), 'A');
  assert.strictEqual(getGrade(39.9), 'B');
  assert.strictEqual(getGrade(0), 'D');
  assert.strictEqual(getGrade(-0.1), 'F');
});
