export interface DatanormManufacturer {
  manufacturerNo: string;
  name: string;
  address: string;
  zip: string;
  city: string;
  phone: string;
}

export interface DatanormArticle {
  articleNo: string;
  manufacturerNo: string;
  ean: string;
  name1: string;
  name2: string;
  unit: string;
  price: number;
  currency: string;
  manufacturerName?: string;
  sourceFile?: string;
}

export interface DatanormResult {
  manufacturers: Map<string, DatanormManufacturer>;
  articles: DatanormArticle[];
  errors: { line: number; message: string }[];
}

export interface DatanormDiagnostics {
  totalLines: number;
  nonEmptyLines: number;
  parsedRecords: { type: string; count: number }[];
  sampleLines: string[];
  encoding: string;
  fileSize: number;
  detectedFormat: string;
  hexDump?: string;
  encodingTests?: { encoding: string; sample: string; hasReplacement: boolean }[];
}

// ─── Format detection ────────────────────────────────────────────────────────

type DetectedFormat = 'datanorm-100' | 'datanorm-abc' | 'generic-csv' | 'unknown';

function detectFormat(lines: string[]): DetectedFormat {
  let has100 = false, hasABC = false, hasCSV = false;
  for (const line of lines.slice(0, 120)) {
    const t = line.trim();
    if (!t) continue;
    const p3 = t.substring(0, 3);
    if (p3 === '100' || p3 === '200' || p3 === '300') { has100 = true; break; }
    if (/^[ABC][;,\t ]/.test(t)) hasABC = true;
    if (t.startsWith('T;') || t.startsWith('S;')) hasCSV = true;
  }
  if (has100) return 'datanorm-100';
  if (hasABC) return 'datanorm-abc';
  if (hasCSV) return 'generic-csv';
  return 'unknown';
}

// ─── 100/200/300 parser (legacy / some suppliers) ────────────────────────────

function parseRecord100(data: string): DatanormManufacturer {
  return {
    manufacturerNo: data.substring(0, 5).trim(),
    name: data.substring(5, 35).trim(),
    address: data.substring(35, 65).trim(),
    zip: data.substring(65, 70).trim(),
    city: data.substring(70, 95).trim(),
    phone: data.substring(95, 115).trim(),
  };
}

function parseRecord200_4(data: string, manufacturers: Map<string, DatanormManufacturer>): DatanormArticle | null {
  const articleNo = data.substring(0, 15).trim();
  if (!articleNo) return null;
  return {
    articleNo,
    manufacturerNo: data.substring(15, 20).trim(),
    ean: data.substring(20, 33).trim(),
    name1: data.substring(33, 63).trim(),
    name2: data.substring(63, 93).trim(),
    unit: data.substring(93, 98).trim(),
    price: 0,
    currency: 'EUR',
    manufacturerName: manufacturers.get(data.substring(15, 20).trim())?.name || '',
  };
}

function parseRecord200_5(data: string, manufacturers: Map<string, DatanormManufacturer>): DatanormArticle | null {
  const articleNo = data.substring(0, 15).trim();
  if (!articleNo) return null;
  return {
    articleNo,
    manufacturerNo: data.substring(15, 20).trim(),
    ean: data.substring(20, 37).trim(),
    name1: data.substring(37, 73).trim(),
    name2: data.substring(73, 109).trim(),
    unit: data.substring(109, 114).trim(),
    price: 0,
    currency: 'EUR',
    manufacturerName: manufacturers.get(data.substring(15, 20).trim())?.name || '',
  };
}

function parseRecord300(data: string): { articleNo: string; price: number; currency: string } | null {
  const articleNo = data.substring(0, 15).trim();
  if (!articleNo) return null;
  const priceStr = data.substring(17, 30).trim();
  const price = priceStr ? (parseInt(priceStr, 10) || 0) / 100 : 0;
  const currency = data.substring(30, 33).trim() || 'EUR';
  return { articleNo, price, currency };
}

