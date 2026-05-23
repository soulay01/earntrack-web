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

function parseLine(line: string): { type: string; data: string } | null {
  const trimmed = line.trim();
  if (trimmed.length < 3) return null;
  return { type: trimmed.substring(0, 3), data: trimmed.substring(3) };
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

function parseRecord200(data: string, manufacturers: Map<string, DatanormManufacturer>): DatanormArticle | null {
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

function parseRecord300(data: string): { articleNo: string; price: number; currency: string } | null {
  const articleNo = data.substring(0, 15).trim();
  if (!articleNo) return null;
  const priceStr = data.substring(17, 30).trim();
  const price = priceStr ? parseInt(priceStr, 10) / 100 : 0;
  const currency = data.substring(30, 33).trim() || 'EUR';
  return { articleNo, price, currency };
}

export function parseDatanorm(content: string): DatanormResult {
  const manufacturers = new Map<string, DatanormManufacturer>();
  const articles: DatanormArticle[] = [];
  const errors: { line: number; message: string }[] = [];
  const articleMap = new Map<string, number>();

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i]);
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
  const lines = content.split(/\r?\n/);
  let has100 = false;
  let has200 = false;
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed?.type === '100') has100 = true;
    if (parsed?.type === '200') has200 = true;
  }
  if (!has200) {
    return { valid: false, message: 'Keine Artikel-Datensätze (Typ 200) gefunden. Ungültiges Datanorm-Format.' };
  }
  return { valid: true, message: `${lines.length} Zeilen, ${has100 ? 'Hersteller gefunden, ' : ''}${has200 ? 'Artikel gefunden' : ''}` };
}
