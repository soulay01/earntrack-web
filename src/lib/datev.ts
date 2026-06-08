export interface DatevRow {
  konto: string;
  sollHaben: 'S' | 'H';
  betrag: number;
  gegenkonto: string;
  belegdatum: string;
  belegfeld: string;
  buchungstext: string;
  steuersatz: number;
}

function fmtNum(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function q(s: string): string {
  return `"${(s || '').replace(/"/g, '""')}"`;
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseRevenue(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const raw = val.replace(/[€\s]/g, '').trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
    if (raw.includes(',') && !raw.includes('.')) return parseFloat(raw.replace(',', '.')) || 0;
    return parseFloat(raw) || 0;
  }
  return 0;
}

function parseAssignmentDate(assignment: any): Date {
  if (assignment.datum) {
    const parts = assignment.datum.split('.');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

const ACCOUNTS = {
  '04': { receivables: '1200', revenue: '4400', tax: '1776' },
  '03': { receivables: '1200', revenue: '8400', tax: '3806' },
};

function customerAccount(customers: any[] | undefined, customerName: string, idx: number): string {
  if (customers) {
    const found = customers.findIndex(c => c.name === customerName);
    if (found >= 0) return String(20000 + found);
  }
  return String(20000 + idx);
}

export function assignmentsToDatevRows(
  assignments: any[],
  _companyName: string,
  taxRate: number = 19,
  skr: '03' | '04' = '04',
  customers?: any[],
): DatevRow[] {
  const rows: DatevRow[] = [];
  const accounts = ACCOUNTS[skr];
  let globalIdx = 0;

  assignments.forEach((a) => {
    const revenue = parseRevenue(a.umsatz);
    if (revenue <= 0) return;
    const netAmount = revenue;
    const taxAmount = netAmount * (taxRate / 100);
    const grossAmount = netAmount + taxAmount;
    const date = parseAssignmentDate(a);
    const dateStr = fmtDate(date);
    const customerName = a.kunde || 'Unbekannt';
    globalIdx++;
    const invoiceNum = `INV-${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.${String(globalIdx).padStart(3, '0')}`;
    const text = `${a.projekt || 'Dienstleistung'} - ${customerName}`.trim();
    const debitorKonto = customerAccount(customers, customerName, globalIdx);

    rows.push({
      konto: debitorKonto,
      sollHaben: 'S',
      betrag: grossAmount,
      gegenkonto: accounts.receivables,
      belegdatum: dateStr,
      belegfeld: invoiceNum,
      buchungstext: text,
      steuersatz: taxRate,
    });
    rows.push({
      konto: accounts.revenue,
      sollHaben: 'H',
      betrag: netAmount,
      gegenkonto: debitorKonto,
      belegdatum: dateStr,
      belegfeld: invoiceNum,
      buchungstext: text,
      steuersatz: taxRate,
    });
    rows.push({
      konto: accounts.tax,
      sollHaben: 'H',
      betrag: taxAmount,
      gegenkonto: debitorKonto,
      belegdatum: dateStr,
      belegfeld: invoiceNum,
      buchungstext: text,
      steuersatz: taxRate,
    });
  });
  return rows;
}

export function generateDatevCSV(rows: DatevRow[]): string {
  const sep = ';';
  const header =
    `${q('Umsatz (Konto)')}${sep}` +
    `${q('Soll/Haben')}${sep}` +
    `${q('WKZ Umsatz')}${sep}` +
    `${q('Kurs')}${sep}` +
    `${q('Basis-Umsatz')}${sep}` +
    `${q('Konto (Gegenkonto)')}${sep}` +
    `${q('BU-Schlüssel')}${sep}` +
    `${q('Belegdatum')}${sep}` +
    `${q('Belegfeld1')}${sep}` +
    `${q('Buchungstext')}`;

  const lines = rows.map(r =>
    `${q(r.konto)}${sep}` +
    `${q(r.sollHaben)}${sep}` +
    `${q('EUR')}${sep}` +
    `${q('1,00000')}${sep}` +
    `${fmtNum(r.betrag)}${sep}` +
    `${q(r.gegenkonto)}${sep}` +
    `${q('1')}${sep}` +
    `${q(r.belegdatum)}${sep}` +
    `${q(r.belegfeld)}${sep}` +
    `${q(r.buchungstext)}`
  );

  return '\ufeff' + [header, ...lines].join('\n');
}

export function generateDatevFilename(invoiceCount: number, skr: '03' | '04' = '04'): string {
  const d = new Date();
  return `EarnTrack_DATEV_SKR${skr}_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}_${invoiceCount}Rechnungen.csv`;
}
