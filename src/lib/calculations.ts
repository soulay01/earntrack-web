export function calculateCost(hours: number | string, rate: number | string): number {
  return (parseFloat(String(hours)) || 0) * (parseFloat(String(rate)) || 0);
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
  // Nur Punkt: einzelner Punkt mit 1–2 Nachkommastellen = Dezimalpunkt (Web-Zahlenfeld "1500.50"),
  // 3 Nachkommastellen oder mehrere Punkte = Tausendertrennung (deutsches "1.500")
  if (hasDot) {
    const dotCount = (clean.match(/\./g) || []).length;
    const decimals = clean.length - clean.lastIndexOf('.') - 1;
    if (dotCount === 1 && decimals > 0 && decimals <= 2) return parseFloat(clean) || 0;
    return parseFloat(clean.replace(/\./g, '')) || 0;
  }
  return parseFloat(clean) || 0;
}

export function calculateProfit(revenue: number, cost: number): number {
  return revenue - cost;
}

export function formatCurrency(value: number): string {
  const num = parseFloat(String(value)) || 0;
  const f = Math.abs(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num >= 0 ? `€${f}` : `-€${f}`;
}

export function parseDate(str: string | undefined | null): Date | null {
  if (!str) return null;
  const p = str.split('.');
  const d = p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(str);
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
  return list.reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
}

export function getMaterialCost(assignment: any): number {
  const list: any[] = Array.isArray(assignment?.materialien) ? assignment.materialien : [];
  return list.reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.costPrice != null ? m.costPrice : m.unitPrice) || 0), 0);
}

// VK aus Artikelpreis + prozentualem Aufschlag, kaufmännisch auf Cent gerundet
// (identisch zu utils/materials.js in der Mobile-App).
export function applyMarkup(price: number, markupPercent: number): number {
  return Math.round((Number(price) || 0) * (1 + (Number(markupPercent) || 0) / 100) * 100) / 100;
}

export function calculateAssignmentFinances(assignment: any) {
  const hours = parseFloat(String(assignment.stunden)) || 0;
  const rate = parseFloat(String(assignment.stundenlohn)) || 0;
  const revenue = calculateRevenue(assignment.umsatz) + getMaterialSum(assignment);
  const cost = calculateCost(hours, rate) + getMaterialCost(assignment);
  const profit = calculateProfit(revenue, cost);
  return { hours, rate, revenue, cost, profit,
    revenueFormatted: formatCurrency(revenue),
    costFormatted: formatCurrency(cost),
    profitFormatted: formatCurrency(profit),
    isProfit: profit > 0, isLoss: profit < 0, isBreakEven: profit === 0 };
}