function parseDatanorm100(content: string): DatanormResult {
  const manufacturers = new Map<string, DatanormManufacturer>();
  const articles: DatanormArticle[] = [];
  const errors: { line: number; message: string }[] = [];
  const articleMap = new Map<string, number>();

  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw?.trim()) continue;
    const p3 = raw.trim().substring(0, 3);
    if (p3 !== '100' && p3 !== '200' && p3 !== '300') continue;
    const data = raw.trim().substring(3);
    try {
      if (p3 === '100') {
        const m = parseRecord100(data);
        if (m.manufacturerNo) manufacturers.set(m.manufacturerNo, m);
      } else if (p3 === '200') {
        const a = data.length >= 114
          ? parseRecord200_5(data, manufacturers)
          : parseRecord200_4(data, manufacturers);
        if (a) { articleMap.set(a.articleNo, articles.length); articles.push(a); }
      } else if (p3 === '300') {
        const p = parseRecord300(data);
        if (p) {
          const idx = articleMap.get(p.articleNo);
          if (idx !== undefined) { articles[idx].price = p.price; articles[idx].currency = p.currency; }
        }
      }
    } catch (e) {
      errors.push({ line: i + 1, message: `Fehler: ${e}` });
    }
  }
  return { manufacturers, articles, errors };
}

// ─── A/B/C parser (Datanorm 4 / 5 standard) ──────────────────────────────────

interface ABCArticle {
  articleNo: string;
  matchCode: string;
  name1: string;
  name2: string;
  unit: string;
  ean: string;
  price: number;
  currency: string;
  manufacturerNo: string;
}

function splitABC(line: string): string[] {
  const t = line.trim();
  // Prefer semicolon-delimited; fall back to space after first char
  if (t.includes(';')) return t.split(';');
  return [t.substring(0, 1), t.substring(2)];
}

function parseARecord(parts: string[]): ABCArticle | null {
  // Standard: A;[sortnr];artno;matchcode;name1;unit;[priceindicator];[ean]
  // Sortnr is present when field[1] is a short (≤5 char) pure digit string with leading zeros
  if (parts.length < 4) return null;
  const f1 = parts[1]?.trim() || '';
  const f2 = parts[2]?.trim() || '';
  const hasSortnr = /^\d{1,5}$/.test(f1) && f2.length >= 3;

  let articleNo: string, matchCode: string, name1: string, unit: string, ean: string;
  if (hasSortnr) {
    articleNo = f2;
    matchCode = parts[3]?.trim() || f2;
    name1 = parts[4]?.trim() || '';
    unit = parts[5]?.trim() || 'STK';
    ean = parts[7]?.trim() || '';
  } else {
    articleNo = f1;
    matchCode = f2 || f1;
    name1 = parts[3]?.trim() || '';
    unit = parts[4]?.trim() || 'STK';
    ean = parts[6]?.trim() || '';
  }
  if (!articleNo) return null;
  return { articleNo, matchCode: matchCode || articleNo, name1, name2: '', unit: unit || 'STK', ean, price: 0, currency: 'EUR', manufacturerNo: '' };
}

function parseBRecord(parts: string[]): { articleNo: string; text: string } | null {
  // B;artno;longdescription
  if (parts.length < 3) return null;
  const articleNo = parts[1]?.trim();
  if (!articleNo) return null;
  return { articleNo, text: parts[2]?.trim() || '' };
}

function parseCRecord(parts: string[]): { key: string; price: number; currency: string } | null {
  // C;matchcode_or_artno;price_in_cents;[discountgroup];[currency]
  if (parts.length < 3) return null;
  const key = parts[1]?.trim();
  if (!key) return null;
  const raw = parts[2]?.trim() || '0';
  let price: number;
  if (raw.includes('.') || raw.includes(',')) {
    price = parseFloat(raw.replace(',', '.')) || 0;
  } else {
    price = (parseInt(raw, 10) || 0) / 100;
  }
  const curr = parts[4]?.trim() || parts[3]?.trim() || '';
  return { key, price, currency: curr.length === 3 ? curr : 'EUR' };
}

