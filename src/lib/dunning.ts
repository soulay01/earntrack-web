export type InvoiceStatus = 'offen' | 'gesendet' | 'mahnung_1' | 'mahnung_2' | 'bezahlt' | 'storniert';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  offen: 'Offen',
  gesendet: 'Gesendet',
  mahnung_1: '1. Mahnung',
  mahnung_2: '2. Mahnung',
  bezahlt: 'Bezahlt',
  storniert: 'Storniert',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, { bg: string; text: string; dot: string }> = {
  offen: { bg: '#fef3c7', text: '#d97706', dot: '#f59e0b' },
  gesendet: { bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6' },
  mahnung_1: { bg: '#ffedd5', text: '#c2410c', dot: '#f97316' },
  mahnung_2: { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  bezahlt: { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e' },
  storniert: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
};

export function getNextDunningStatus(current: InvoiceStatus): InvoiceStatus | null {
  const flow: InvoiceStatus[] = ['offen', 'gesendet', 'mahnung_1', 'mahnung_2', 'bezahlt'];
  const idx = flow.indexOf(current);
  if (idx === -1 || idx >= flow.length - 1) return null;
  return flow[idx + 1];
}

function escapeHtml(str: any): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mahngebühr für die 2. Mahnung – 5 € sind gängig und rechtlich unkritisch.
const DUNNING_FEE_LEVEL_2 = 5.0;

// Geschäftsbrief nach DIN-5008-Logik im Look der Rechnungen. Stufe 1 = freundliche
// "Zahlungserinnerung" (neutral, schwarz/weiß), Stufe 2 = förmliche "2. Mahnung"
// (dunkelrote Akzente, Mahngebühr, Verzugszinsen-Hinweis, letzte Frist).
// HINWEIS: Vorlage doppelt gepflegt – Mobile-Pendant ist utils/dunning.js in der App.
export function generateDunningLetterHTML(
  assignment: any,
  companyInfo: any,
  dunningLevel: 1 | 2,
  dueDate: string,
  taxRate?: number,
): string {
  const { kunde = '', projekt = '', datum = '', umsatz = '0' } = assignment || {};

  const revenue = typeof umsatz === 'number' ? umsatz : (parseFloat(String(umsatz).replace(/[€\s]/g, '').replace(',', '.')) || 0);
  // Verknüpftes Lager-Material gehört mit zur offenen Forderung (analog Rechnung).
  const materials: any[] = Array.isArray(assignment?.materialien) ? assignment.materialien : [];
  const materialSum = materials.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
  const effectiveTaxRate = taxRate ?? companyInfo?.taxRate ?? 19;
  const netAmount = revenue + materialSum;
  const taxAmount = netAmount * (effectiveTaxRate / 100);
  const grossAmount = netAmount + taxAmount;
  const isSecond = dunningLevel === 2;
  const fee = isSecond ? DUNNING_FEE_LEVEL_2 : 0;
  const totalDue = grossAmount + fee;
  const today = new Date();
  const dateStr = today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const {
    companyName = '', companyAddress = '',
    companyStreet = '', companyZip = '', companyCity = '',
    companyPhone = '', companyEmail = '',
    companyOwner = '', companyTaxId = '',
    companyBankName = '', companyIban = '', companyBic = '',
    name = '', street = '', zip = '', city = '',
    phone = '', email = '', owner = '',
    taxId = '', bankName = '', iban = '', bic = '',
  } = companyInfo || {};

  const cName = companyName || name || 'Mein Unternehmen';
  const cStreet = companyStreet || street;
  const cZip = companyZip || zip;
  const cCity = companyCity || city;
  const cPhone = companyPhone || phone;
  const cEmail = companyEmail || email;
  const cOwner = companyOwner || owner;
  const cTaxId = companyTaxId || taxId;
  const cBankName = companyBankName || bankName;
  const cIban = companyIban || iban;
  const cBic = companyBic || bic;
  const addressLine = cStreet ? `${cStreet}, ${cZip} ${cCity}` : companyAddress;
  const accent = isSecond ? '#991b1b' : '#333333';
  const invoiceNo = assignment?.invoiceNumber || assignment?.id || '-';
  const esc = escapeHtml;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9pt;color:#333;line-height:1.45;background:#fff;padding:14px;}
  .page{max-width:210mm;margin:0 auto;padding:14px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px;padding-bottom:12px;border-bottom:${isSecond ? '2px solid #991b1b' : '1px solid #333'};}
  .brand{font-size:15pt;font-weight:700;color:#111;letter-spacing:-0.3px;}
  .brand-sub{font-size:7pt;color:#666;margin-top:2px;}
  .company-info{text-align:right;font-size:7pt;color:#444;line-height:1.5;}
  .sender-line{font-size:6.5pt;color:#999;text-decoration:underline;margin-bottom:6px;}
  .recipient{font-size:9.5pt;color:#222;line-height:1.5;min-height:60px;}
  .recipient .name{font-weight:700;}
  .meta{display:flex;justify-content:space-between;align-items:flex-end;margin:22px 0 6px 0;}
  .meta-table{font-size:7.5pt;color:#444;text-align:right;}
  .meta-table td{padding:1px 0 1px 14px;}
  .meta-table td:first-child{color:#888;}
  .subject{font-size:12.5pt;font-weight:700;color:${accent};margin:18px 0 14px 0;}
  .subject small{display:block;font-size:8pt;font-weight:400;color:#666;margin-top:2px;}
  .text{font-size:9pt;color:#333;margin-bottom:14px;}
  .text p{margin-bottom:9px;}
  .items{width:100%;border-collapse:collapse;margin:14px 0 4px 0;font-size:8pt;}
  .items th{text-align:left;padding:6px 6px;border-top:1px solid #333;border-bottom:1px solid #333;font-weight:600;color:#111;}
  .items td{padding:7px 6px;border-bottom:1px solid #e8e8e8;}
  .items th:nth-child(n+4),.items td:nth-child(n+4){text-align:right;}
  .sum{width:250px;margin-left:auto;margin-bottom:16px;font-size:8.5pt;border-collapse:collapse;}
  .sum td{padding:4px 0;}
  .sum td:last-child{text-align:right;font-weight:600;}
  .sum tr.total td{border-top:2px solid ${accent};font-weight:700;font-size:10pt;color:${accent};padding-top:6px;}
  .deadline{margin:14px 0;padding:10px 12px;border-left:3px solid ${accent};background:#fafafa;font-size:9pt;}
  .deadline strong{color:${accent};}
  .closing{margin-top:22px;font-size:9pt;}
  .closing .sig{margin-top:26px;font-weight:600;}
  .footer{margin-top:30px;padding-top:10px;border-top:1px solid #ddd;font-size:6.8pt;color:#777;display:flex;justify-content:space-between;gap:16px;line-height:1.5;}
  .footer strong{color:#444;}
  @page{size:A4 portrait;margin:0;}
  @media print{ *{box-shadow:none!important;} table,tr,td,th{page-break-inside:avoid;} }
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand">${esc(cName)}</div>
      <div class="brand-sub">${esc(addressLine)}</div>
    </div>
    <div class="company-info">
      ${cOwner ? `<div>${esc(cOwner)}</div>` : ''}
      ${cPhone ? `<div>Tel. ${esc(cPhone)}</div>` : ''}
      ${cEmail ? `<div>${esc(cEmail)}</div>` : ''}
    </div>
  </div>

  <div class="sender-line">${esc(cName)} · ${esc(addressLine)}</div>
  <div class="recipient">
    <div class="name">${esc(kunde)}</div>
    ${projekt ? `<div style="color:#666;">${esc(projekt)}</div>` : ''}
  </div>

  <div class="meta">
    <div></div>
    <table class="meta-table">
      <tr><td>Datum:</td><td>${dateStr}</td></tr>
      <tr><td>Rechnungs-Nr.:</td><td>${esc(invoiceNo)}</td></tr>
      ${datum ? `<tr><td>Leistungsdatum:</td><td>${esc(datum)}</td></tr>` : ''}
      <tr><td>${isSecond ? 'Letzte Zahlungsfrist:' : 'Neue Zahlungsfrist:'}</td><td><strong>${esc(dueDate)}</strong></td></tr>
    </table>
  </div>

  <div class="subject">
    ${isSecond ? '2. Mahnung' : 'Zahlungserinnerung'}
    <small>${isSecond ? `zur Rechnung Nr. ${esc(invoiceNo)}${datum ? ` vom ${esc(datum)}` : ''}` : `Rechnung Nr. ${esc(invoiceNo)}${datum ? ` vom ${esc(datum)}` : ''}`}</small>
  </div>

  <div class="text">
    <p>Sehr geehrte Damen und Herren,</p>
    ${isSecond ? `
    <p>trotz unserer Zahlungserinnerung konnten wir bis heute keinen Zahlungseingang zu der oben genannten Rechnung feststellen. Sie befinden sich damit in Zahlungsverzug (§&nbsp;286 BGB).</p>
    <p>Wir fordern Sie hiermit auf, den nachstehenden Gesamtbetrag bis spätestens <strong>${esc(dueDate)}</strong> auf das unten angegebene Konto zu überweisen. Für diese Mahnung berechnen wir eine Mahngebühr; wir behalten uns zudem vor, Verzugszinsen gemäß §&nbsp;288 BGB geltend zu machen.</p>` : `
    <p>sicherlich ist es Ihrer Aufmerksamkeit entgangen, dass die unten aufgeführte Rechnung noch offen ist. Wir möchten Sie daher freundlich an den Ausgleich erinnern.</p>
    <p>Bitte überweisen Sie den offenen Betrag bis zum <strong>${esc(dueDate)}</strong> auf das unten angegebene Konto.</p>`}
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:110px;">Rechnungs-Nr.</th><th style="width:80px;">Datum</th><th>Leistung</th>
      <th style="width:80px;">Netto €</th><th style="width:70px;">USt. €</th><th style="width:85px;">Brutto €</th>
    </tr></thead>
    <tbody><tr>
      <td>${esc(invoiceNo)}</td>
      <td>${esc(datum || '-')}</td>
      <td>${esc(projekt || 'Dienstleistung')}</td>
      <td style="text-align:right;">${fmt(netAmount)}</td>
      <td style="text-align:right;">${fmt(taxAmount)}</td>
      <td style="text-align:right;font-weight:600;">${fmt(grossAmount)}</td>
    </tr></tbody>
  </table>

  <table class="sum">
    <tr><td>Offener Rechnungsbetrag</td><td>${fmt(grossAmount)} €</td></tr>
    ${isSecond ? `<tr><td>Mahngebühr</td><td>${fmt(fee)} €</td></tr>` : ''}
    <tr class="total"><td>${isSecond ? 'Gesamtforderung' : 'Zahlbetrag'}</td><td>${fmt(totalDue)} €</td></tr>
  </table>

  <div class="deadline">
    ${isSecond
      ? `<strong>Letzte Frist: ${esc(dueDate)}.</strong> Sollte der Gesamtbetrag nicht fristgerecht eingehen, werden wir ohne weitere Ankündigung das gerichtliche Mahnverfahren einleiten bzw. die Forderung zum Inkasso übergeben. Sämtliche dadurch entstehenden Kosten gehen zu Ihren Lasten.`
      : `Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.`}
  </div>

  <div class="text">
    <p><strong>Bankverbindung:</strong>
    ${cBankName ? ` ${esc(cBankName)},` : ''}
    ${cIban ? ` IBAN ${esc(cIban)}` : ''}
    ${cBic ? `, BIC ${esc(cBic)}` : ''}
    ${cOwner ? ` – Kontoinhaber: ${esc(cOwner)}` : ''}</p>
    <p>Verwendungszweck: Rechnungs-Nr. ${esc(invoiceNo)}</p>
  </div>

  <div class="closing">
    <p>Mit freundlichen Grüßen</p>
    <div class="sig">${esc(cOwner || cName)}</div>
  </div>

  <div class="footer">
    <div><strong>${esc(cName)}</strong><br>${esc(addressLine)}</div>
    <div>${cPhone ? `Tel. ${esc(cPhone)}<br>` : ''}${esc(cEmail)}</div>
    <div>${cTaxId ? `Steuernummer<br>${esc(cTaxId)}` : ''}</div>
    <div style="text-align:right;">${cIban ? `${esc(cBankName || 'Bank')}<br>IBAN ${esc(cIban)}` : ''}</div>
  </div>
</div></body></html>`;
}
