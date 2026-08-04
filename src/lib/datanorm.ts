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

type DetectedFormat = 'datanorm-abc' | 'generic-csv' | 'unknown';

// ponytail: es gab hier vorher einen dritten Zweig für ein "100/200/300"-Satzformat mit fester
// Spaltenbreite. Dafür ließ sich trotz gründlicher Suche (Wikipedia, e-projekt.at, das offene
// halo/datanorm-Referenzprojekt, Fachforen) keine einzige echte Quelle finden — jede bestätigte
// Datanorm-Version nutzt ausschließlich buchstabenbasierte Satzarten (V/A/B/C/T/P/...). Die
// Erkennung war zudem nachweislich unsicher: eine ganz normale, semikolon-getrennte CSV-Datei,
// deren erste Datenzeile zufällig mit "100" beginnt (z.B. eine Artikelnummer "100234;..."),
// wurde fälschlich als "Datanorm 100/200/300" erkannt — validateDatanorm() meldete Erfolg,
// der Import lieferte aber still 0 Artikel. Eine falsche Erfolgsmeldung ist schlimmer als ein
// ehrliches "Format nicht erkannt". Entfernt statt geraten repariert — falls doch ein echter
// Lieferant dieses Format nutzt, bitte eine echte Beispieldatei besorgen und neu implementieren.
function detectFormat(lines: string[]): DetectedFormat {
  // Ganze Datei scannen, nicht nur ein Zeilenfenster: reale Datanorm-Dateien haben oft
  // zehntausende Langtext-Zeilen (T-Sätze) VOR dem ersten Artikel-Satz (in Beispieldateien
  // gemessen: erster A-Satz bei Zeile 26098 von 26106). Das vorherige Zeilenlimit von 120
  // ließ solche Dateien fälschlich als generic-csv statt als Datanorm A/B/C erkennen — der
  // falsche Parser griff dann die Text-Satz-ID als Artikelnummer ab, Name/Preis blieben leer.
  // Sobald ein eindeutiges Signal gefunden ist, wird sofort abgebrochen (kein voller Scan nötig).
  let hasCSV = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^[ABC][;,\t ]/.test(t) || t.startsWith('P;A;')) return 'datanorm-abc';
    if (t.startsWith('T;') || t.startsWith('S;')) hasCSV = true;
  }
  if (hasCSV) return 'generic-csv';
  return 'unknown';
}

// ─── A/B/C/P parser (Datanorm 4 / 5 standard) ────────────────────────────────
//
// Feldlayout gegen 13 echte Datanorm-Beispieldateien verifiziert (github.com/halo/datanorm,
// MIT-lizenziert, u.a. Dateien mit 771 und 1542 echten Artikeln). Vorher nahm parseARecord an,
// Feld[1] sei ein optionales "Sortnr"-Feld — tatsächlich ist es IMMER der DATANORM-Aktionscode
// (N=Neuanlage, A=Änderung), nie eine Sortnr. Dadurch kollidierte jeder Artikel auf denselben
// falschen Schlüssel "N", und der Preis blieb immer 0 (er steht direkt im A-Satz, nicht — wie
// vorher angenommen — in einem separaten C-Satz). Der C-Satz existiert zwar (nur V5), enthält
// laut Format-Doku aber Arbeitszeit-/Ausschreibungstexte, keine Preise — die alte Logik konnte
// dort sogar einen falschen Preis aus unzusammenhängenden Zahlenfeldern herauslesen.

type DatanormVersion = 'v4' | 'v5';

function detectVersion(lines: string[]): DatanormVersion {
  for (const line of lines.slice(0, 5)) {
    const t = line.trim();
    if (t.startsWith('V;')) return 'v5';
    if (t.startsWith('V ')) return 'v4';
  }
  return 'v5';
}

