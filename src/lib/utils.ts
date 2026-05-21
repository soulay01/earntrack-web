export function formatCurrency(v: number): string {
  const n = parseFloat(String(v)) || 0;
  const f = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n >= 0 ? `€${f}` : `-€${f}`;
}

export function parseDate(str: string | undefined): Date {
  if (!str || str === undefined) return new Date(0);
  const p = str.split('.');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(str);
}

export function filterByTimeRange<T extends { datum?: string }>(items: T[], range: string): T[] {
  if (range === 'alle' || !range) return items;
  const now = new Date();
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  if (range === 'heute') return items.filter(i => i.datum === today);

  const ranges: Record<string, number> = { woche: 7, monat: 30, '6monate': 180, jahr: 365 };
  const days = ranges[range];
  if (!days) return items;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return items.filter(i => {
    const d = parseDate(i.datum);
    return d && d >= start && d <= now;
  });
}
