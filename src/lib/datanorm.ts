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
}

export interface DatanormResult {
  manufacturers: Map<string, DatanormManufacturer>;
  articles: DatanormArticle[];
  errors: { line: number; message: string }[];
}

function isDatanormRecord(prefix: string): boolean {
  return prefix === '100' || prefix === '200' || prefix === '300';
}

function parseLine(line: string): { type: string; data: string } | null {
  const trimmed = line.trim();
  if (trimmed.length < 5) return null;
  const type = trimmed.substring(0, 3);
  if (!isDatanormRecord(type)) return null;
  return { type, data: trimmed.substring(3) };
}

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
  const manufacturerNo = data.substring(15, 20).trim();
  const ean = data.substring(20, 33).trim();
  const name1 = data.substring(33, 63).trim();
  const name2 = data.substring(63, 93).trim();
  const unit = data.substring(93, 98).trim();
  return {
    articleNo,
    manufacturerNo,
    ean,
    name1,
    name2,
    unit,
    price: 0,
    currency: 'EUR',
    manufacturerName: manufacturers.get(manufacturerNo)?.name || '',
  };
}

function parseRecord200_5(data: string, manufacturers: Map<string, DatanormManufacturer>): DatanormArticle | null {
  const articleNo = data.substring(0, 15).trim();
  if (!articleNo) return null;
  const manufacturerNo = data.substring(15, 20).trim();
  const ean = data.substring(20, 37).trim();
  const name1 = data.substring(37, 73).trim();
  const name2 = data.substring(73, 109).trim();
  const unit = data.substring(109, 114).trim();
  return {
    articleNo,
    manufacturerNo,
    ean,
    name1,
    name2,
    unit,
    price: 0,
    currency: 'EUR',
    manufacturerName: manufacturers.get(manufacturerNo)?.name || '',
  };
}

function parseRecord200(data: string, manufacturers: Map<string, DatanormManufacturer>): DatanormArticle | null {
  if (data.length >= 114) {
    return parseRecord200_5(data, manufacturers);
  }
  return parseRecord200_4(data, manufacturers);
}

function parseRecord300(data: string): { articleNo: string; price: number; currency: string } | null {
  const articleNo = data.substring(0, 15).trim();
  if (!articleNo) return null;
  const priceStr = data.substring(17, 30).trim();
  const price = priceStr ? parseInt(priceStr, 10) / 100 : 0;
  const currency = data.substring(30, 33).trim() || 'EUR';
  return { articleNo, price, currency };
}

export interface DatanormDiagnostics {
  totalLines: number;
  nonEmptyLines: number;
  parsedRecords: { type: string; count: number }[];
  sampleLines: string[];
  encoding: string;
  fileSize: number;
}

export function diagnoseFile(content: string, fileName: string, fileSize: number): DatanormDiagnostics {
  const cleaned = content.replace(/^\ufeff/, '');
  const lines = cleaned.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const parsedRecords = new Map<string, number>();
  const sampleLines: string[] = [];

  for (const line of nonEmpty) {
    const trimmed = line.trim();
    if (trimmed.length >= 3) {
      const type = trimmed.substring(0, 3);
      if (isDatanormRecord(type)) {
        parsedRecords.set(type, (parsedRecords.get(type) || 0) + 1);
      }
      if (sampleLines.length < 5) sampleLines.push(trimmed);
    }
    if (sampleLines.length < 5 && trimmed.length > 0) {
      if (!sampleLines.includes(trimmed)) sampleLines.push(trimmed);
    }
  }

  return {
    totalLines: lines.length,
    nonEmptyLines: nonEmpty.length,
    parsedRecords: Array.from(parsedRecords.entries()).map(([type, count]) => ({ type, count })),
    sampleLines,
    encoding: cleaned.length !== content.length ? 'UTF-8 BOM' : 'UTF-8',
    fileSize,
  };
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

export function parseDatanorm(content: string): DatanormResult {
  const manufacturers = new Map<string, DatanormManufacturer>();
  const articles: DatanormArticle[] = [];
  const errors: { line: number; message: string }[] = [];
  const articleMap = new Map<string, number>();

  const cleaned = content.replace(/^\ufeff/, '');
  const lines = cleaned.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.trim().length === 0) continue;

    const parsed = parseLine(rawLine);
    if (!parsed) continue;

    try {
      switch (parsed.type) {
        case '100': {
          const m = parseRecord100(parsed.data);
          if (m.manufacturerNo) manufacturers.set(m.manufacturerNo, m);
          break;
        }
        case '200': {
          const a = parseRecord200(parsed.data, manufacturers);
          if (a) {
            articleMap.set(a.articleNo, articles.length);
            articles.push(a);
          }
          break;
        }
        case '300': {
          const p = parseRecord300(parsed.data);
          if (p) {
            const idx = articleMap.get(p.articleNo);
            if (idx !== undefined) {
              articles[idx].price = p.price;
              articles[idx].currency = p.currency;
            }
          }
          break;
        }
      }
    } catch (e) {
      errors.push({ line: i + 1, message: `Fehler in Zeile ${i + 1}: ${e}` });
    }
  }

  return { manufacturers, articles, errors };
}

export function validateDatanorm(content: string): { valid: boolean; message: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, message: 'Datei ist leer' };
  }
  const cleaned = content.replace(/^\ufeff/, '');
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return { valid: false, message: 'Datei enthält nur leere Zeilen' };
  }
  let has100 = false;
  let has200 = false;
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      if (parsed.type === '100') has100 = true;
      if (parsed.type === '200') has200 = true;
    }
  }
  if (!has100 && !has200) {
    return { valid: false, message: 'Keine Datanorm-Datensätze (Typ 100 oder 200) gefunden.' };
  }
  return { valid: true, message: `${lines.length} Zeilen, ${has100 ? 'Hersteller gefunden, ' : 'keine Hersteller, '}${has200 ? 'Artikel gefunden' : ''}` };
}