interface ABCArticle {
  articleNo: string;
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

// V4: A;<Aktion>;<ArtikelNr>;<Warengruppe>;<Name1>;<Name2>;...;<Einheit>;<Preis in Cent>;...
// V5: A;<Aktion>;<ArtikelNr>;<Name1>;<Name2>;<Einheit>;...;<Preis in Cent>;...
function parseARecord(parts: string[], version: DatanormVersion): ABCArticle | null {
  const articleNo = parts[2]?.trim();
  if (!articleNo) return null;
  const name1Idx = version === 'v4' ? 4 : 3;
  const name2Idx = version === 'v4' ? 5 : 4;
  const unitIdx = version === 'v4' ? 8 : 5;
  const priceIdx = version === 'v4' ? 9 : 8;
  const priceCents = parseInt((parts[priceIdx] || '').trim(), 10);
  return {
    articleNo,
    name1: parts[name1Idx]?.trim() || '',
    name2: parts[name2Idx]?.trim() || '',
    unit: parts[unitIdx]?.trim() || 'STK',
    ean: '',
    price: Number.isFinite(priceCents) ? priceCents / 100 : 0,
    currency: 'EUR',
    manufacturerNo: '',
  };
}

// P-Satz (Preisdatei, oft als separate DATPREIS.001 geliefert): P;A;<ArtNr>;<Menge>;<Preis Cent>;
// <Menge2>;<Preis2 Cent>;;;;;<nächster ArtNr>;... — Blockbreite 9 Felder je Artikel, gegen reale
// Beispieldateien verifiziert. Ein Block kann laut Format-Dokumentation mehrere Preise (z.B.
// Liste/Rabatt) für denselben Artikel enthalten — welcher davon "der" Verkaufspreis ist, ist im
// Format nicht eindeutig spezifiziert. Bewusste Vereinfachung: erster Preis im Block gewinnt.
function parsePRecord(parts: string[]): { articleNo: string; price: number }[] {
  const results: { articleNo: string; price: number }[] = [];
  const blockWidth = 9;
  for (let i = 2; i + 1 < parts.length; i += blockWidth) {
    const articleNo = parts[i]?.trim();
    if (!articleNo) continue;
    const priceCents = parseInt((parts[i + 2] || '').trim(), 10);
    if (!Number.isFinite(priceCents)) continue;
    results.push({ articleNo, price: priceCents / 100 });
  }
  return results;
}

// Feldposition 9 = EAN im V4-B-Satz, an einer echten, aktuell produktiven Lieferantendatei
// verifiziert (ARI Armaturen, ari-armaturen.com/de/downloads/datanorm): 1827 von 1827 Sätzen
// hatten dort ein gültiges 13-stelliges EAN. Nur numerische Werte plausibler EAN/GTIN-Länge
// werden übernommen — andere Lieferanten könnten das Feld anders belegen.
const EAN_LENGTHS = [8, 12, 13, 14];

function parseBRecord(parts: string[]): { articleNo: string; text: string; ean: string } | null {
  // B;Aktion;ArtNr;... — zusätzliche Artikeldaten (z.B. EAN in V4), Langtext nur bei manchen Lieferanten.
  if (parts.length < 3) return null;
  const articleNo = parts[2]?.trim();
  if (!articleNo) return null;
  const text = parts[3]?.trim() || '';
  const eanCandidate = parts[9]?.trim() || '';
  const ean = /^\d+$/.test(eanCandidate) && EAN_LENGTHS.includes(eanCandidate.length) ? eanCandidate : '';
  return { articleNo, text, ean };
}

function parseDatanormABC(content: string): DatanormResult {
  const articleMap = new Map<string, ABCArticle>();
  const errors: { line: number; message: string }[] = [];

  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const version = detectVersion(lines);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const parts = splitABC(line);
    const type = parts[0]?.trim().toUpperCase();
    try {
      if (type === 'A') {
        const a = parseARecord(parts, version);
        if (a) articleMap.set(a.articleNo, a);
      } else if (type === 'B') {
        const b = parseBRecord(parts);
        const art = b && articleMap.get(b.articleNo);
        if (art && b.text) art.name2 = art.name2 ? `${art.name2} ${b.text}` : b.text;
        if (art && b.ean && !art.ean) art.ean = b.ean;
      } else if (type === 'P') {
        for (const { articleNo, price } of parsePRecord(parts)) {
          const existing = articleMap.get(articleNo);
          if (existing) {
            if (existing.price === 0) existing.price = price;
          } else {
            articleMap.set(articleNo, { articleNo, name1: '', name2: '', unit: 'STK', ean: '', price, currency: 'EUR', manufacturerNo: '' });
          }
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

  if (format === 'datanorm-abc') return parseDatanormABC(content);
  if (format === 'generic-csv') return parseGenericCSV(content);

  // Unknown format: try both remaining parsers
  const result = parseDatanormABC(content);
  if (result.articles.length > 0) return result;
  return parseGenericCSV(content);
}

// Keep for backward compat (page.tsx calls these explicitly)
export function parseGenericArticles(content: string): DatanormResult {
  return parseGenericCSV(content);
}

// Multi-file parser: combines all file contents before parsing so that
// A/B records from one file and P-Satz price records from another file (z.B. DATPREIS.001)
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
  if (format === 'unknown') return { valid: false, message: 'Kein bekanntes Datanorm-Format (A/B/C oder T;/S;) erkannt.' };

  const labels: Record<DetectedFormat, string> = {
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
