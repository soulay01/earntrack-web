// Komma-sicheres Parsen für Zahlenfelder (deutsch "8,5" / "45,50" UND Web "8.5").
// calculateRevenue übernimmt den Spezialfall Geld mit Tausender-Trennung.
export function parseNum(value: any): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const n = parseFloat(String(value).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function calculateCost(hours: number | string, rate: number | string): number {
  return parseNum(hours) * parseNum(rate);
}

// Robuster Geld-Parser für beide Formate (deutsch "1.500,50" UND Web-Zahlenfeld "1500.50").
// Einheitliche Quelle der Wahrheit – parseGermanCurrency/parseRevenue delegieren hierhin.
export function calculateRevenue(revenue: number | string): number {
  if (typeof revenue === 'number') return revenue || 0;
  if (typeof revenue !== 'string') return 0;
  const clean = revenue.replace(/[€\s]/g, '').trim();
  if (!clean) return 0;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  // Beide Trenner vorhanden: der zuletzt stehende ist der Dezimaltrenner
  if (hasComma && hasDot) {
    return clean.lastIndexOf(',') > clean.lastIndexOf('.')
      ? parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0  // deutsch: 1.500,50
      : parseFloat(clean.replace(/,/g, '')) || 0;                    // us:      1,500.50
  }
  // Nur Komma → deutsches Dezimalkomma
  if (hasComma) return parseFloat(clean.replace(',', '.')) || 0;
  // Nur Punkt: ein Tausendertrennzeichen hat IMMER genau 3 Ziffern dahinter ("1.500").
  // Alles andere ist ein Dezimalpunkt – auch Float-Artefakte wie "385.00000000000006",
  // die sonst als 38.500.000.000.000.010 gelesen wuerden.
  if (hasDot) {
    const dotCount = (clean.match(/\./g) || []).length;
    const decimals = clean.length - clean.lastIndexOf('.') - 1;
    if (dotCount === 1 && decimals > 0 && decimals !== 3) return parseFloat(clean) || 0;
    return parseFloat(clean.replace(/\./g, '')) || 0;
  }
  return parseFloat(clean) || 0;
}

export function calculateProfit(revenue: number, cost: number): number {
  return revenue - cost;
}

// Gemeinkosten-Quote: grober Anteil des Umsatzes, der für nicht direkt zurechenbare
// Fixkosten draufgeht (Fahrzeug, Miete, Verwaltung, Versicherung). Der Betrieb liest
// den Wert aus seiner BWA ab (Gemeinkosten ÷ Umsatz) und stellt ihn einmal ein.
// Bewusst simpel gehalten: keine echte Kostenstellenrechnung, sondern eine Korrektur,
// die den Deckungsbeitrag näher an den tatsächlichen Nettogewinn bringt.
// 0 = nicht eingestellt → Verhalten wie vorher. Gespeichert in
// companies/{id}/settings/invoice.overheadPercent (identisch in der Mobile-App).
export function calculateOverheadCost(revenue: number, overheadPercent: number | string): number {
  const pct = parseFloat(String(overheadPercent ?? 0).replace(',', '.')) || 0;
  if (pct <= 0) return 0;
  return (revenue || 0) * (pct / 100);
}

export function formatCurrency(value: number): string {
  const num = parseFloat(String(value)) || 0;
  const f = Math.abs(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num >= 0 ? `€${f}` : `-€${f}`;
}

export function parseDate(str: string | undefined | null): Date | null {
  if (!str) return null;
  // Mehr-Tage-Termine ("11.08.2026, 12.08.2026") → erster Tag zählt.
  const first = String(str).split(',')[0].trim();
  const p = first.split('.');
  const d = p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(first);
  return isNaN(d.getTime()) ? null : d;
}

export function parseGermanDate(str: string): Date {
  if (!str) return new Date(0);
  const parts = str.split('.');
  if (parts.length === 3)
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return new Date(str);
}

// Verknüpftes Lager-Material am Auftrag (Array `materialien`, geschrieben von
// App-Scan/Termin-Formular und Web-Scan): VK-Summe (wird dem Kunden berechnet)
// und EK-Summe (Einkauf; costPrice-Fallback = unitPrice für Alt-Daten).
export function getMaterialSum(assignment: any): number {
  const list: any[] = Array.isArray(assignment?.materialien) ? assignment.materialien : [];
  return list.reduce((s, m) => s + parseNum(m.qty) * parseNum(m.unitPrice), 0);
}

export function getMaterialCost(assignment: any): number {
  const list: any[] = Array.isArray(assignment?.materialien) ? assignment.materialien : [];
  return list.reduce((s, m) => s + parseNum(m.qty) * parseNum(m.costPrice != null ? m.costPrice : m.unitPrice), 0);
}

// Anfahrtspauschale: reine zusätzliche Rechnungsposition ohne Kostenanteil,
// zählt daher wie Material-VK direkt zum Umsatz (siehe getMaterialSum).
export function getTravelFee(assignment: any): number {
  return parseNum(assignment?.anfahrtspauschale);
}

// VK aus Artikelpreis + prozentualem Aufschlag, kaufmännisch auf Cent gerundet
// (identisch zu utils/materials.js in der Mobile-App).
export function applyMarkup(price: number, markupPercent: number): number {
  return Math.round((Number(price) || 0) * (1 + (Number(markupPercent) || 0) / 100) * 100) / 100;
}

// Profit-Check fürs Angebot: rechnet den Aufschlag auf die Kosten in die tatsächliche
// Marge um (Gewinn ÷ Endpreis) und zieht die Gemeinkosten ab – dieselbe Kennzahl wie
// beim fertigen Auftrag, damit die Note im Angebot und im Auftrag vergleichbar ist.
//
// Wichtig: Aufschlag ≠ Marge. 50% Aufschlag auf 1000 € Kosten ergibt 1500 € Endpreis
// und 500 € Gewinn – das sind 33% Marge, nicht 50%. Die Note wurde vorher direkt aus
// dem Aufschlag gebildet und war dadurch systematisch zu optimistisch.
export function calculateEstimateProfit(
  directCost: number,
  markupPercent: number | string,
  overheadPercent: number | string = 0,
) {
  const cost = Number(directCost) || 0;
  const markup = parseFloat(String(markupPercent ?? 0).replace(',', '.')) || 0;
  // Kaufmaennisch auf Cent runden: 350 * 1.1 ergibt in JS 385.00000000000006. Wird so ein
  // Wert als String gespeichert (Angebot -> Auftrag), liest der Geld-Parser die vielen
  // Nachkommastellen als Tausendertrennung und macht daraus einen absurden Betrag.
  const endPrice = Math.round(cost * (1 + markup / 100) * 100) / 100;
  const overheadCost = calculateOverheadCost(endPrice, overheadPercent);
  const totalCost = cost + overheadCost;
  const profit = endPrice - totalCost;
  const profitMargin = endPrice > 0 ? (profit / endPrice) * 100 : 0;
  return { endPrice, directCost: cost, overheadCost, totalCost, profit, profitMargin };
}

// Score fürs Angebot: 0–100 aus drei Teilen, damit die Note nicht nur vom selbst
// gewählten Aufschlag abhängt. Gewichtung: echte Marge 50 %, Angebotsgröße 30 %,
// Vollständigkeit der Eingaben 20 %. Die Note (getGrade) selbst bleibt an der Marge
// hängen – ein Verlust ist immer F. Das Ergebnis trägt alle Einzelwerte für die
// „So setzt sich der Score zusammen"-Aufstellung im Angebotsformular.
export function calculateEstimateProfitScore(input: {
  profitMargin: number;
  endPrice: number;
  checks: {
    positions: boolean;
    materials: boolean;
    otherCosts: boolean;
    customerAndProject: boolean;
    markup: boolean;
  };
}) {
  const marginPoints = Number(input.profitMargin) || 0;
  const endPrice = Number(input.endPrice) || 0;

  // Größen-Treppe: ein kleines Angebot über 200 € ist kein Top-Geschäft – wer
  // mehr abwickelt, hat mehr Gewinnpotenzial und wird höher bewertet.
  const tiers = [
    { min: 5000, points: 100, label: '5.000 € und mehr' },
    { min: 2500, points: 75, label: '2.500 – 4.999 €' },
    { min: 1000, points: 50, label: '1.000 – 2.499 €' },
    { min: 500, points: 25, label: '500 – 999 €' },
    { min: 0, points: 0, label: 'unter 500 €' },
  ];
  const volumeTier = tiers.find(t => endPrice >= t.min) ?? tiers[tiers.length - 1];
  const volumePoints = volumeTier.points;

  // Vollständigkeit: 5 Checks, jeder bringt 20 Punkte.
  const checkList = [
    { key: 'positions', label: 'Leistungspositionen erfasst', met: !!input.checks.positions },
    { key: 'materials', label: 'Materialien erfasst', met: !!input.checks.materials },
    { key: 'otherCosts', label: 'Sonstige Kosten erfasst', met: !!input.checks.otherCosts },
    { key: 'customerAndProject', label: 'Kunde und Projekt angegeben', met: !!input.checks.customerAndProject },
    { key: 'markup', label: 'Gewinnmarge eingetragen', met: !!input.checks.markup },
  ];
  const dataQualityPoints = checkList.filter(c => c.met).length * 20;

  // Gewichtete Summe, auf 0–100 begrenzt: Verlust (negative Marge) zieht Punkte ab.
  const marginContribution = 0.5 * marginPoints;
  const volumeContribution = 0.3 * volumePoints;
  const dataQualityContribution = 0.2 * dataQualityPoints;
  const raw = marginContribution + volumeContribution + dataQualityContribution;
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  return {
    score,
    marginPoints,
    volumePoints,
    volumeTierLabel: volumeTier.label,
    dataQualityPoints,
    checks: checkList,
    marginContribution,
    volumeContribution,
    dataQualityContribution,
  };
}

export function calculateAssignmentFinances(assignment: any, overheadPercent: number | string = 0) {
  const hours = parseNum(assignment.stunden);
  const rate = parseNum(assignment.stundenlohn);
  // Material: VK zählt zum Umsatz, EK zu den Kosten – der Gewinn steigt um den
  // Aufschlag (VK−EK); Material ohne Aufschlag ist ein durchlaufender Posten.
  const revenue = calculateRevenue(assignment.umsatz) + getMaterialSum(assignment) + getTravelFee(assignment);
  const overheadCost = calculateOverheadCost(revenue, overheadPercent);
  const cost = calculateCost(hours, rate) + getMaterialCost(assignment) + overheadCost;
  const profit = calculateProfit(revenue, cost);
  return { hours, rate, revenue, cost, profit, overheadCost,
    revenueFormatted: formatCurrency(revenue),
    costFormatted: formatCurrency(cost),
    profitFormatted: formatCurrency(profit),
    isProfit: profit > 0, isLoss: profit < 0, isBreakEven: profit === 0 };
}
