import { calculateRevenue } from './calculations';

function fmtNum(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function fmtDateDDMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDateYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTimestamp(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
    String(d.getMilliseconds()).padStart(3, '0'),
  ].join('');
}

function parseRevenue(val: unknown): number {
  return (typeof val === 'number' || typeof val === 'string') ? calculateRevenue(val) : 0;
}

function parseAssignmentDate(a: any): Date {
  if (typeof a.datum === 'string') {
    const parts = a.datum.split('.');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

// BU-Schlüssel lets DATEV automatically split gross into net + VAT
function buSchluessel(taxRate: number): string {
  if (taxRate === 19) return '9';
  if (taxRate === 7) return '2';
  return '';
}

const REVENUE_ACCOUNTS: Record<string, Record<string, string>> = {
  '04': { '19': '4400', '7': '4300', default: '4400' },
  '03': { '19': '8400', '7': '8300', default: '8400' },
};

const COLUMN_HEADERS = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
  'Postensperre',
  'Adressnummerntyp',
  'Adressnummer',
  'Geschäftspartnerbank',
  'Mahnsperre',
  'Lastschriftsperre',
  'Zahlungssperre',
  'Festschreibung',
].join(';');

export function generateDatevBuchungsstapel(
  assignments: any[],
  companyName: string,
  taxRate: number = 19,
  skr: '03' | '04' = '04',
  customers?: any[],
): string {
  const now = new Date();
  const fiscalYearStart = new Date(now.getFullYear(), 0, 1);
  const revenueAccount = REVENUE_ACCOUNTS[skr][String(taxRate)] ?? REVENUE_ACCOUNTS[skr].default;
  const bu = buSchluessel(taxRate);

  const validAssignments = assignments.filter(a => parseRevenue(a.umsatz) > 0);
  const dates = validAssignments.map(a => parseAssignmentDate(a));

  const dateFrom = dates.length > 0 ? dates.reduce((min, d) => d < min ? d : min) : fiscalYearStart;
  const dateTo = dates.length > 0 ? dates.reduce((max, d) => d > max ? d : max) : now;

  // EXTF Vorsatzzeile — official DATEV Buchungsstapel header
  const vorsatz = [
    'EXTF',
    '700',
    '21',
    'Buchungsstapel',
    '7',
    fmtTimestamp(now),
    '',                              // Importiert am
    '',                              // Herkunft
    '',                              // Exportiert von
    '',                              // Importiert von
    '0',                             // Beraternummer (0 = unbekannt)
    '0',                             // Mandantennummer
    fmtDateYYYYMMDD(fiscalYearStart),// WJ-Beginn
    '4',                             // Sachkontenlänge
    fmtDateYYYYMMDD(dateFrom),       // Datum von
    fmtDateYYYYMMDD(dateTo),         // Datum bis
    companyName.slice(0, 30),        // Bezeichnung
    '',                              // Diktatkürzel
    '1',                             // Buchungstyp (1 = FiBu)
    '0',                             // Rechnungslegungsvorschrift
    '',                              // WKZ Umsatz (leer = EUR)
    '', '', '', '',                  // reserviert
  ].join(';');

  let globalIdx = 0;
  const rows: string[] = [];

  // Jedem eindeutigen Kundennamen genau EIN Debitorenkonto zuordnen (kollisionsfrei).
  // Vorher: bekannte Kunden = 20000+Array-Index, unbekannte = 20000+laufender Zähler –
  // diese Bereiche überschnitten sich, wodurch zwei verschiedene Kunden dasselbe Konto bekamen.
  const debitorMap = new Map<string, string>();
  const debitorFor = (name: string): string => {
    if (!customers) return '1200'; // Sammel-Debitor, wenn keine Kundenliste vorliegt
    let konto = debitorMap.get(name);
    if (!konto) {
      konto = String(20000 + debitorMap.size);
      debitorMap.set(name, konto);
    }
    return konto;
  };

  validAssignments.forEach(a => {
    const net = parseRevenue(a.umsatz);
    const gross = net * (1 + taxRate / 100);
    const date = parseAssignmentDate(a);
    const customerName = typeof a.kunde === 'string' ? a.kunde : 'Unbekannt';
    globalIdx++;

    const debitorKonto = debitorFor(customerName);

    const invoiceNum = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(globalIdx).padStart(4, '0')}`;
    const buchungstext = `${typeof a.projekt === 'string' ? a.projekt : 'Dienstleistung'} ${customerName}`.trim().slice(0, 60);

    // One line per transaction — BU-Schlüssel triggers automatic VAT split in DATEV
    rows.push([
      fmtNum(gross),           // Umsatz (Brutto)
      'S',                     // Soll (Debitorenkonto wird belastet)
      'EUR',                   // WKZ
      '',                      // Kurs
      '',                      // Basis-Umsatz
      '',                      // WKZ Basis-Umsatz
      debitorKonto,            // Konto (Debitor)
      revenueAccount,          // Gegenkonto (Erlöskonto)
      bu,                      // BU-Schlüssel (9=19% USt, 2=7% USt)
      fmtDateDDMM(date),       // Belegdatum (DDMM)
      invoiceNum.slice(0, 36), // Belegfeld 1
      '',                      // Belegfeld 2
      '',                      // Skonto
      buchungstext,            // Buchungstext
      '', '', '', '', '', '', '', '', // optionale Felder
    ].join(';'));
  });

  // BOM + Vorsatzzeile + Leerzeile + Feldnamen + Datensätze (Windows line endings per DATEV spec)
  return '﻿' + [vorsatz, '', COLUMN_HEADERS, ...rows].join('\r\n');
}

export function generateDatevFilename(invoiceCount: number, skr: '03' | '04' = '04'): string {
  const d = new Date();
  return `EarnTrack_DATEV_SKR${skr}_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}_${invoiceCount}Buchungen.csv`;
}
