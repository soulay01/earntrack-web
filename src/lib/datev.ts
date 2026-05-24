export interface DatevExportRow {
  belegdatum: string;
  rechnungsnummer: string;
  kundenname: string;
  nettobetrag: number;
  steuerbetrag: number;
  steuersatz: number;
  bruttobetrag: number;
  buchungstext: string;
}

function fmtNum(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function q(s: string): string {
  return `"${(s || '').replace(/"/g, '""')}"`;
}

export function generateDatevCSV(rows: DatevExportRow[]): string {
  const sep = ';';
  const header =
    `${q('Belegdatum')}${sep}` +
    `${q('Rechnungsnummer')}${sep}` +
    `${q('Kundenname')}${sep}` +
    `${q('Nettobetrag')}${sep}` +
    `${q('Steuerbetrag')}${sep}` +
    `${q('Steuersatz')}${sep}` +
    `${q('Bruttobetrag')}${sep}` +
    `${q('Buchungstext')}`;

  const lines = rows.map(r =>
    `${q(r.belegdatum)}${sep}` +
    `${q(r.rechnungsnummer)}${sep}` +
    `${q(r.kundenname)}${sep}` +
    `${fmtNum(r.nettobetrag)}${sep}` +
    `${fmtNum(r.steuerbetrag)}${sep}` +
    `${r.steuersatz.toFixed(2).replace('.', ',')}${sep}` +
    `${fmtNum(r.bruttobetrag)}${sep}` +
    `${q(r.buchungstext)}`
  );

  return '\ufeff' + [header, ...lines].join('\n');
}

export function generateDatevFilename(): string {
  const d = new Date();
  return `EarnTrack_DATEV_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}.csv`;
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

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function parseAssignmentDate(assignment: any): string {
  if (assignment.datum) {
    const parts = assignment.datum.split('.');
    if (parts.length === 3) {
      return assignment.datum;
    }
  }
  return formatDate(new Date());
}

export function assignmentsToDatevRows(assignments: any[], companyName: string): DatevExportRow[] {
  return assignments
    .filter(a => {
      const rev = parseRevenue(a.umsatz);
      return rev > 0;
    })
    .map((a, i) => {
      const revenue = parseRevenue(a.umsatz);
      const taxRate = 19;
      const netAmount = revenue;
      const taxAmount = netAmount * (taxRate / 100);
      const grossAmount = netAmount + taxAmount;
      const today = new Date();
      const num = `INV-${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${String(i + 1).padStart(3, '0')}`;

      return {
        belegdatum: parseAssignmentDate(a),
        rechnungsnummer: num,
        kundenname: a.kunde || 'Unbekannt',
        nettobetrag: netAmount,
        steuerbetrag: taxAmount,
        steuersatz: taxRate,
        bruttobetrag: grossAmount,
        buchungstext: `Erlöse ${a.projekt || 'Dienstleistung'} - ${a.kunde || ''}`.trim(),
      };
    });
}