function parseDatanormABC(content: string): DatanormResult {
  const articleMap = new Map<string, ABCArticle>();
  const matchToArt = new Map<string, string>(); // matchCode → articleNo
  const errors: { line: number; message: string }[] = [];

  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const parts = splitABC(line);
    const type = parts[0]?.trim().toUpperCase();
    try {
      if (type === 'A') {
        const a = parseARecord(parts);
        if (a) {
          articleMap.set(a.articleNo, a);
          matchToArt.set(a.matchCode, a.articleNo);
          matchToArt.set(a.articleNo, a.articleNo);
        }
      } else if (type === 'B') {
        const b = parseBRecord(parts);
        if (b) {
          const art = articleMap.get(b.articleNo) || articleMap.get(matchToArt.get(b.articleNo) || '');
          if (art) art.name2 = art.name2 ? `${art.name2} ${b.text}` : b.text;
        }
      } else if (type === 'C') {
        const c = parseCRecord(parts);
        if (c) {
          const artNo = matchToArt.get(c.key) || c.key;
          const art = articleMap.get(artNo);
          if (art && art.price === 0) { art.price = c.price; art.currency = c.currency; }
        }
      }
    } catch (e) {
      errors.push({ line: i + 1, message: `Fehler: ${e}` });
    }
  }

  const articles: DatanormArticle[] = Array.from(articleMap.values()).map(a => ({
    articleNo: a.articleNo,
    manufacturerNo: a.manufacturerNo,
    ean: a.ean,
    name1: a.name1,
    name2: a.name2,
    unit: a.unit,
    price: a.price,
    currency: a.currency,
  }));

  return { manufacturers: new Map(), articles, errors };
}

// ─── Generic T;/S; CSV fallback ──────────────────────────────────────────────

function tryParsePrice(fields: string[], startIdx: number): number {
  for (let i = fields.length - 1; i >= startIdx; i--) {
    let val = fields[i]?.trim();
    if (!val) continue;
    val = val.replace(/\s*€\s*$/, '');
    if (!val) continue;
    if (!val.includes(',') && !val.includes('.')) continue;
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num > 0 && num < 1_000_000) return num;
  }
  return 0;
}

function parseGenericCSV(content: string): DatanormResult {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const articleMap = new Map<string, { descs: string[]; price: number }>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('V ')) continue;
    if (!line.includes(';')) continue;
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const prefix = parts[0].trim();

    if (prefix.startsWith('S')) {
      const groupName = parts[2]?.trim() || parts[3]?.trim() || '';
      const articleNo = parts[4]?.trim() || '';
      const name = parts[5]?.trim() || '';
      if (articleNo && articleNo.length >= 3) {
        if (!articleMap.has(articleNo)) articleMap.set(articleNo, { descs: [], price: 0 });
        const e = articleMap.get(articleNo)!;
        if (name) e.descs.push(name);
        if (groupName) e.descs.push(`[${groupName}]`);
      }
    } else if (prefix.startsWith('T')) {
      if (parts.length < 7) continue;
      const articleNo = parts[2]?.trim();
      if (!articleNo || articleNo.length < 3) continue;
      const desc1 = parts[6]?.trim() || '';
      const desc2 = parts[9]?.trim() || '';
      if (!articleMap.has(articleNo)) articleMap.set(articleNo, { descs: [], price: 0 });
      const e = articleMap.get(articleNo)!;
      if (desc1) e.descs.push(desc1);
      if (desc2) e.descs.push(desc2);
      if (e.price === 0) e.price = tryParsePrice(parts, 7);
    }
  }

  const articles: DatanormArticle[] = Array.from(articleMap.entries()).map(([articleNo, e]) => ({
    articleNo, manufacturerNo: '', ean: '', name1: e.descs.join(' '), name2: '', unit: 'STK', price: e.price, currency: 'EUR',
  }));

  return { manufacturers: new Map(), articles, errors: [] };
}

