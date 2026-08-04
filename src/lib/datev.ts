import { calculateRevenue } from './calculations';

// ';' ist der Feldtrenner im DATEV-CSV. Ein Semikolon in einem Freitextfeld (Kunden- oder
// Projektname) fügt sonst ein zusätzliches Feld ein und verschiebt alle folgenden Werte in der
// Zeile — per Testfall verifiziert: "Müller; Schmidt GmbH" erzeugte 16 statt 14 Felder. CR/LF
// werden ebenfalls entfernt, da sie sonst eine neue (unvollständige) Zeile beginnen würden.
function sanitizeCsvField(s: string): string {
  return s.replace(/[;\r\n]/g, ',');
}

// Felder vom DATEV-FormatType "Text" müssen in doppelte Anführungszeichen gesetzt werden
// (Escaping eines literalen " durch Verdopplung, Standard-CSV-Konvention). Numerische/Datums-/
// Konto-Felder bleiben unquotiert. Ohne das lesen unabhängige, spezifikationstreue Parser (u.a.
// die pydatev-Bibliothek, die exakt DATEVs eigene Feldtyp-Metadaten abbildet) die Werte falsch:
// deren Text-Parser entfernt unbedingt das erste und letzte Zeichen in der Annahme, es seien
// Anführungszeichen — bei unquotierten Feldern reißt das echte Inhalts-Zeichen ab (empirisch
// verifiziert: "Buchungsstapel" unquotiert wurde beim Rückeinlesen zu "uchungsstape"). Beide
// unabhängig geprüften echten Referenzdateien (datev-Ruby-Gem-Beispiel, JensWalter/datev-types-rs)
// quotieren Text-Felder durchgängig, auch wenn sie leer sind.
function q(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function fmtNum(n: number): string {
  // Math.round vor toFixed: 890.5*1.19 z.B. ist intern 1059.6949999999999,
  // toFixed(2) rundet das sonst auf 1059.69 statt korrekt 1059.70 ab.
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
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

// Vollständige 125-Felder-Struktur für Formatversion 13 (Buchungssatz-Datenzeile), NICHT nur
// unsere 14 befüllten Felder. Vorherige Annahme "DATEV erlaubt, eine Zeile nach jeder beliebigen
// Spalte enden zu lassen" war falsch bzw. unbelegt (nur aus einer vagen Web-Zusammenfassung
// übernommen) — zwei unabhängige echte Referenzdateien (datev-Ruby-Gem-Beispiel: 125 Felder;
// github.com/JensWalter/datev-types-rs: 124 Felder bei Formatversion 12) haben JEDE Datenzeile
// exakt so lang wie die Spaltenüberschriften-Zeile, nie abgeschnitten. Ein unabhängiger,
// spezifikationstreuer Parser (pydatev) lehnt kürzere Zeilen sogar hart ab ("Unable to parse
// line"). Feldnamen 1-124 aus der echten JensWalter-Datei übernommen (Ground Truth, u.a. Alias
// "Konto" statt "Kontonummer"), Feld 125 sowie alle FormatTypes aus einer formalen Feldspezifikation
// (pydatev format-specifications.dat, mit DATEVs eigenen FieldId/DisplayGroupId-Metadaten).
type DatevFieldType = 'Text' | 'Betrag' | 'Zahl' | 'Datum' | 'Konto';
const V13_FIELDS: [string, DatevFieldType][] = [
  ['Umsatz (ohne Soll/Haben-Kz)', 'Betrag'],
  ['Soll/Haben-Kennzeichen', 'Text'],
  ['WKZ Umsatz', 'Text'],
  ['Kurs', 'Zahl'],
  ['Basis-Umsatz', 'Betrag'],
  ['WKZ Basis-Umsatz', 'Text'],
  ['Konto', 'Konto'],
  ['Gegenkonto (ohne BU-Schlüssel)', 'Konto'],
  ['BU-Schlüssel', 'Text'],
  ['Belegdatum', 'Datum'],
  ['Belegfeld 1', 'Text'],
  ['Belegfeld 2', 'Text'],
  ['Skonto', 'Betrag'],
  ['Buchungstext', 'Text'],
  ['Postensperre', 'Zahl'],
  ['Diverse Adressnummer', 'Text'],
  ['Geschäftspartnerbank', 'Zahl'],
  ['Sachverhalt', 'Zahl'],
  ['Zinssperre', 'Zahl'],
  ['Beleglink', 'Text'],
  ['Beleginfo - Art 1', 'Text'],
  ['Beleginfo - Inhalt 1', 'Text'],
  ['Beleginfo - Art 2', 'Text'],
  ['Beleginfo - Inhalt 2', 'Text'],
  ['Beleginfo - Art 3', 'Text'],
  ['Beleginfo - Inhalt 3', 'Text'],
  ['Beleginfo - Art 4', 'Text'],
  ['Beleginfo - Inhalt 4', 'Text'],
  ['Beleginfo - Art 5', 'Text'],
  ['Beleginfo - Inhalt 5', 'Text'],
  ['Beleginfo - Art 6', 'Text'],
  ['Beleginfo - Inhalt 6', 'Text'],
  ['Beleginfo - Art 7', 'Text'],
  ['Beleginfo - Inhalt 7', 'Text'],
  ['Beleginfo - Art 8', 'Text'],
  ['Beleginfo - Inhalt 8', 'Text'],
  ['KOST1 - Kostenstelle', 'Text'],
  ['KOST2 - Kostenstelle', 'Text'],
  ['Kost-Menge', 'Zahl'],
  ['EU-Land u. UStID (Bestimmung)', 'Text'],
  ['EU-Steuersatz (Bestimmung)', 'Zahl'],
  ['Abw. Versteuerungsart', 'Text'],
  ['Sachverhalt L+L', 'Zahl'],
  ['Funktionsergänzung L+L', 'Zahl'],
  ['BU 49 Hauptfunktionstyp', 'Zahl'],
  ['BU 49 Hauptfunktionsnummer', 'Zahl'],
  ['BU 49 Funktionsergänzung', 'Zahl'],
  ['Zusatzinformation - Art 1', 'Text'],
  ['Zusatzinformation- Inhalt 1', 'Text'],
  ['Zusatzinformation - Art 2', 'Text'],
  ['Zusatzinformation- Inhalt 2', 'Text'],
  ['Zusatzinformation - Art 3', 'Text'],
  ['Zusatzinformation- Inhalt 3', 'Text'],
  ['Zusatzinformation - Art 4', 'Text'],
  ['Zusatzinformation- Inhalt 4', 'Text'],
  ['Zusatzinformation - Art 5', 'Text'],
  ['Zusatzinformation- Inhalt 5', 'Text'],
  ['Zusatzinformation - Art 6', 'Text'],
  ['Zusatzinformation- Inhalt 6', 'Text'],
  ['Zusatzinformation - Art 7', 'Text'],
  ['Zusatzinformation- Inhalt 7', 'Text'],
  ['Zusatzinformation - Art 8', 'Text'],
  ['Zusatzinformation- Inhalt 8', 'Text'],
  ['Zusatzinformation - Art 9', 'Text'],
  ['Zusatzinformation- Inhalt 9', 'Text'],
  ['Zusatzinformation - Art 10', 'Text'],
  ['Zusatzinformation- Inhalt 10', 'Text'],
  ['Zusatzinformation - Art 11', 'Text'],
  ['Zusatzinformation- Inhalt 11', 'Text'],
  ['Zusatzinformation - Art 12', 'Text'],
  ['Zusatzinformation- Inhalt 12', 'Text'],
  ['Zusatzinformation - Art 13', 'Text'],
  ['Zusatzinformation- Inhalt 13', 'Text'],
  ['Zusatzinformation - Art 14', 'Text'],
  ['Zusatzinformation- Inhalt 14', 'Text'],
  ['Zusatzinformation - Art 15', 'Text'],
  ['Zusatzinformation- Inhalt 15', 'Text'],
  ['Zusatzinformation - Art 16', 'Text'],
  ['Zusatzinformation- Inhalt 16', 'Text'],
  ['Zusatzinformation - Art 17', 'Text'],
  ['Zusatzinformation- Inhalt 17', 'Text'],
  ['Zusatzinformation - Art 18', 'Text'],
  ['Zusatzinformation- Inhalt 18', 'Text'],
  ['Zusatzinformation - Art 19', 'Text'],
  ['Zusatzinformation- Inhalt 19', 'Text'],
  ['Zusatzinformation - Art 20', 'Text'],
  ['Zusatzinformation- Inhalt 20', 'Text'],
  ['Stück', 'Zahl'],
  ['Gewicht', 'Zahl'],
  ['Zahlweise', 'Zahl'],
  ['Forderungsart', 'Text'],
  ['Veranlagungsjahr', 'Zahl'],
  ['Zugeordnete Fälligkeit', 'Datum'],
  ['Skontotyp', 'Zahl'],
  ['Auftragsnummer', 'Text'],
  ['Buchungstyp (Anzahlungen)', 'Text'],
  ['USt-Schlüssel (Anzahlungen)', 'Zahl'],
  ['EU-Land (Anzahlungen)', 'Text'],
  ['Sachverhalt L+L (Anzahlungen)', 'Zahl'],
  ['EU-Steuersatz (Anzahlungen)', 'Zahl'],
  ['Erlöskonto (Anzahlungen)', 'Konto'],
  ['Herkunft-Kz', 'Text'],
  ['Buchungs GUID', 'Text'],
  ['KOST-Datum', 'Datum'],
  ['SEPA-Mandatsreferenz', 'Text'],
  ['Skontosperre', 'Zahl'],
  ['Gesellschaftername', 'Text'],
  ['Beteiligtennummer', 'Zahl'],
  ['Identifikationsnummer', 'Text'],
  ['Zeichnernummer', 'Text'],
  ['Postensperre bis', 'Datum'],
  ['Bezeichnung SoBil-Sachverhalt', 'Text'],
  ['Kennzeichen SoBil-Buchung', 'Zahl'],
  ['Festschreibung', 'Zahl'],
  ['Leistungsdatum', 'Datum'],
  ['Datum Zuord. Steuerperiode', 'Datum'],
  ['Fälligkeit', 'Datum'],
  ['Generalumkehr (GU)', 'Text'],
  ['Steuersatz', 'Zahl'],
  ['Land', 'Text'],
  ['Abrechnungsreferenz', 'Text'],
  ['BVV-Position', 'Zahl'],
  ['EU-Land u. UStID (Ursprung)', 'Text'],
  ['EU-Steuersatz (Ursprung)', 'Zahl'],
  ['Abw. Skontokonto', 'Konto'],
];
const COLUMN_HEADERS = V13_FIELDS.map(([label]) => label).join(';');

// Baut eine volle 125-Felder-Datenzeile: `values[i]` (0-basiert) überschreibt die von uns
// tatsächlich befüllten Felder (0-13), alles andere bleibt leer. Text-Felder werden automatisch
// quotiert (auch wenn leer — entspricht beiden echten Referenzdateien), andere Feldtypen nie.
function buildDataRow(values: Partial<Record<number, string>>): string {
  return V13_FIELDS.map(([, type], i) => {
    const raw = values[i] ?? '';
    return type === 'Text' ? q(raw) : raw;
  }).join(';');
}

export function generateDatevBuchungsstapel(
  assignments: any[],
  companyName: string,
  taxRate: number = 19,
  skr: '03' | '04' = '04',
  customers?: any[],
): string {
  const now = new Date();
  const revenueAccount = REVENUE_ACCOUNTS[skr][String(taxRate)] ?? REVENUE_ACCOUNTS[skr].default;
  const bu = buSchluessel(taxRate);

  const validAssignments = assignments.filter(a => parseRevenue(a.umsatz) > 0);
  const dates = validAssignments.map(a => parseAssignmentDate(a));

  const dateFrom = dates.length > 0 ? dates.reduce((min, d) => d < min ? d : min) : new Date(now.getFullYear(), 0, 1);
  const dateTo = dates.length > 0 ? dates.reduce((max, d) => d > max ? d : max) : now;
  // WJ-Beginn muss laut DATEV-Spec <= der frühesten Buchung (Datum von) sein — sonst lehnt
  // der Import ab. Vorher war das immer der 1.1. des aktuellen Jahres, unabhängig davon, aus
  // welchem Jahr die exportierten Einsätze stammen.
  const fiscalYearStart = new Date(dateFrom.getFullYear(), 0, 1);

  // EXTF Vorsatzzeile — official DATEV Buchungsstapel header. Quotierung pro Feld richtet sich
  // nach dem DATEV-FormatType (:string → q(), :integer/:date/:boolean → unquotiert), verifiziert
  // gegen die Header-Feldliste des datev-Ruby-Gems (lib/datev/base/header.rb).
  const vorsatz = [
    q('EXTF'),
    '700',
    '21',
    q('Buchungsstapel'),
    // Formatversion: war "7" (veraltet, nie gültig). Gegen eine formale Versions-Whitelist
    // (pydatev format-specifications.dat: gültig sind 9-13) sowie zwei unabhängige reale
    // Exportdateien (datev-Ruby-Gem-Default=13, JensWalter/datev-types-rs=12) auf 13 korrigiert.
    '13',
    fmtTimestamp(now),
    '',                              // Importiert am (Datum, unquotiert)
    q(''),                           // Herkunft
    q(''),                           // Exportiert von
    q(''),                           // Importiert von
    // Beraternummer: laut offizieller DATEV-Spec muss dieses Feld >= 1001 sein (0 wird von
    // DATEV-Importern als ungültig abgelehnt, verifiziert gegen die datev-Ruby-Gem-Validierung).
    // 1001 ist ein neutraler Platzhalter — Steuerberater überschreibt das beim manuellen Import
    // ohnehin mit der echten Berater-/Mandantennummer.
    '1001',                          // Beraternummer (Platzhalter, muss >= 1001 sein)
    '1',                             // Mandantennummer (Platzhalter)
    fmtDateYYYYMMDD(fiscalYearStart),// WJ-Beginn
    '4',                             // Sachkontenlänge
    fmtDateYYYYMMDD(dateFrom),       // Datum von
    fmtDateYYYYMMDD(dateTo),         // Datum bis
    q(sanitizeCsvField(companyName).slice(0, 30)), // Bezeichnung
    q(''),                           // Diktatkürzel
    '1',                             // Buchungstyp (1 = FiBu)
    '0',                             // Rechnungslegungszweck
    '',                              // Festschreibung (leer = nicht definiert) — fehlte, verschob WKZ um eine Position
    q('EUR'),                        // WKZ (Default laut offizieller Spec, nicht leer lassen)
    // Felder 23-31 (reserviert, Derivatskennzeichen, reserviert 2/3, SKR, Branchenlösung-Id,
    // reserviert 4/5, Anwendungsinformation): alle optional, aber in einer echten, gegen die
    // offizielle Spec verifizierten Beispieldatei (datev-Ruby-Gem, github.com/ledermann/datev)
    // als leere Felder bis Feld 31 vorhanden — nicht nach Feld 22 (WKZ) abgeschnitten.
    // Feld 27 (SKR) füllen wir tatsächlich: eine zweite, unabhängige reale Exportdatei
    // (github.com/JensWalter/datev-types-rs) zeigt "03" befüllt in genau diesem Feld — wir
    // kennen den SKR bereits als Parameter, es unbefüllt zu lassen wäre unnötig ungenau.
    q(''), q(''), q(''), q(''), q(skr), '', '', q(''), q(''),
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
    const projektText = typeof a.projekt === 'string' ? a.projekt : 'Dienstleistung';
    const buchungstext = sanitizeCsvField(`${projektText} ${customerName}`).trim().slice(0, 60);

    // One line per transaction — BU-Schlüssel triggers automatic VAT split in DATEV.
    // Volle 125-Felder-Zeile über buildDataRow(): nur Indizes 0-13 sind bei uns befüllt,
    // Rest bleibt leer (aber mit korrektem, feldtypabhängigem Quoting durch V13_FIELDS).
    rows.push(buildDataRow({
      0: fmtNum(gross),                    // Umsatz (Brutto)
      1: 'S',                              // Soll/Haben-Kennzeichen (Debitorenkonto wird belastet)
      2: 'EUR',                            // WKZ Umsatz
      6: debitorKonto,                     // Konto (Debitor)
      7: revenueAccount,                   // Gegenkonto (Erlöskonto)
      8: bu,                               // BU-Schlüssel (9=19% USt, 2=7% USt)
      9: fmtDateDDMM(date),                // Belegdatum (DDMM)
      10: invoiceNum.slice(0, 36),         // Belegfeld 1
      13: buchungstext,                    // Buchungstext
    }));
  });

  // Vorsatzzeile + Feldnamen + Datensätze (Windows line endings per DATEV spec).
  // Keine Leerzeile zwischen Vorsatzzeile und Spaltenüberschriften — die offizielle
  // Formatbeschreibung sieht Zeile 1 = Header, Zeile 2 = Spaltenüberschriften, Zeile 3+ =
  // Buchungen vor. Eine Leerzeile hier verschiebt jede folgende Zeile um eins und lässt
  // DATEV-Importer entweder ablehnen oder (schlimmer) Felder falsch zuordnen.
  // Kein BOM: DATEV verlangt Windows-1252 (ANSI), keine UTF-8-Kodierung — eine BOM ist ein
  // reines UTF-Konzept und gehört hier nicht hin. Die eigentliche Byte-Kodierung nach
  // Windows-1252 passiert beim Response-Body in route.ts via encodeWindows1252() (lib/cp1252.ts).
  return [vorsatz, COLUMN_HEADERS, ...rows].join('\r\n');
}

export function generateDatevFilename(invoiceCount: number, skr: '03' | '04' = '04'): string {
  const d = new Date();
  return `EarnTrack_DATEV_SKR${skr}_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}_${invoiceCount}Buchungen.csv`;
}
