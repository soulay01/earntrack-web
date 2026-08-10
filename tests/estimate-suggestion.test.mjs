// Prüft die reine Vorschlagslogik: wann und welcher Umsatz-Betrag aus einem
// verknüpften Kostenvoranschlag vorgeschlagen wird.
// Ausführen: npm run test:estimate-suggestion

import assert from 'node:assert';
import { test } from 'node:test';
import { getEstimateUmsatzSuggestion } from '../src/lib/estimateSuggestion.ts';

test('kein Vorschlag ohne verknüpften KV', () => {
  const result = getEstimateUmsatzSuggestion({ estimate: null, currentUmsatz: '' });
  assert.strictEqual(result, null);
});

test('kein Vorschlag wenn KV unverbindlich ist', () => {
  const result = getEstimateUmsatzSuggestion({
    estimate: { verbindlichkeit: 'unverbindlich', totalNet: 1000, materialienList: [] },
    currentUmsatz: '',
  });
  assert.strictEqual(result, null);
});

test('kein Vorschlag wenn Umsatz bereits gesetzt ist', () => {
  const result = getEstimateUmsatzSuggestion({
    estimate: { verbindlichkeit: 'verbindlich', totalNet: 1000, materialienList: [] },
    currentUmsatz: '250',
  });
  assert.strictEqual(result, null);
});

test('Vorschlag = totalNet minus Materialsumme, bei verbindlichem KV und leerem Umsatz', () => {
  const result = getEstimateUmsatzSuggestion({
    estimate: {
      verbindlichkeit: 'verbindlich',
      totalNet: 1000,
      materialienList: [{ preis: 50, menge: 2 }, { preis: 30, menge: 1 }],
    },
    currentUmsatz: '0',
  });
  // 1000 - (50*2 + 30*1) = 1000 - 130 = 870
  assert.strictEqual(result, 870);
});

test('kein Vorschlag wenn Materialsumme die totalNet übersteigt (negatives Ergebnis)', () => {
  const result = getEstimateUmsatzSuggestion({
    estimate: { verbindlichkeit: 'verbindlich', totalNet: 100, materialienList: [{ preis: 200, menge: 1 }] },
    currentUmsatz: '',
  });
  assert.strictEqual(result, null);
});

test('materialienList fehlt (Bestandsdaten ohne das Feld) -> Vorschlag = totalNet', () => {
  const result = getEstimateUmsatzSuggestion({
    estimate: { verbindlichkeit: 'verbindlich', totalNet: 500 },
    currentUmsatz: '',
  });
  assert.strictEqual(result, 500);
});