// ─── Public auto-detecting parser ────────────────────────────────────────────

export function parseDatanorm(content: string): DatanormResult {
  const cleaned = content.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0);
  const format = detectFormat(lines);

  if (format === 'datanorm-100') return parseDatanorm100(content);
  if (format === 'datanorm-abc') return parseDatanormABC(content);
  if (format === 'generic-csv') return parseGenericCSV(content);

  // Unknown format: try all three
  let result = parseDatanorm100(content);
  if (result.articles.length > 0) return result;
  result = parseDatanormABC(content);
  if (result.articles.length > 0) return result;
  return parseGenericCSV(content);
}

// Keep for backward compat (page.tsx calls these explicitly)
export function parseGenericArticles(content: string): DatanormResult {
  return parseGenericCSV(content);
}

// Multi-file parser: combines all file contents before parsing so that
// A/B records from one file and C/300 price records from another file
// are correctly linked (cross-file price resolution).
export function parseDatanormFiles(fileContents: string[]): DatanormResult {
  const combined = fileContents
    .map(c => c.replace(/^﻿/, ''))
    .join('\n');
  return parseDatanorm(combined);
}

export function resolveArticleManufacturers(
  articles: DatanormArticle[],
  manufacturers: Map<string, DatanormManufacturer>
): DatanormArticle[] {
  return articles.map(a => ({
    ...a,
    manufacturerName: manufacturers.get(a.manufacturerNo)?.name || a.manufacturerName || '',
  }));
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateDatanorm(content: string): { valid: boolean; message: string } {
  if (!content?.trim()) return { valid: false, message: 'Datei ist leer' };
  const cleaned = content.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { valid: false, message: 'Datei enthält nur leere Zeilen' };

  const format = detectFormat(lines);
  if (format === 'unknown') return { valid: false, message: 'Kein bekanntes Datanorm-Format (100/200/300, A/B/C oder T;/S;) erkannt.' };

  const labels: Record<DetectedFormat, string> = {
    'datanorm-100': 'Datanorm 100/200/300',
    'datanorm-abc': 'Datanorm A/B/C (Standard 4/5)',
    'generic-csv': 'Datanorm T;/S;-CSV',
    'unknown': 'unbekannt',
  };
  return { valid: true, message: `${lines.length} Zeilen – ${labels[format]}` };
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export function diagnoseFile(content: string, _fileName: string, fileSize: number): DatanormDiagnostics {
  const cleaned = content.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const recordCounts = new Map<string, number>();
  const sampleLines: string[] = [];

  for (const line of nonEmpty) {
    const t = line.trim();
    if (!t) continue;
    const p3 = t.substring(0, 3);
    if (p3 === '100' || p3 === '200' || p3 === '300') {
      recordCounts.set(p3, (recordCounts.get(p3) || 0) + 1);
    }
    const p1 = t.substring(0, 1).toUpperCase();
    if ('ABCTSVD'.includes(p1) && (t[1] === ';' || t[1] === ' ')) {
      recordCounts.set(p1, (recordCounts.get(p1) || 0) + 1);
    }
    if (sampleLines.length < 5 && !sampleLines.includes(t)) sampleLines.push(t);
  }

  const format = detectFormat(nonEmpty);
  const formatLabels: Record<DetectedFormat, string> = {
    'datanorm-100': 'Datanorm 100/200/300',
    'datanorm-abc': 'Datanorm A/B/C (Standard 4/5)',
    'generic-csv': 'T;/S;-CSV',
    'unknown': 'unbekannt',
  };

  return {
    totalLines: lines.length,
    nonEmptyLines: nonEmpty.length,
    parsedRecords: Array.from(recordCounts.entries()).map(([type, count]) => ({ type, count })),
    sampleLines,
    encoding: cleaned.length !== content.length ? 'UTF-8 BOM' : 'UTF-8',
    fileSize,
    detectedFormat: formatLabels[format],
  };
}
