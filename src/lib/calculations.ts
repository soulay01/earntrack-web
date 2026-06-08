export function calculateCost(hours: number | string, rate: number | string): number {
  return (parseFloat(String(hours)) || 0) * (parseFloat(String(rate)) || 0);
}

export function calculateRevenue(revenue: number | string): number {
  if (typeof revenue === 'number') return revenue;
  if (typeof revenue === 'string') {
    const clean = revenue.replace(/[€\s]/g, '').trim();
    if (!clean) return 0;
    if (clean.includes(',') && clean.includes('.'))
      return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    if (clean.includes(',') && !clean.includes('.'))
      return parseFloat(clean.replace(',', '.')) || 0;
    return parseFloat(clean) || 0;
  }
  return 0;
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

export function calculateAssignmentFinances(assignment: any) {
  const hours = parseFloat(String(assignment.stunden)) || 0;
  const rate = parseFloat(String(assignment.stundenlohn)) || 0;
  const revenue = calculateRevenue(assignment.umsatz);
  const cost = calculateCost(hours, rate);
  const profit = calculateProfit(revenue, cost);
  return { hours, rate, revenue, cost, profit,
    revenueFormatted: formatCurrency(revenue),
    costFormatted: formatCurrency(cost),
    profitFormatted: formatCurrency(profit),
    isProfit: profit > 0, isLoss: profit < 0, isBreakEven: profit === 0 };
}
