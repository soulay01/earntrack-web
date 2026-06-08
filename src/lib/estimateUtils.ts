import { TEMPLATES, TemplateId } from './invoiceTemplates';
import { db } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';

export function generateEstimateNumber(): string {
  const d = new Date();
  return `KV-${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

export function fmt(n: number | string | undefined): string {
  return (parseFloat(String(n)) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function getTemplateCSS(template: any): string {
  const styleId: TemplateId = template.templateStyle || 'standard';
  const tpl = TEMPLATES[styleId];
  if (!tpl) return '';
  return tpl.cssOverrides();
}

export function generateInvoiceHTML(
  assignment: any,
  companyInfo: any = {},
  template: any = {},
  isSubscribed: boolean = false,
  options: { customers?: any[]; invoiceNumber?: string } = {},
): string {
  const { kunde = '', projekt = '', datum = '', stunden = '0', stundenlohn = '0', umsatz = '0', mitarbeiter = '', notizen = '' } = assignment || {};
  const hours = parseFloat(stunden) || 0;
  const revenue = typeof umsatz === 'string'
    ? (() => { const raw = umsatz.replace(/[€\s]/g, '').trim(); if (!raw) return 0; if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0; if (raw.includes(',') && !raw.includes('.')) return parseFloat(raw.replace(',', '.')) || 0; return parseFloat(raw) || 0; })()
    : parseFloat(umsatz) || 0;
  const taxRate = parseFloat(template.taxRate) || 19;
  const netAmount = revenue;
  const taxAmount = netAmount * (taxRate / 100);
  const grossAmount = netAmount + taxAmount;
  const today = new Date();
  const invoiceDate = today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const invoiceNumber = options.invoiceNumber || `${template.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
  const { companyName = 'Muster GmbH', companyOwner = '', companyAddress = 'Musterstr. 1, 12345 Berlin', companyPhone = '', companyEmail = '', companyFax = '', companyWeb = '', companyTaxId = '', companyBankName = '', companyIban = '', companyBic = '' } = companyInfo;
  const taxLabel = companyTaxId?.toUpperCase().startsWith('DE') ? 'USt.-IdNr.' : 'Steuernummer';
  const employees = Array.isArray(mitarbeiter) ? mitarbeiter : (mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean);
  const t = {
    invoiceTitle: template.invoiceTitle || 'Rechnung',
    metaLabels: { invoiceNumber: template.metaLabels?.invoiceNumber || 'Rechnungs-Nr.', orderNumber: template.metaLabels?.orderNumber || 'Auftrags-Nr.', commission: template.metaLabels?.commission || 'Kommission', customerNumber: template.metaLabels?.customerNumber || 'Kunden-Nr.', orderRef: template.metaLabels?.orderRef || 'Bestell-Nr.', invoiceDate: template.metaLabels?.invoiceDate || 'Rechnungsdatum', deliveryDate: template.metaLabels?.deliveryDate || 'Lieferdatum', processor: template.metaLabels?.processor || 'Bearbeiter' },
    tableHeaders: { position: template.tableHeaders?.position || 'Pos.', articleNumber: template.tableHeaders?.articleNumber || 'Art.-Nr.', description: template.tableHeaders?.description || 'Bezeichnung', quantity: template.tableHeaders?.quantity || 'Menge', unit: template.tableHeaders?.unit || 'Einheit', unitPrice: template.tableHeaders?.unitPrice || 'E-Preis €', total: template.tableHeaders?.total || 'Gesamt €' },
    defaultUnit: template.defaultUnit || 'Std.',
    summaryLabels: { net: template.summaryLabels?.net || 'Summe Netto', gross: template.summaryLabels?.gross || 'Endsumme' },
    footer: { deliveryTerms: template.footer?.deliveryTerms || 'Lieferbedingung: Postversand', paymentTerms: template.footer?.paymentTerms || 'Zahlbar innerhalb von 14 Tagen ohne Abzug. Vielen Dank für Ihren Auftrag!' },
    bankDetails: { accountHolder: template.bankDetails?.accountHolder || '', bankName: template.bankDetails?.bankName || '', iban: template.bankDetails?.iban || '', bic: template.bankDetails?.bic || '' },
  };
  const templateCss = getTemplateCSS(template);

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:8pt;color:#333;line-height:1.2;background:#fff;padding:12px;}
  .page{max-width:210mm;margin:0 auto;padding:12px;position:relative;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;}
  .brand-logo{font-size:18pt;font-weight:600;color:#333;display:flex;align-items:center;gap:6px;}
  .brand-logo svg{width:28px;height:28px;fill:#008080;}
  .brand-address{font-size:7pt;color:#666;margin-top:2px;}
  .company-info{text-align:right;font-size:7pt;color:#333;line-height:1.3;}
  .recipient{margin-bottom:20px;font-size:8pt;color:#333;font-weight:500;}
  .invoice-title{font-size:14pt;font-weight:700;color:#333;margin-bottom:10px;}
  .meta-grid{display:flex;gap:30px;margin-bottom:20px;font-size:7pt;}
  .meta-col{flex:1;}
  .meta-row{display:flex;justify-content:space-between;margin-bottom:2px;}
  .meta-label{color:#666;font-weight:400;}
  .meta-value{color:#333;font-weight:500;}
  .items-table{width:100%;border-collapse:collapse;margin-bottom:15px;font-size:7pt;}
  .items-table th{text-align:left;padding:6px 4px;border-bottom:1px solid #333;font-weight:600;color:#333;}
  .items-table th:last-child,.items-table th:nth-last-child(2){text-align:right;}
  .items-table td{padding:6px 4px;border-bottom:1px solid #eee;vertical-align:top;}
  .items-table td:last-child,.items-table td:nth-last-child(2){text-align:right;}
  .items-table tbody tr:last-child td{border-bottom:none;}
  .summary-table{width:200px;margin-left:auto;margin-bottom:20px;font-size:8pt;border-collapse:collapse;}
  .summary-table td{padding:4px 0;border-bottom:1px solid #eee;}
  .summary-table td:first-child{color:#666;font-weight:400;}
  .summary-table td:nth-child(2){width:10px;text-align:center;color:#666;}
  .summary-table td:last-child{text-align:right;font-weight:600;color:#333;}
  .summary-table tr:last-child td{border-top:2px solid #333;border-bottom:none;font-weight:700;}
  .footer{font-size:7pt;color:#666;margin-top:20px;line-height:1.3;}
  .footer strong{color:#333;font-weight:600;}
  .logo-banner,.sender-info,.salutation-text,.closing-text,.footer-cols{display:none;}
  .watermark-banner{background:#dc2626;color:#fff;text-align:center;padding:3px 0;font-size:6pt;font-weight:700;letter-spacing:2px;margin-bottom:8px}
  .watermark-diag{position:absolute;top:20%;left:-5%;width:120%;height:100%;pointer-events:none;overflow:hidden}
  .watermark-diag::before{content:'TESTPHASE';position:absolute;top:10%;left:-5%;font-size:55pt;font-weight:900;color:rgba(220,38,38,0.10);white-space:nowrap;transform:rotate(-30deg);letter-spacing:6px}
  .watermark-diag::after{content:'TESTPHASE';position:absolute;bottom:20%;right:-5%;font-size:55pt;font-weight:900;color:rgba(220,38,38,0.10);white-space:nowrap;transform:rotate(-30deg) scaleX(-1);letter-spacing:6px}
  ${templateCss}
</style></head><body>
<div class="page">
  ${!isSubscribed ? `<div class="watermark-banner">TESTPHASE · TESTPHASE · TESTPHASE · TESTPHASE · TESTPHASE</div><div class="watermark-diag"></div>` : ''}
  <div class="logo-banner">${template.logoUrl ? `<img src="${escapeHtml(template.logoUrl)}" alt="Logo" style="height:auto;max-height:56px;width:auto;max-width:200px;object-fit:contain;" />` : `<span>${escapeHtml(companyName)}</span>`}</div>
  <div class="sender-info">
    <div class="sender-company"><strong>${escapeHtml(companyName)}</strong></div>
    ${companyOwner ? `<div class="sender-owner">${escapeHtml(companyOwner)}</div>` : ''}
    ${(() => {
      const addr = companyAddress || '';
      const idx = addr.indexOf(',');
      if (idx !== -1) {
        return `<div class="sender-street">${escapeHtml(addr.substring(0, idx).trim())}</div><div class="sender-city">${escapeHtml(addr.substring(idx + 1).trim())}</div>`;
      }
      return addr ? `<div class="sender-street">${escapeHtml(addr)}</div>` : '';
    })()}
    <div class="sender-contact">
      ${companyPhone ? `<span>Tel.: ${escapeHtml(companyPhone)}</span>` : ''}
      ${companyFax ? `<span>Fax: ${escapeHtml(companyFax)}</span>` : ''}
      ${companyEmail ? `<span>${escapeHtml(companyEmail)}</span>` : ''}
      ${companyWeb ? `<span>${escapeHtml(companyWeb)}</span>` : ''}
    </div>
  </div>
  <div class="header">
    <div>
      <div class="brand-logo">${template.logoUrl ? `<img src="${escapeHtml(template.logoUrl)}" alt="Logo" style="height:36px;width:auto;max-width:160px;object-fit:contain;margin-right:8px;border:1px solid #e5e7eb;border-radius:4px;padding:2px;" />` : `<svg viewBox="0 0 24 24"><path d="M2 20h20v-2H2v2zm2-3h2V7H4v10zM8 17h2V3H8v14zm4 0h2V9h-2v8zm4 0h2V5h-2v12z"/></svg>`}${escapeHtml(companyName)}</div>
      <div class="brand-address">${escapeHtml(companyAddress)}</div>
    </div>
    <div class="company-info">
      <div style="font-weight:600;">${escapeHtml(companyName)}</div>${companyOwner ? `<div>Inhaber: ${escapeHtml(companyOwner)}</div>` : ''}<div>${escapeHtml(companyAddress)}</div>${companyFax ? `<div>Fax: ${escapeHtml(companyFax)}</div>` : ''}<div>${escapeHtml(companyPhone)}</div><div>${escapeHtml(companyEmail)}</div><div>${escapeHtml(companyWeb)}</div>
    </div>
  </div>
  <div class="recipient">
    <div style="font-weight:700;font-size:9pt;margin-bottom:2px;">${escapeHtml(kunde)}</div>
    ${(() => {
      const customer = (options.customers || []).find((c: any) => c.name === kunde);
      if (customer?.adresse) {
        return `<div style="color:#444;font-size:9pt;line-height:1.4;">${escapeHtml(customer.adresse).replace(/,/g, '<br>')}</div>`;
      }
      return '';
    })()}
    ${projekt ? `<div style="color:#666;margin-top:2px;">${escapeHtml(projekt)}</div>` : ''}
  </div>
  <div class="meta-grid">
    <div class="meta-col">
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.invoiceNumber)}:</span><span class="meta-value">${invoiceNumber}</span></div>
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.orderNumber)}:</span><span class="meta-value">${escapeHtml(assignment.id) || '-'}</span></div>
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.commission)}:</span><span class="meta-value">-</span></div>
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.customerNumber)}:</span><span class="meta-value">-</span></div>
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.orderRef)}:</span><span class="meta-value">-</span></div>
    </div>
    <div class="meta-col">
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.invoiceDate)}:</span><span class="meta-value">${invoiceDate}</span></div>
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.deliveryDate)}:</span><span class="meta-value">${escapeHtml(datum) || '-'}</span></div>
      <div class="meta-row"><span class="meta-label">${escapeHtml(t.metaLabels.processor)}:</span><span class="meta-value">${escapeHtml(employees[0]) || '-'}</span></div>
    </div>
  </div>
  <div class="invoice-title">${escapeHtml(t.invoiceTitle)}</div>
  <table class="items-table">
    <thead><tr>
      <th style="width:20px;">${escapeHtml(t.tableHeaders.position)}</th><th style="width:60px;">${escapeHtml(t.tableHeaders.articleNumber)}</th>
      <th>${escapeHtml(t.tableHeaders.description)}</th><th style="width:30px;text-align:right;">${escapeHtml(t.tableHeaders.quantity)}</th>
      <th style="width:30px;text-align:right;">${escapeHtml(t.tableHeaders.unit)}</th><th style="width:70px;text-align:right;">${escapeHtml(t.tableHeaders.unitPrice)}</th>
      <th style="width:70px;text-align:right;">${escapeHtml(t.tableHeaders.total)}</th>
    </tr></thead>
    <tbody><tr>
      <td>1</td><td>${escapeHtml(assignment.id) || '-'}</td>
      <td><div style="font-weight:600;">${escapeHtml(projekt) || 'Dienstleistung'}</div>${mitarbeiter ? `<div style="font-size:6pt;color:#666;">${escapeHtml(mitarbeiter)}</div>` : ''}</td>
      <td style="text-align:right;">${hours.toFixed(2)}</td><td style="text-align:right;">${escapeHtml(t.defaultUnit)}</td>
      <td style="text-align:right;">${(parseFloat(stundenlohn) || 0).toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="text-align:right;font-weight:600;">${netAmount.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
    </tr></tbody>
  </table>
  <table class="summary-table">
    <tr><td>${escapeHtml(t.summaryLabels.net)}</td><td>€</td><td>${netAmount.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
    <tr><td>${taxRate.toFixed(2)}% USt.</td><td>€</td><td>${taxAmount.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
    <tr><td>${escapeHtml(t.summaryLabels.gross)}</td><td>€</td><td>${grossAmount.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
  </table>
  <div class="footer">
    <div>${escapeHtml(t.footer.deliveryTerms)}</div><div style="margin-top:2px;">${escapeHtml(t.footer.paymentTerms)}</div>
    ${(t.bankDetails?.accountHolder || t.bankDetails?.iban || companyIban) ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #ddd;"><strong style="color:#333;">Bankverbindung</strong><br>${t.bankDetails?.accountHolder ? `<span>Kontoinhaber: ${escapeHtml(t.bankDetails.accountHolder)}</span><br>` : ''}${t.bankDetails?.bankName || companyBankName ? `<span>Bank: ${escapeHtml(t.bankDetails?.bankName || companyBankName)}</span><br>` : ''}${t.bankDetails?.iban || companyIban ? `<span>IBAN: ${escapeHtml(t.bankDetails?.iban || companyIban)}</span><br>` : ''}${t.bankDetails?.bic || companyBic ? `<span>BIC: ${escapeHtml(t.bankDetails?.bic || companyBic)}</span>` : ''}</div>` : ''}
    ${companyTaxId ? `<div style="margin-top:4px;font-size:6pt;color:#999;">${taxLabel}: ${escapeHtml(companyTaxId)}</div>` : ''}
  </div>
  <div class="footer-cols">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          <strong>${escapeHtml(companyName)}</strong><br>
          ${escapeHtml(companyAddress.split(',')[0]?.trim() || companyAddress)}<br>
          ${escapeHtml(companyAddress.includes(',') ? companyAddress.split(',').slice(1).join(',').trim() : '')}
        </td>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          ${companyOwner ? `<strong>Gesch&auml;ftsf&uuml;hrer:</strong> ${escapeHtml(companyOwner)}<br>` : ''}
          <strong>Tel.:</strong> ${escapeHtml(companyPhone)}<br>
          <strong>Mail:</strong> ${escapeHtml(companyEmail)}
        </td>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          <strong>${escapeHtml(t.bankDetails?.bankName || companyBankName || 'Bank')}</strong><br>
          <strong>IBAN:</strong> ${escapeHtml(t.bankDetails?.iban || companyIban)}<br>
          ${t.bankDetails?.bic || companyBic ? `<strong>BIC:</strong> ${escapeHtml(t.bankDetails?.bic || companyBic)}` : ''}
        </td>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          ${companyTaxId ? `<strong>${taxLabel}</strong> ${escapeHtml(companyTaxId)}` : ''}
        </td>
      </tr>
    </table>
  </div>
</div></body></html>`;
}

export function generateEstimateHTML(data: any, template: any = {}, isSubscribed: boolean = false): string {
  const { kunde, projekt, mitarbeiterList, materialienList, sonstigeKosten, gewinnmarge, companyData, estimateNumber } = data;
  const today = new Date();
  const dateStr = today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const num = estimateNumber || generateEstimateNumber();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);
  const validUntilStr = validUntil.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const totalMitarbeiter = (mitarbeiterList || []).reduce((sum: number, m: any) => sum + (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0), 0);
  const totalMaterial = (materialienList || []).reduce((sum: number, m: any) => sum + (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0), 0);
  const totalSonstige = (sonstigeKosten || []).reduce((sum: number, s: any) => sum + (parseFloat(s.betrag) || 0), 0);
  const gesamt = totalMitarbeiter + totalMaterial + totalSonstige;
  const margeNum = parseFloat(gewinnmarge) || 0;
  const endpreis = gesamt * (1 + margeNum / 100);

  let pos = 1;
  let tableRows = '';
  (mitarbeiterList || []).forEach((m: any) => {
    const cost = (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0);
    tableRows += `<tr><td>${pos}</td><td>-</td><td><div style="font-weight:600;">${escapeHtml(m.name)}</div><div style="font-size:6pt;color:#666;">Stundenlohn × Stunden</div></td><td style="text-align:right;">${parseFloat(m.stunden) || 0}</td><td style="text-align:right;">Std.</td><td style="text-align:right;">${fmt(parseFloat(m.stundenlohn) || 0)}</td><td style="text-align:right;font-weight:600;">${fmt(cost)}</td></tr>`;
    pos++;
  });
  (materialienList || []).forEach((m: any) => {
    const cost = (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0);
    tableRows += `<tr><td>${pos}</td><td>-</td><td><div style="font-weight:600;">${escapeHtml(m.name)}</div><div style="font-size:6pt;color:#666;">Preis × Menge</div></td><td style="text-align:right;">${parseFloat(m.menge) || 0}</td><td style="text-align:right;">Stk.</td><td style="text-align:right;">${fmt(parseFloat(m.preis) || 0)}</td><td style="text-align:right;font-weight:600;">${fmt(cost)}</td></tr>`;
    pos++;
  });
  (sonstigeKosten || []).filter((s: any) => s.name).forEach((s: any) => {
    tableRows += `<tr><td>${pos}</td><td>-</td><td><div style="font-weight:600;">${escapeHtml(s.name)}</div></td><td style="text-align:right;">1</td><td style="text-align:right;">-</td><td style="text-align:right;">-</td><td style="text-align:right;font-weight:600;">${fmt(parseFloat(s.betrag) || 0)}</td></tr>`;
    pos++;
  });

  const templateCss = getTemplateCSS(template);

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:8pt;color:#333;line-height:1.2;background:#fff;padding:12px;}.page{max-width:210mm;margin:0 auto;padding:12px;position:relative;}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;}.brand-logo{font-size:18pt;font-weight:600;color:#333;display:flex;align-items:center;gap:6px;}.brand-logo svg{width:28px;height:28px;fill:#008080;}.brand-address{font-size:7pt;color:#666;margin-top:2px;}.company-info{text-align:right;font-size:7pt;color:#333;line-height:1.3;}.recipient{margin-bottom:20px;font-size:8pt;color:#333;font-weight:500;}.invoice-title{font-size:14pt;font-weight:700;color:#333;margin-bottom:10px;}.meta-grid{display:flex;gap:30px;margin-bottom:20px;font-size:7pt;}.meta-col{flex:1;}.meta-row{display:flex;justify-content:space-between;margin-bottom:2px;}.meta-label{color:#666;font-weight:400;}.meta-value{color:#333;font-weight:500;}.items-table{width:100%;border-collapse:collapse;margin-bottom:15px;font-size:7pt;}.items-table th{text-align:left;padding:6px 4px;border-bottom:1px solid #333;font-weight:600;color:#333;}.items-table th:last-child,.items-table th:nth-last-child(2){text-align:right;}.items-table td{padding:6px 4px;border-bottom:1px solid #eee;vertical-align:top;}.items-table td:last-child,.items-table td:nth-last-child(2){text-align:right;}.items-table tbody tr:last-child td{border-bottom:none;}.summary-table{width:200px;margin-left:auto;margin-bottom:20px;font-size:8pt;border-collapse:collapse;}.summary-table td{padding:4px 0;border-bottom:1px solid #eee;}.summary-table td:first-child{color:#666;font-weight:400;}.summary-table td:nth-child(2){width:10px;text-align:center;color:#666;}.summary-table td:last-child{text-align:right;font-weight:600;color:#333;}.summary-table tr:last-child td{border-top:2px... (line truncated to 2000 chars)
  .watermark-banner{background:#dc2626;color:#fff;text-align:center;padding:3px 0;font-size:6pt;font-weight:700;letter-spacing:2px;margin-bottom:8px}
  .watermark-diag{position:absolute;top:20%;left:-5%;width:120%;height:100%;pointer-events:none;overflow:hidden}
  .watermark-diag::before{content:'TESTPHASE';position:absolute;top:10%;left:-5%;font-size:55pt;font-weight:900;color:rgba(220,38,38,0.10);white-space:nowrap;transform:rotate(-30deg);letter-spacing:6px}
  .watermark-diag::after{content:'TESTPHASE';position:absolute;bottom:20%;right:-5%;font-size:55pt;font-weight:900;color:rgba(220,38,38,0.10);white-space:nowrap;transform:rotate(-30deg) scaleX(-1);letter-spacing:6px}
  ${templateCss}
</style></head><body>
<div class="page">
  ${!isSubscribed ? `<div class="watermark-banner">TESTPHASE · TESTPHASE · TESTPHASE · TESTPHASE · TESTPHASE</div><div class="watermark-diag"></div>` : ''}
  <div class="logo-banner">${template.logoUrl ? `<img src="${escapeHtml(template.logoUrl)}" alt="Logo" style="height:auto;max-height:56px;width:auto;max-width:200px;object-fit:contain;" />` : `<span>${escapeHtml(companyData?.companyName) || 'EarnTrack'}</span>`}</div>
  <div class="sender-info">
    <div class="sender-company"><strong>${escapeHtml(companyData?.companyName) || 'EarnTrack'}</strong></div>
    ${companyData?.owner ? `<div class="sender-owner">${escapeHtml(companyData.owner)}</div>` : ''}
    ${companyData?.street ? `<div class="sender-street">${escapeHtml(companyData.street)}</div>` : ''}
    <div class="sender-city">${companyData?.zip ? escapeHtml(companyData.zip) + ' ' : ''}${escapeHtml(companyData?.city) || ''}</div>
    <div class="sender-contact">
      ${companyData?.phone ? `<span>Tel.: ${escapeHtml(companyData.phone)}</span>` : ''}
      ${companyData?.email ? `<span>${escapeHtml(companyData.email)}</span>` : ''}
      ${companyData?.website ? `<span>${escapeHtml(companyData.website)}</span>` : ''}
    </div>
  </div>
  <div class="header">
    <div>
      <div class="brand-logo"><svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:#008080;"><path d="M2 20h20v-2H2v2zm2-3h2V7H4v10zM8 17h2V3H8v14zm4 0h2V9h-2v8zm4 0h2V5h-2v12z"/></svg>${escapeHtml(companyData?.companyName) || 'EarnTrack'}</div>
      <div class="brand-address">${companyData?.owner ? escapeHtml(companyData.owner) + ' · ' : ''}${escapeHtml(companyData?.street) || ''}${(companyData?.street && companyData?.city) ? ', ' : ''}${escapeHtml(companyData?.city) || ''}</div>
    </div>
    <div class="company-info"><div style="font-weight:600;">${escapeHtml(companyData?.companyName) || 'EarnTrack'}</div>${companyData?.owner ? `<div>${escapeHtml(companyData.owner)}</div>` : ''}${companyData?.street ? `<div>${escapeHtml(companyData.street)}</div>` : ''}${companyData?.zip && companyData?.city ? `<div>${escapeHtml(companyData.zip)} ${escapeHtml(companyData.city)}</div>` : ''}${companyData?.phone ? `<div>Tel: ${escapeHtml(companyData.phone)}</div>` : ''}${companyData?.email ? `<div>${escapeHtml(companyData.email)}</div>` : ''}${companyData?.website ? `<div>${escapeHtml(companyData.website)}</div>` : ''}${companyData?.taxId ? `<div>StNr: ${escapeHtml(companyData.taxId)}</div>` : ''}</div>
    </div>
  <div class="recipient"><div style="font-weight:700;font-size:9pt;margin-bottom:2px;">${escapeHtml(kunde) || '–'}</div>${projekt ? `<div style="color:#666;">Projekt: ${escapeHtml(projekt)}</div>` : ''}</div>
  <div class="invoice-title">Kostenvoranschlag</div>
  <div class="meta-grid">
    <div class="meta-col"><div class="meta-row"><span class="meta-label">Nummer:</span><span class="meta-value">${num}</span></div><div class="meta-row"><span class="meta-label">Datum:</span><span class="meta-value">${dateStr}</span></div><div class="meta-row"><span class="meta-label">Gültig bis:</span><span class="meta-value">${validUntilStr}</span></div></div>
    <div class="meta-col"><div class="meta-row"><span class="meta-label">Mitarbeiter:</span><span class="meta-value">${(mitarbeiterList || []).length} Person(en)</span></div><div class="meta-row"><span class="meta-label">Materialien:</span><span class="meta-value">${(materialienList || []).length} Posten</span></div></div>
  </div>
  <table class="items-table"><thead><tr><th style="width:20px;">Pos.</th><th style="width:60px;">Art.-Nr.</th><th>Bezeichnung</th><th style="width:30px;text-align:right;">Menge</th><th style="width:30px;text-align:right;">Einheit</th><th style="width:70px;text-align:right;">E-Preis €</th><th style="width:70px;text-align:right;">Gesamt €</th></tr></thead><tbody>${tableRows}</tbody></table>
  <table class="summary-table"><tr><td>Summe Netto</td><td>€</td><td>${fmt(gesamt)}</td></tr>${margeNum > 0 ? `<tr><td>Aufschlag ${margeNum}%</td><td>€</td><td>${fmt(gesamt * margeNum / 100)}</td></tr>` : ''}<tr><td>Endsumme</td><td>€</td><td>${fmt(endpreis)}</td></tr></table>
  <div class="footer"><div style="margin-top:2px;">Dieser Kostenvoranschlag ist ${margeNum > 0 ? 'ein verbindliches Angebot ' : ''}bis zum ${validUntilStr} gültig. Änderungen vorbehalten.</div>${companyData?.bankName || companyData?.iban ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #ddd;"><strong>Zahlungsdaten:</strong> ${escapeHtml(companyData?.bankName) || ''}${companyData?.iban ? ` · IBAN: ${escapeHtml(companyData.iban)}` : ''}${companyData?.bic ? ` · BIC: ${escapeHtml(companyData.bic)}` : ''}</div>` : ''}<div style="margin-top:4px;font-size:6pt;color:#999;">Erstellt mit EarnTrack · ${dateStr}</div></div>
  <div class="footer-cols">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          <strong>${escapeHtml(companyData?.companyName) || 'EarnTrack'}</strong><br>
          ${escapeHtml(companyData?.street) || ''}${(companyData?.street && companyData?.city) ? ', ' : ''}${escapeHtml(companyData?.city) || ''}
        </td>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          ${companyData?.owner ? `<strong>Inhaber:</strong> ${escapeHtml(companyData.owner)}<br>` : ''}
          <strong>Tel.:</strong> ${escapeHtml(companyData?.phone) || ''}<br>
          <strong>Mail:</strong> ${escapeHtml(companyData?.email) || ''}
        </td>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          <strong>${escapeHtml(companyData?.bankName || 'Bank')}</strong><br>
          <strong>IBAN:</strong> ${escapeHtml(companyData?.iban) || ''}<br>
          ${companyData?.bic ? `<strong>BIC:</strong> ${escapeHtml(companyData.bic)}` : ''}
        </td>
        <td style="width:25%;font-size:7.5pt;line-height:1.4;color:#555;vertical-align:top;padding:0 5px;">
          ${companyData?.taxId ? `<strong>StNr:</strong> ${escapeHtml(companyData.taxId)}` : ''}
        </td>
      </tr>
    </table>
  </div>
</div></body></html>`;
}

export function generateCSVContent(assignment: any, companyInfo: any = {}, template: any = {}): string {
  const { kunde = '', projekt = '', datum = '', stunden = '0', stundenlohn = '0', umsatz = '0', mitarbeiter = '' } = assignment || {};
  const hours = parseFloat(stunden) || 0;
  const revenue = typeof umsatz === 'number' ? umsatz : (parseFloat(String(umsatz).replace(/[€\s]/g, '').replace(',', '.')) || 0);
  const taxRate = parseFloat(template.taxRate) || 19;
  const netAmount = revenue;
  const taxAmount = netAmount * (taxRate / 100);
  const grossAmount = netAmount + taxAmount;
  const today = new Date();
  const invoiceDate = today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const invoiceNumber = `${template.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const { companyName = 'Muster GmbH', companyAddress = 'Musterstr. 1', companyPhone = '', companyEmail = '', companyTaxId = '' } = companyInfo;
  const tDefaultUnit = template.defaultUnit || 'Std.';
  const tInvTitle = template.invoiceTitle || 'Rechnung';
  const tPos = template.tableHeaders?.position || 'Pos.';
  const tArt = template.tableHeaders?.articleNumber || 'Art.-Nr.';
  const tDesc = template.tableHeaders?.description || 'Bezeichnung';
  const tQty = template.tableHeaders?.quantity || 'Menge';
  const tUnit = template.tableHeaders?.unit || 'Einheit';
  const tUP = template.tableHeaders?.unitPrice || 'E-Preis €';
  const tTot = template.tableHeaders?.total || 'Gesamt €';
  const tNet = template.summaryLabels?.net || 'Summe Netto';
  const tGross = template.summaryLabels?.gross || 'Endsumme';
  const sep = ';';
  const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
  const f2 = (n: number) => n.toLocaleString('de-DE', {minimumFractionDigits: 2});
  const meta = template.metaLabels || {};
  const foot = template.footer || {};
  return '\ufeff'
    + `${q(tInvTitle)}${sep}${sep}${sep}${q(invoiceNumber)}${sep}${q(invoiceDate)}\n`
    + `${sep}${sep}${sep}${sep}\n`
    + `${q(companyName)}${sep}${sep}${sep}${sep}\n`
    + `${q(companyAddress)}${sep}${sep}${sep}${sep}\n`
    + `${companyPhone ? `Tel: ${companyPhone}` : ''}${sep}${sep}${sep}${sep}\n`
    + `${companyEmail ? `E-Mail: ${companyEmail}` : ''}${sep}${sep}${sep}${sep}\n`
    + `${sep}${sep}${sep}${sep}\n`
    + `${q(kunde ? `Rechnungsempfänger: ${kunde}` : '')}${sep}${sep}${sep}${sep}\n`
    + `${projekt ? `Projekt: ${projekt}` : ''}${sep}${sep}${sep}${sep}\n`
    + `${sep}${sep}${sep}${sep}\n`
    + `${q(meta.invoiceNumber || 'Rechnungs-Nr.')}${sep}${q(invoiceNumber)}${sep}${q(meta.invoiceDate || 'Rechnungsdatum')}${sep}${q(invoiceDate)}\n`
    + `${q(meta.orderNumber || 'Auftrags-Nr.')}${sep}${q(assignment.id || '-')}${sep}${q(meta.deliveryDate || 'Lieferdatum')}${sep}${q(datum || '-')}\n`
    + `${q(meta.processor || 'Bearbeiter')}${sep}${q(Array.isArray(mitarbeiter) ? (mitarbeiter[0] || '') : (mitarbeiter||'').split(',')[0]?.trim() || '-')}${sep}${sep}\n`
    + `${sep}${sep}${sep}${sep}\n`
    + `${q(tPos)}${sep}${q(tArt)}${sep}${q(tDesc)}${sep}${q(tQty)}${sep}${q(tUnit)}${sep}${q(tUP)}${sep}${q(tTot)}\n`
    + `1${sep}${q(assignment.id || '-')}${sep}${q(projekt || 'Dienstleistung')}${sep}${hours.toFixed(2)}${sep}${q(tDefaultUnit)}${sep}${(parseFloat(stundenlohn) || 0).toLocaleString('de-DE', {minimumFractionDigits: 2})}${sep}${f2(netAmount)}\n`
    + `${sep}${sep}${sep}${sep}${sep}${sep}\n`
    + `${q(tNet)}${sep}${sep}${sep}${sep}${sep}€${sep}${f2(netAmount)}\n`
    + `${taxRate.toFixed(2)}% USt.${sep}${sep}${sep}${sep}${sep}€${sep}${f2(taxAmount)}\n`
    + `${q(tGross)}${sep}${sep}${sep}${sep}${sep}€${sep}${f2(grossAmount)}\n`
    + `${sep}${sep}${sep}${sep}${sep}${sep}\n`
    + `${q(foot.deliveryTerms || '')}${sep}${sep}${sep}${sep}${sep}${sep}\n`
    + `${q(foot.paymentTerms || '')}${sep}${sep}${sep}${sep}${sep}${sep}\n`;
}

export async function generateSequentialInvoiceNumber(
  companyId: string,
  prefix: string = 'INV-',
): Promise<string> {
  const year = new Date().getFullYear();
  const ref = doc(db, 'companies', companyId, 'settings', `invoiceCounter_${year}`);
  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = (snap.exists() ? snap.data().counter : 0) + 1;
    transaction.set(ref, { counter: current }, { merge: true });
    return current;
  });
  return `${prefix}${year}-${String(result).padStart(6, '0')}`;
}
