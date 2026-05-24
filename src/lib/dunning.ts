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
  if (current === 'mahnung_2') return null;
  return flow[idx + 1];
}

export function generateDunningLetterHTML(
  assignment: any,
  companyInfo: any,
  dunningLevel: 1 | 2,
  dueDate: string,
): string {
  const {
    kunde = '',
    projekt = '',
    datum = '',
    umsatz = '0',
    stunden = '0',
    stundenlohn = '0',
  } = assignment;

  const revenue = typeof umsatz === 'number' ? umsatz : (parseFloat(String(umsatz).replace(/[€\s]/g, '').replace(',', '.')) || 0);
  const hours = parseFloat(stunden) || 0;
  const rate = parseFloat(stundenlohn) || 0;
  const taxRate = 19;
  const netAmount = revenue;
  const taxAmount = netAmount * (taxRate / 100);
  const grossAmount = netAmount + taxAmount;
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
  } = companyInfo;

  const cName = companyName || name || 'Mein Unternehmen';
  const cOwner = companyOwner || owner || '';
  const cAddress = companyAddress || [companyStreet || street, `${companyZip || zip} ${companyCity || city}`].filter(Boolean).join(', ');
  const cStreet = companyStreet || street || '';
  const cZip = companyZip || zip || '';
  const cCity = companyCity || city || '';
  const cPhone = companyPhone || phone || '';
  const cEmail = companyEmail || email || '';
  const cTaxId = companyTaxId || taxId || '';
  const cBankName = companyBankName || bankName || '';
  const cIban = companyIban || iban || '';
  const cBic = companyBic || bic || '';

  const addressLine = cStreet
    ? `${cStreet}, ${cZip} ${cCity}`
    : cAddress;

  const isSecond = dunningLevel === 2;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}
  body{font-family:'Inter',Arial,sans-serif;font-size:9pt;color:#333;background:#fff;padding:20px;}
  .page{max-width:210mm;margin:0 auto;}
  .header{display:flex;justify-content:space-between;margin-bottom:30px;}
  .addr{font-size:7pt;color:#666;line-height:1.3;}
  .addr-label{color:#999;font-size:6pt;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;}
  .from-line{font-size:6pt;color:#999;margin-bottom:20px;}
  .recipient{border-left:3px solid ${isSecond ? '#dc2626' : '#f97316'};padding-left:12px;margin-bottom:30px;}
  .recipient-name{font-size:11pt;font-weight:700;margin-bottom:2px;}
  .subject{font-size:13pt;font-weight:800;color:${isSecond ? '#dc2626' : '#c2410c'};margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid ${isSecond ? '#dc2626' : '#f97316'};}
  .body-text{font-size:8.5pt;line-height:1.7;color:#444;margin-bottom:20px;}
  .body-text strong{color:#222;}
  .highlight{background:${isSecond ? '#fef2f2' : '#fff7ed'};border:1px solid ${isSecond ? '#fecaca' : '#fed7aa'};border-radius:6px;padding:12px;margin:16px 0;}
  .highlight p{font-size:9pt;font-weight:700;color:${isSecond ? '#dc2626' : '#c2410c'};}
  .highlight .amount{font-size:18pt;font-weight:800;color:${isSecond ? '#dc2626' : '#c2410c'};margin-top:4px;}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:8pt;}
  th{background:#f1f5f9;padding:6px 8px;text-align:left;font-weight:600;color:#475569;}
  th:last-child{text-align:right;}
  td{padding:6px 8px;border-bottom:1px solid #f1f5f9;}
  td:last-child{text-align:right;font-weight:600;}
  .totals{width:220px;margin-left:auto;margin-top:12px;font-size:8pt;}
  .totals td{padding:4px 0;border:none;}
  .totals td:last-child{text-align:right;font-weight:600;}
  .totals tr:last-child td{border-top:2px solid #333;font-weight:800;font-size:10pt;padding-top:6px;}
  .footer{margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:7pt;color:#94a3b8;line-height:1.5;}
  .bank{background:#f8fafc;border-radius:6px;padding:10px;font-size:7.5pt;color:#475569;margin-top:16px;}
  .bank strong{color:#0f172a;}
  .warning{color:${isSecond ? '#dc2626' : '#c2410c'};font-weight:700;}
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="addr-label">Absender</div>
      <div class="addr">${cName} · ${addressLine.replace(', ', ' · ')}</div>
    </div>
    <div style="text-align:right;font-size:7pt;color:#666;">
      <div style="font-weight:700;font-size:8pt;">${cName}</div>
      <div>${addressLine}</div>
      <div>${cPhone ? `Tel: ${cPhone}` : ''}</div>
      <div>${cEmail}</div>
    </div>
  </div>

  <div class="from-line">${cName} · ${addressLine}</div>

  <div class="recipient">
    <div class="recipient-name">${kunde}</div>
    ${projekt ? `<div style="color:#666;font-size:8pt;margin-top:2px;">${projekt}</div>` : ''}
  </div>

  <div class="subject">${isSecond ? '2. MAHNUNG' : 'ZAHLUNGSERINNERUNG'}</div>

  <div class="body-text">
    <p>Sehr geehrte Damen und Herren,</p>
    <p style="margin-top:12px;">
      ${isSecond
        ? `trotz unserer ersten Zahlungserinnerung vom ${dueDate} haben wir bis heute keinen Zahlungseingang für die unten aufgeführte Rechnung verzeichnen können.`
        : `wir möchten Sie freundlich an die unten aufgeführte Rechnung erinnern, deren Zahlung bisher aussteht.`
      }
    </p>
    <p style="margin-top:12px;">
      Bitte überweisen Sie den offenen Betrag in Höhe von <strong>${grossAmount.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</strong> bis zum
      <strong>${dueDate}</strong> auf das unten angegebene Konto.
    </p>
  </div>

  <div class="highlight">
    <p>${isSecond ? 'Offener Betrag (inkl. aller Kosten)' : 'Offener Rechnungsbetrag'}</p>
    <div class="amount">${grossAmount.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</div>
  </div>

  <table>
    <thead><tr>
      <th>Rechnung</th><th>Datum</th><th>Projekt</th><th>Nettobetrag</th><th>MwSt.</th><th>Gesamt</th>
    </tr></thead>
    <tbody><tr>
      <td>${assignment.id || '-'}</td>
      <td>${datum || '-'}</td>
      <td>${projekt || '-'}</td>
      <td>${netAmount.toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
      <td>${taxAmount.toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
      <td>${grossAmount.toLocaleString('de-DE', {minimumFractionDigits: 2})}</td>
    </tr></tbody>
  </table>

  ${isSecond ? `
  <div class="body-text">
    <p class="warning">Sollte der Betrag nicht innerhalb von 10 Tagen nach Zugang dieser Mahnung eingehen, sehen wir uns gezwungen, weitere rechtliche Schritte einzuleiten und die Forderung einem Inkassobüro zu übergeben. Die dadurch entstehenden zusätzlichen Kosten gehen zu Ihren Lasten.</p>
  </div>` : `
  <div class="body-text">
    <p>Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben als gegenstandslos.</p>
  </div>`}

  <div class="bank">
    <strong>Bankverbindung:</strong><br>
    ${cBankName ? `Bank: ${cBankName}<br>` : ''}
    ${cIban ? `IBAN: ${cIban}<br>` : ''}
    ${cBic ? `BIC: ${cBic}<br>` : ''}
    ${cOwner ? `Kontoinhaber: ${cOwner}` : ''}
  </div>

  <div class="footer">
    <div>${cName} · ${addressLine}</div>
    ${cTaxId ? `<div>Steuer-Nr.: ${cTaxId}</div>` : ''}
    <div style="margin-top:8px;">Erstellt mit EarnTrack am ${dateStr}</div>
  </div>
</div></body></html>`;
}
