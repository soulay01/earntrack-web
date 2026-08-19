export type Row = Record<string, string>;

export interface MappedCustomer {
  skipped: false;
  name: string;
  kundentyp: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  adresse: string;
  kundennummer: string;
}

export interface MappedSupplier {
  skipped: false;
  name: string;
  supplierNo: string;
  contactPerson: string;
  email: string;
  telefon: string;
  street: string;
  zip: string;
  city: string;
  iban: string;
  bic: string;
  paymentTerms: string;
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
  adresse?: string;
  kundentyp?: string;
  kundennummer?: string;
  ansprechpartner?: string;
  notizen?: string;
}

export interface ExistingSupplier {
  id: string;
  name?: string;
  email?: string;
  telefon?: string;
  supplierNo?: string;
  contactPerson?: string;
  street?: string;
  zip?: string;
  city?: string;
  iban?: string;
  bic?: string;
  paymentTerms?: string;
}

// 'gesendet'/'mahnung_1'/'mahnung_2'/'storniert' kommen aus CSV-Exporten praktisch nie vor -
// nur 'offen' und 'bezahlt' lassen sich aus Zahlungsstatus-Spalten zuverlässig herleiten.
export type ImportedInvoiceStatus = 'offen' | 'bezahlt' | 'storniert';

export interface MappedInvoice {
  skipped: false;
  invoiceNumber: string;
  customerName: string;
  kundennummer: string;
  invoiceDate: string;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  status: ImportedInvoiceStatus;
}

export interface ExistingInvoice {
  id: string;
  invoiceNumber?: string;
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
  // Exporte mit mehreren Adress-/Kontaktblöcken (z.B. "Straße 1"/"Straße 2") hängen
  // "_1"/"_2" an ALLE Spalten, auch an sonst eindeutige wie "PLZ 1" - Block 1 ist die
  // Hauptadresse, daher als Fallback mit "_1"-Suffix nochmal versuchen.
  for (const k of keys) {
    const v = row[`${k}_1`];
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
    const firma = pick(row, ['firma', 'firmenname', 'unternehmen']);
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
      // Format wie im Rest der App ("Musterstr. 12, 12345 Berlin"): Komma nur nach der
      // Straße, PLZ und Ort durch Leerzeichen getrennt statt durchgehend Komma-separiert.
      adresse: [pick(row, ['strasse']), [pick(row, ['plz', 'postleitzahl']), pick(row, ['ort', 'stadt'])].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', '),
      kundennummer: pick(row, ['kundennummer', 'kundennr']),
    };
  });
}

export function mapSuppliers(rows: Row[]): (MappedSupplier | SkippedRow)[] {
  return rows.map((rawRow, rowIndex) => {
    const row = normalizeRow(rawRow);
    const name = pick(row, ['firma', 'firmenname', 'unternehmen', 'name', 'lieferant']);
    if (!name) return { skipped: true, rowIndex, reason: 'Kein Name/Firma in dieser Zeile gefunden' };
    return {
      skipped: false,
      name,
      supplierNo: pick(row, ['lieferantennummer', 'lieferantennr', 'kreditorennummer', 'kreditorennr']),
      contactPerson: pick(row, ['ansprechpartner', 'kontaktperson']),
      email: pick(row, ['e_mail', 'email']),
      telefon: pick(row, ['telefon', 'tel', 'mobil', 'handy']),
      street: pick(row, ['strasse', 'adresse']),
      zip: pick(row, ['plz', 'postleitzahl']),
      city: pick(row, ['ort', 'stadt']),
      iban: pick(row, ['iban']),
      bic: pick(row, ['bic']),
      paymentTerms: pick(row, ['zahlungsziel', 'zahlungsbedingungen', 'zahlungsbedingung']),
    };
  });
}

export function mapInvoices(rows: Row[]): (MappedInvoice | SkippedRow)[] {
  return rows.map((rawRow, rowIndex) => {
    const row = normalizeRow(rawRow);
    const invoiceNumber = pick(row, ['rechnungsnummer', 'rechnungsnr', 'invoicenumber', 'nummer']);
    const customerName = pick(row, ['firma', 'kunde', 'kundenname', 'name']);
    if (!invoiceNumber && !customerName) {
      return { skipped: true, rowIndex, reason: 'Keine Rechnungsnummer/Kunde in dieser Zeile gefunden' };
    }
    const gross = parseGermanNumber(pick(row, ['brutto', 'bruttobetrag', 'gesamtbetrag', 'betrag']));
    const net = parseGermanNumber(pick(row, ['netto', 'nettobetrag'])) || gross;
    const tax = parseGermanNumber(pick(row, ['mwst', 'steuer', 'ust'])) || Math.max(0, gross - net);
    const paidRaw = pick(row, ['bezahlt', 'zahlungsstatus', 'status']).toLowerCase();
    const paidDate = pick(row, ['zahlungsdatum', 'bezahlt_am']);
    const status: ImportedInvoiceStatus =
      paidRaw === 'storniert' || paidRaw === 'canceled' || paidRaw === 'cancelled'
        ? 'storniert'
        : paidRaw === 'bezahlt' || paidRaw === 'ja' || paidRaw === 'paid' || paidRaw === 'true' || !!paidDate
          ? 'bezahlt'
          : 'offen';
    return {
      skipped: false,
      invoiceNumber,
      customerName,
      kundennummer: pick(row, ['kundennummer', 'kundennr']),
      invoiceDate: pick(row, ['datum', 'rechnungsdatum']),
      netAmount: net,
      taxAmount: tax,
      grossAmount: gross || net + tax,
      status,
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

export function findExistingSupplier(existingSuppliers: ExistingSupplier[], item: MappedSupplier): ExistingSupplier | undefined {
  const no = (item.supplierNo || '').trim().toLowerCase();
  const email = (item.email || '').trim().toLowerCase();
  const name = (item.name || '').trim().toLowerCase();
  return existingSuppliers.find((d) => {
    const dNo = (d.supplierNo || '').trim().toLowerCase();
    if (no && dNo && dNo === no) return true;
    const dEmail = (d.email || '').trim().toLowerCase();
    if (email && dEmail && dEmail === email) return true;
    if (!no && !email) {
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
  if (!existing.adresse && item.adresse) patch.adresse = item.adresse;
  return patch;
}

export function buildSupplierPatch(existing: ExistingSupplier, item: MappedSupplier): Partial<ExistingSupplier> {
  const patch: Partial<ExistingSupplier> = {};
  if (!existing.supplierNo && item.supplierNo) patch.supplierNo = item.supplierNo;
  if (!existing.contactPerson && item.contactPerson) patch.contactPerson = item.contactPerson;
  if (!existing.email && item.email) patch.email = item.email;
  if (!existing.telefon && item.telefon) patch.telefon = item.telefon;
  if (!existing.street && item.street) patch.street = item.street;
  if (!existing.zip && item.zip) patch.zip = item.zip;
  if (!existing.city && item.city) patch.city = item.city;
  if (!existing.iban && item.iban) patch.iban = item.iban;
  if (!existing.bic && item.bic) patch.bic = item.bic;
  if (!existing.paymentTerms && item.paymentTerms) patch.paymentTerms = item.paymentTerms;
  return patch;
}
