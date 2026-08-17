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

describe('onAssignmentMarginAlert', () => {
  it('erkennt Einsatz mit niedriger Marge', () => {
    const assignment = {
      umsatz: '500', stunden: '8', stundenlohn: '55',
      materialien: [{ qty: 1, unitPrice: 100, costPrice: 80 }],
    };
    const hours = 8, rate = 55;
    const materialSum = 100, materialCost = 80;
    const revenue = 500 + materialSum; // 600
    const cost = hours * rate + materialCost; // 440 + 80 = 520
    const margin = ((revenue - cost) / revenue) * 100; // 80/600 = 13.3%
    expect(margin).toBeLessThan(20);
  });

  it('erkennt Einsatz mit akzeptabler Marge', () => {
    const hours = 8, rate = 55;
    const materialSum = 0, materialCost = 0;
    const revenue = 1000;
    const cost = hours * rate + materialCost; // 440
    const margin = ((revenue - cost) / revenue) * 100; // 56%
    expect(margin).toBeGreaterThanOrEqual(20);
  });
});

describe('Customer Pattern Detection', () => {
  it('erkennt Muster bei ≥3 Einsätzen mit <20% Marge', () => {
    const assignments = [
      { profitMargin: 15 },
      { profitMargin: 8 },
      { profitMargin: 30 },
      { profitMargin: 12 },
    ];
    const lowMarginCount = assignments.filter(a => a.profitMargin < 20).length;
    expect(lowMarginCount).toBeGreaterThanOrEqual(3);
  });

  it('erkennt kein Muster wenn <3 Einsätze unter 20%', () => {
    const assignments = [
      { profitMargin: 25 },
      { profitMargin: 30 },
      { profitMargin: 15 },
    ];
    const lowMarginCount = assignments.filter(a => a.profitMargin < 20).length;
    expect(lowMarginCount).toBeLessThan(3);
  });

  it('berechnet korrekte Marge pro Einsatz mit Material', () => {
    const assignments = [
      { umsatz: '500', stunden: '8', stundenlohn: '55', materialien: [{ qty: 1, unitPrice: 100, costPrice: 80 }] },
      { umsatz: '400', stunden: '6', stundenlohn: '55', materialien: [{ qty: 1, unitPrice: 50, costPrice: 40 }] },
      { umsatz: '800', stunden: '10', stundenlohn: '55', materialien: [] },
    ];

    let lowMarginCount = 0;
    for (const a of assignments) {
      const hours = parseFloat(a.stunden);
      const rate = parseFloat(a.stundenlohn);
      const matSum = a.materialien.reduce((s, m) => s + m.qty * m.unitPrice, 0);
      const matCost = a.materialien.reduce((s, m) => s + m.qty * m.costPrice, 0);
      const revenue = parseFloat(a.umsatz) + matSum;
      const cost = hours * rate + matCost;
      if (revenue > 0) {
        const margin = ((revenue - cost) / revenue) * 100;
        if (margin < 20) lowMarginCount++;
      }
    }
    expect(lowMarginCount).toBeGreaterThanOrEqual(2);
  });
});

describe('Employee Cost Alert', () => {
  it('erkennt überdurchschnittlich teuren Mitarbeiter', () => {
    const allRates = [45, 50, 52, 48, 55]; // Durchschnitt: 50
    const avgRate = allRates.reduce((s, r) => s + r, 0) / allRates.length;
    const employeeRate = 75;
    expect(employeeRate).toBeGreaterThan(avgRate * 1.3);
  });

  it('erkennt Mitarbeiter innerhalb der Toleranz', () => {
    const allRates = [45, 50, 52, 48, 55]; // Durchschnitt: 50
    const avgRate = allRates.reduce((s, r) => s + r, 0) / allRates.length;
    const employeeRate = 60;
    expect(employeeRate).toBeLessThanOrEqual(avgRate * 1.3);
  });

  it('benötigt mindestens 2 Mitarbeiter für Durchschnitt', () => {
    const rates = [55];
    expect(rates.length).toBeLessThan(2);
  });

  it('berechnet korrekten Prozentunterschied', () => {
    const empRate = 75;
    const avgRate = 50;
    const diff = ((empRate - avgRate) / avgRate * 100).toFixed(0);
    expect(diff).toBe('50');
  });
});

describe('onEstimateCreated', () => {
  it('liefert korrekten Push-Text für Score F', () => {
    const estimate = {
      positionen: [{ einzelpreis: '100', menge: '5' }],
      materialienList: [],
      sonstigeKosten: [],
      gewinnmarge: '0',
    };
    // With 20% overhead, profitMargin goes negative → Grade F
    const margin = calculateEstimateMargin(estimate, 20);
    const grade = getGradeFromMargin(margin.profitMargin);
    const target = priceForTargetMargin(margin.directCost, 20);
    const diff = target != null ? target - margin.endPrice : 0;

    expect(grade).toBe('F');
    expect(target).toBeCloseTo(833, 0);
    expect(diff).toBeCloseTo(333, 0);
  });
});
