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

function escapeHtml(str: any): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

  const dunningColor = isSecond ? '#991b1b' : '#92400e';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:9pt;color:#1e293b;background:#ffffff;padding:0;}
  .page{max-width:210mm;margin:0 auto;padding:0;}

  /* ── Header / Brand ── */
  .brand-bar{background:#0f172a;padding:18px 40px;display:flex;justify-content:space-between;align-items:center;}
  .brand-name{color:#ffffff;font-size:13pt;font-weight:700;letter-spacing:-0.3px;}
  .brand-tagline{color:#94a3b8;font-size:6.5pt;font-weight:400;letter-spacing:0.5px;text-transform:uppercase;margin-top:1px;}
  .brand-badge{background:${dunningColor};color:#fff;font-size:7pt;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:0.5px;}

  /* ── Sender line ── */
  .sender-line{background:#f8fafc;padding:6px 40px;font-size:6.5pt;color:#64748b;border-bottom:1px solid #e2e8f0;}

  /* ── Content ── */
  .content{padding:30px 40px 20px;}

  /* ── Address block ── */
  .address-block{display:flex;justify-content:space-between;margin-bottom:30px;gap:40px;}
  .address-col{flex:1;}
  .address-label{font-size:6pt;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:4px;}
  .address-text{font-size:8pt;color:#475569;line-height:1.5;}
  .address-text strong{color:#0f172a;font-weight:600;}

  /* ── Recipient box ── */
  .recipient-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:28px;}
  .recipient-title{font-size:10pt;font-weight:700;color:#0f172a;margin-bottom:2px;}
  .recipient-detail{font-size:8pt;color:#475569;}

  /* ── Subject ── */
  .subject-block{margin-bottom:24px;}
  .subject-ref{font-size:7pt;color:#94a3b8;margin-bottom:2px;}
  .subject-line{font-size:14pt;font-weight:800;color:${dunningColor};letter-spacing:-0.5px;}
  .subject-underline{width:50px;height:3px;background:${dunningColor};margin-top:8px;border-radius:2px;}

  /* ── Body ── */
  .body-text{font-size:8.5pt;line-height:1.8;color:#334155;margin-bottom:24px;}
  .body-text p{margin-bottom:10px;}
  .body-text strong{color:#0f172a;font-weight:600;}

  /* ── Amount highlight ── */
  .amount-card{background:#ffffff;border:1.5px solid ${dunningColor};border-radius:10px;padding:16px 24px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;}
  .amount-label{font-size:8pt;color:#64748b;font-weight:500;}
  .amount-label span{display:block;font-size:6.5pt;color:#94a3b8;margin-top:2px;}
  .amount-value{font-size:20pt;font-weight:800;color:${dunningColor};letter-spacing:-1px;}

  /* ── Table ── */
  .invoice-table{width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:8pt;}
  .invoice-table thead{background:#f1f5f9;}
  .invoice-table th{padding:10px 12px;text-align:left;font-weight:600;color:#475569;font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;}
  .invoice-table th:last-child,.invoice-table td:last-child{text-align:right;}
  .invoice-table td{padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#334155;}
  .invoice-table td:last-child{font-weight:600;color:#0f172a;}
  .invoice-table tbody tr:last-child td{border-bottom:none;}

  /* ── Warning ── */
  .warning-box{background:${isSecond ? '#fef2f2' : '#fffbeb'};border:1px solid ${isSecond ? '#fecaca' : '#fde68a'};border-radius:8px;padding:14px 18px;margin-bottom:24px;}
  .warning-box p{font-size:8pt;color:${dunningColor};line-height:1.6;font-weight:500;}

  /* ── Bank ── */
  .bank-section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:24px;}
  .bank-section .title{font-size:7.5pt;font-weight:700;color:#0f172a;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;}
  .bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:7.5pt;color:#475569;}
  .bank-grid .label{color:#94a3b8;}
  .bank-grid .value{color:#0f172a;font-weight:500;}

  /* ── Footer ── */
  .footer{background:#0f172a;color:#94a3b8;padding:16px 40px;font-size:6.5pt;line-height:1.6;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;}
  .footer-col{display:flex;gap:16px;flex-wrap:wrap;}
  .footer-col span{white-space:nowrap;}
  .footer strong{color:#e2e8f0;font-weight:600;}
</style></head><body>
<div class="page">

  <!-- Brand bar -->
  <div class="brand-bar">
    <div>
      <div class="brand-name">${escapeHtml(cName)}</div>
      ${cOwner ? `<div class="brand-tagline">${escapeHtml(cOwner)}</div>` : ''}
    </div>
    <div class="brand-badge">${isSecond ? '2. MAHNUNG' : 'ZAHLUNGSERINNERUNG'}</div>
  </div>

  <!-- Sender line -->
  <div class="sender-line">${escapeHtml(cName)} · ${escapeHtml(addressLine)}${cPhone ? ` · Tel: ${escapeHtml(cPhone)}` : ''}${cEmail ? ` · ${escapeHtml(cEmail)}` : ''}</div>

  <div class="content">

    <!-- Addresses -->
    <div class="address-block">
      <div class="address-col">
        <div class="address-label">Absender</div>
        <div class="address-text">
          <strong>${escapeHtml(cName)}</strong><br>
          ${escapeHtml(addressLine)}
        </div>
      </div>
      <div class="address-col" style="text-align:right;">
        <div class="address-label">Datum</div>
        <div class="address-text">${dateStr}</div>
      </div>
    </div>

    <!-- Recipient -->
    <div class="recipient-box">
      <div class="recipient-title">${escapeHtml(kunde)}</div>
      ${projekt ? `<div class="recipient-detail">Projekt: ${escapeHtml(projekt)}</div>` : ''}
    </div>

    <!-- Subject -->
    <div class="subject-block">
      <div class="subject-ref">Rechnung ${escapeHtml(assignment.id) || '-'} vom ${escapeHtml(datum) || '-'}</div>
      <div class="subject-line">${isSecond ? '2. Mahnung' : 'Zahlungserinnerung'}</div>
      <div class="subject-underline"></div>
    </div>

    <!-- Body -->
    <div class="body-text">
      <p>Sehr geehrte Damen und Herren,</p>
      ${isSecond
        ? `<p>trotz unserer ersten Zahlungserinnerung vom ${escapeHtml(dueDate)} konnten wir bis heute keinen Zahlungseingang für die nachstehende Rechnung feststellen.</p>`
        : `<p>leider weist die nachstehende Rechnung noch einen offenen Betrag auf. Wir möchten Sie höflich bitten, die ausstehende Zahlung bis zum unten genannten Termin zu veranlassen.</p>`
      }
      <p>Bitte überweisen Sie den offenen Betrag in Höhe von <strong>${grossAmount.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</strong> bis zum <strong>${escapeHtml(dueDate)}</strong> auf das nachfolgende Konto.</p>
    </div>

    <!-- Amount -->
    <div class="amount-card">
      <div class="amount-label">
        ${isSecond ? 'Offener Gesamtbetrag' : 'Offener Rechnungsbetrag'}
        <span>inkl. gesetzlicher MwSt.</span>
      </div>
      <div class="amount-value">${grossAmount.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</div>
    </div>

    <!-- Invoice details -->
    <table class="invoice-table">
      <thead><tr>
        <th>Rechnungs-Nr.</th><th>Datum</th><th>Projekt</th><th>Netto</th><th>MwSt.</th><th>Gesamt</th>
      </tr></thead>
      <tbody><tr>
        <td>${escapeHtml(assignment.id) || '-'}</td>
        <td>${escapeHtml(datum) || '-'}</td>
        <td>${escapeHtml(projekt) || '-'}</td>
        <td>${netAmount.toLocaleString('de-DE', {minimumFractionDigits: 2})} €</td>
        <td>${taxAmount.toLocaleString('de-DE', {minimumFractionDigits: 2})} €</td>
        <td>${grossAmount.toLocaleString('de-DE', {minimumFractionDigits: 2})} €</td>
      </tr></tbody>
    </table>

    <!-- Warning -->
    ${isSecond ? `
    <div class="warning-box">
      <p>Sollte der offene Betrag nicht innerhalb von 10 Tagen nach Zugang dieser Mahnung ausgeglichen sein, sehen wir uns leider gezwungen, weitere rechtliche Schritte einzuleiten und die Forderung einem Inkassodienst zu übergeben. Die hierdurch entstehenden Mehrkosten gehen zu Ihren Lasten.</p>
    </div>` : `
    <div class="warning-box">
      <p>Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben als gegenstandslos. Vielen Dank für Ihre prompte Bearbeitung.</p>
    </div>`}

    <!-- Banking -->
    <div class="bank-section">
      <div class="title">Zahlungsdaten</div>
      <div class="bank-grid">
        ${cBankName ? `<div><span class="label">Bank</span><br><span class="value">${escapeHtml(cBankName)}</span></div>` : ''}
        ${cIban ? `<div><span class="label">IBAN</span><br><span class="value">${escapeHtml(cIban)}</span></div>` : ''}
        ${cBic ? `<div><span class="label">BIC</span><br><span class="value">${escapeHtml(cBic)}</span></div>` : ''}
        ${cOwner ? `<div><span class="label">Kontoinhaber</span><br><span class="value">${escapeHtml(cOwner)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-col">
      <span><strong>${escapeHtml(cName)}</strong></span>
      <span>${escapeHtml(addressLine)}</span>
      ${cPhone ? `<span>Tel: ${escapeHtml(cPhone)}</span>` : ''}
      ${cEmail ? `<span>${escapeHtml(cEmail)}</span>` : ''}
    </div>
    <div class="footer-col">
      ${cTaxId ? `<span>Steuer-Nr.: ${escapeHtml(cTaxId)}</span>` : ''}
      <span>Erstellt mit EarnTrack</span>
    </div>
  </div>

</div></body></html>`;
}
