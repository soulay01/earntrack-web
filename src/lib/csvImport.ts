export type Row = Record<string, string>;

export interface MappedCustomer {
  skipped: false;
  name: string;
  kundentyp: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  standort: string;
  kundennummer: string;
}

export interface MappedEmployee {
  skipped: false;
  name: string;
  stundenlohn: number;
  email: string;
  telefon: string;
}

export interface SkippedRow {
  skipped: true;
  rowIndex: number;
  reason: string;
}

export interface ExistingCustomer {
  id: string;
  name?: string;
  email?: string;
  telefon?: string;
  standort?: string;
  kundentyp?: string;
  kundennummer?: string;
  ansprechpartner?: string;
  notizen?: string;
}

export interface ExistingEmployee {
  id: string;
  name?: string;
  email?: string;
  telefon?: string;
  stundenlohn?: number;
}

// Normalisiert einen CSV-Header auf einen stabilen Vergleichs-Key: lowercase,
// Umlaute/ß aufgelöst, alles Nicht-Alphanumerische zu "_". So matchen "Firma",
// "E-Mail", "Straße", "Kundennr." etc. unabhängig von der exakten Schreibweise
// im sevDesk-/Lexware-/Excel-Export.
export function normalizeKey(str: string): string {
  return String(str || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRow(row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    out[normalizeKey(k)] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function pick(row: Row, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// Deutsches Zahlenformat: "1.234,56" (Tausenderpunkt + Komma-Dezimal) oder
// einfach "12,5". Erkennt das Komma-Dezimal-Muster, statt parseFloat direkt
// auf den String loszulassen (der bricht bei "12,50" sonst nach "12" ab).
export function parseGermanNumber(raw: string | undefined): number {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim().replace(/[€\s]/g, '');
  if (!s) return 0;
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

export function detectSource(headers: string[]): string {
  const norm = headers.map(normalizeKey);
  if (norm.includes('kundennummer') && norm.includes('firma')) return 'sevdesk';
  if (norm.includes('kundennr') && norm.includes('betreff')) return 'lexware';
  return 'generic';
}

// Liefert pro Zeile entweder eine gemappte Zeile oder einen Skip-Grund statt
// Zeilen kommentarlos zu verwerfen.
export function mapCustomers(rows: Row[]): (MappedCustomer | SkippedRow)[] {
  return rows.map((rawRow, rowIndex) => {
    const row = normalizeRow(rawRow);
    const firma = pick(row, ['firma']);
    const person = [pick(row, ['vorname']), pick(row, ['nachname'])].filter(Boolean).join(' ');
    const name = firma || person || pick(row, ['name', 'betreff', 'kunde']);
    if (!name) return { skipped: true, rowIndex, reason: 'Kein Name/Firma in dieser Zeile gefunden' };
    const art = pick(row, ['art']).toLowerCase();
    return {
      skipped: false,
      name,
      kundentyp: firma || art === 'firma' ? 'firma' : 'privat',
      ansprechpartner: pick(row, ['ansprechpartner', 'kontaktperson']),
      email: pick(row, ['e_mail', 'email']),
      telefon: pick(row, ['telefon', 'tel', 'mobil', 'handy']),
      standort: [pick(row, ['strasse', 'adresse']), pick(row, ['plz', 'postleitzahl']), pick(row, ['ort', 'stadt'])]
        .filter(Boolean)
        .join(', '),
      kundennummer: pick(row, ['kundennummer', 'kundennr']),
    };
  });
}

export function mapEmployees(rows: Row[]): (MappedEmployee | SkippedRow)[] {
  return rows.map((rawRow, rowIndex) => {
    const row = normalizeRow(rawRow);
    const person = [pick(row, ['vorname']), pick(row, ['nachname'])].filter(Boolean).join(' ');
    const name = person || pick(row, ['name']);
    if (!name) return { skipped: true, rowIndex, reason: 'Kein Name in dieser Zeile gefunden' };
    return {
      skipped: false,
      name,
      stundenlohn: parseGermanNumber(pick(row, ['stundenlohn', 'lohn'])),
      email: pick(row, ['e_mail', 'email']),
      telefon: pick(row, ['telefon', 'tel', 'mobil', 'handy']),
    };
  });
}

// Ordnet neue/bestehende Kunden per Kundennummer > E-Mail > Name zu (in
// dieser Priorität), damit ein Re-Import keine Duplikate anlegt. Alte
// Importe (vor diesem Fix) hatten die Kundennummer nur als Freitext in
// "notizen" stehen ("Kundennr: X") — das wird als Fallback mitgelesen.
export function findExistingCustomer(existingCustomers: ExistingCustomer[], item: MappedCustomer): ExistingCustomer | undefined {
  const kn = (item.kundennummer || '').trim().toLowerCase();
  const email = (item.email || '').trim().toLowerCase();
  const name = (item.name || '').trim().toLowerCase();
  return existingCustomers.find((d) => {
    const legacyMatch = /Kundennr:\s*(\S+)/i.exec(d.notizen || '');
    const dKn = (d.kundennummer || legacyMatch?.[1] || '').trim().toLowerCase();
    if (kn && dKn && dKn === kn) return true;
    const dEmail = (d.email || '').trim().toLowerCase();
    if (email && dEmail && dEmail === email) return true;
    if (!kn && !email) {
      const dName = (d.name || '').trim().toLowerCase();
      if (name && dName === name) return true;
    }
    return false;
  });
}

export function findExistingEmployee(existingEmployees: ExistingEmployee[], item: MappedEmployee): ExistingEmployee | undefined {
  const email = (item.email || '').trim().toLowerCase();
  const name = (item.name || '').trim().toLowerCase();
  return existingEmployees.find((d) => {
    const dEmail = (d.email || '').trim().toLowerCase();
    if (email && dEmail && dEmail === email) return true;
    if (!email) {
      const dName = (d.name || '').trim().toLowerCase();
      if (name && dName === name) return true;
    }
    return false;
  });
}

// Füllt nur leere Felder des bestehenden Dokuments auf — überschreibt nie
// Werte, die der Nutzer schon manuell gepflegt hat.
export function buildCustomerPatch(existing: ExistingCustomer, item: MappedCustomer): Partial<ExistingCustomer> {
  const patch: Partial<ExistingCustomer> = {};
  if (!existing.kundennummer && item.kundennummer) patch.kundennummer = item.kundennummer;
  if (!existing.kundentyp && item.kundentyp) patch.kundentyp = item.kundentyp;
  if (!existing.ansprechpartner && item.ansprechpartner) patch.ansprechpartner = item.ansprechpartner;
  if (!existing.email && item.email) patch.email = item.email;
  if (!existing.telefon && item.telefon) patch.telefon = item.telefon;
  if (!existing.standort && item.standort) patch.standort = item.standort;
  return patch;
}

export function buildEmployeePatch(existing: ExistingEmployee, item: MappedEmployee): Partial<ExistingEmployee> {
  const patch: Partial<ExistingEmployee> = {};
  if (!existing.email && item.email) patch.email = item.email;
  if (!existing.telefon && item.telefon) patch.telefon = item.telefon;
  if ((!existing.stundenlohn || existing.stundenlohn === 0) && item.stundenlohn) patch.stundenlohn = item.stundenlohn;
  return patch;
}
