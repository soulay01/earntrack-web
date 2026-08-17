import { calculateEstimateMargin, getGradeFromMargin, priceForTargetMargin, fmtEuro } from '../index';

describe('calculateEstimateMargin', () => {
  it('berechnet korrekte Marge mit Gewinnmarge', () => {
    const estimate = {
      positionen: [{ einzelpreis: '100', menge: '5' }],
      materialienList: [{ preis: '50', menge: '2' }],
      sonstigeKosten: [{ betrag: '25' }],
      gewinnmarge: '20',
    };
    const result = calculateEstimateMargin(estimate, 0);
    // gesamt = 500 + 100 + 25 = 625
    // endPrice = 625 * 1.2 = 750
    // profit = 750 - 625 = 125
    // margin = 125/750 = 16.67%
    expect(result.profitMargin).toBeCloseTo(16.67, 1);
    expect(result.endPrice).toBe(750);
  });

  it('liefert Grade basierend auf Marge', () => {
    expect(getGradeFromMargin(55)).toBe('A+');
    expect(getGradeFromMargin(45)).toBe('A');
    expect(getGradeFromMargin(30)).toBe('B');
    expect(getGradeFromMargin(15)).toBe('C');
    expect(getGradeFromMargin(5)).toBe('D');
    expect(getGradeFromMargin(-5)).toBe('F');
  });
});

describe('calculateEstimateMargin with overhead', () => {
  it('berücksichtigt Overhead-Kosten', () => {
    const estimate = {
      positionen: [{ einzelpreis: '100', menge: '10' }],
      materialienList: [],
      sonstigeKosten: [],
      gewinnmarge: '0',
    };
    const result = calculateEstimateMargin(estimate, 10);
    // gesamt = 1000
    // endPrice = 1000 * 1.0 = 1000
    // overheadCost = 1000 * 0.1 = 100
    // profit = 1000 - 1000 - 100 = -100
    // margin = -100/1000 = -10%
    expect(result.profitMargin).toBeCloseTo(-10, 1);
    expect(result.endPrice).toBe(1000);
  });
});

describe('priceForTargetMargin', () => {
  it('berechnet Ziel-Preis für 20% Marge', () => {
    expect(priceForTargetMargin(1000, 0)).toBeCloseTo(1250, 0);
    expect(priceForTargetMargin(1000, 10)).toBeCloseTo(1428.57, 0);
  });

  it('gibt null bei ungültigen Werten', () => {
    expect(priceForTargetMargin(0, 0)).toBeNull();
    expect(priceForTargetMargin(-100, 0)).toBeNull();
    expect(priceForTargetMargin(1000, 100)).toBeNull();
  });
});

describe('fmtEuro', () => {
  it('formatiert Euro-Beträge', () => {
    expect(fmtEuro(1234)).toBe('1.234');
    expect(fmtEuro(0)).toBe('0');
    expect(fmtEuro(1234.56)).toBe('1.235');
  });
});
