import { calculateRevenue } from './calculations';

export function formatCurrency(v: number): string {
  const n = parseFloat(String(v)) || 0;
  const f = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n >= 0 ? `€${f}` : `-€${f}`;
}

export async function compressImage(file: File, maxDimension = 1920, quality = 0.8): Promise<Blob> {
  if (file.size < 500_000) return file;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve, reject) => canvas.toBlob(b => {
    if (b) resolve(b);
    else reject(new Error('canvas.toBlob returned null'));
  }, 'image/jpeg', quality));
}

export async function compressImageToDataUrl(file: File, maxDimension = 512, quality = 0.85): Promise<string> {
  const blob = await compressImage(file, maxDimension, quality);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader-Fehler'));
    reader.readAsDataURL(blob);
  });
}

export function getGermanHolidays(year: number, month: number): Map<number, string> {
  const fixed: [number, number, string][] = [
    [1, 1, 'Neujahr'],
    [6, 1, 'Heilige Drei Könige'],
    [1, 5, 'Tag der Arbeit'],
    [15, 8, 'Mariä Himmelfahrt'],
    [3, 10, 'Tag der Deutschen Einheit'],
    [1, 11, 'Allerheiligen'],
    [25, 12, '1. Weihnachtstag'],
    [26, 12, '2. Weihnachtstag'],
  ];
  const days = new Map<number, string>();
  for (const [d, m, name] of fixed) {
    if (m === month + 1) days.set(d, name);
  }
  // Easter via computus
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const easter = new Date(year, Math.floor((hh + l - 7 * m + 114) / 31) - 1, ((hh + l - 7 * m + 114) % 31) + 1);
  const movable: [number, string][] = [
    [-2, 'Karfreitag'],
    [0, 'Ostersonntag'],
    [1, 'Ostermontag'],
    [39, 'Christi Himmelfahrt'],
    [49, 'Pfingstmontag'],
    [60, 'Fronleichnam'],
  ];
  for (const [offset, name] of movable) {
    const d = new Date(easter);
    d.setDate(d.getDate() + offset);
    if (d.getMonth() === month) days.set(d.getDate(), name);
  }
  return days;
}

// Delegiert an den robusten Parser in calculations.ts (unterstützt deutsches
// UND Web-Zahlenfeld-Format). Vermeidet die frühere Fehlinterpretation von "1500.50".
export function parseGermanCurrency(v: any): number {
  return calculateRevenue(v);
}

export function parseDate(str: string | undefined): Date | null {
  if (!str) return null;
  const p = str.split('.');
  const d = p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(str);
  return isNaN(d.getTime()) ? null : d;
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
    return d != null && d >= start && d <= now;
  });
}
