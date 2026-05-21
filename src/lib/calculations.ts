export function calculateCost(hours: number, rate: number): number {
  const h = parseFloat(String(hours)) || 0;
  const r = parseFloat(String(rate)) || 0;
  return h * r;
}

export function calculateRevenue(revenue: number | string): number {
  if (typeof revenue === 'number') return revenue;
  if (typeof revenue === 'string') {
    const clean = revenue.replace(/[€\s]/g, '').trim();
    if (!clean) return 0;
    if (clean.includes(',') && clean.includes('.')) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (clean.includes(',') && !clean.includes('.')) {
      return parseFloat(clean.replace(',', '.')) || 0;
    }
    return parseFloat(clean) || 0;
  }
  return 0;
}

export function calculateProfit(revenue: number, cost: number): number {
  const r = parseFloat(String(revenue)) || 0;
  const c = parseFloat(String(cost)) || 0;
  return r - c;
}

export function formatCurrency(value: number): string {
  const num = parseFloat(String(value)) || 0;
  if (num >= 0) {
    return `€${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `-€${Math.abs(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function parseGermanDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(dateStr);
}

export function filterAssignmentsByTimeRange<T extends { datum?: string }>(assignments: T[], timeRange: string): T[] {
  if (timeRange === 'alle' || timeRange === 'seitbeginn') return assignments;

  const now = new Date();
  const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  if (timeRange === 'heute') {
    return assignments.filter(a => a.datum === todayStr);
  }

  const parseDate = (str?: string) => {
    if (!str) return null;
    const parts = str.split('.');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return new Date(str);
  };

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (timeRange === 'gestern') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${String(yesterday.getDate()).padStart(2, '0')}.${String(yesterday.getMonth() + 1).padStart(2, '0')}.${yesterday.getFullYear()}`;
    return assignments.filter(a => a.datum === yesterdayStr);
  }

  let startDate: Date;
  let endDate: Date;

  switch (timeRange) {
    case 'woche':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      endDate = now;
      break;
    case 'monat':
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 1);
      endDate = now;
      break;
    case '6monate':
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 6);
      endDate = now;
      break;
    case 'jahr':
      startDate = new Date(today);
      startDate.setFullYear(startDate.getFullYear() - 1);
      endDate = now;
      break;
    case 'dieses_jahr':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
      break;
    case 'aktueller_monat':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
      break;
    default:
      return assignments;
  }

  return assignments.filter(a => {
    const d = parseDate(a.datum);
    return d && d >= startDate && d <= endDate;
  });
}
