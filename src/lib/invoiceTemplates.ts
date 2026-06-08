export const TEMPLATES = {
  standard: {
    id: 'standard',
    name: 'Standard',
    cssOverrides: () => `
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #333333;
    background-color: #f4f2ef;
    font-size: 10pt;
    line-height: 1.5;
    padding: 10mm;
  }

  .page {
    max-width: 210mm;
    margin: 0 auto;
    background: #ffffff;
    padding: 20mm 15mm 30mm;
    position: relative;
    box-shadow: 0 2px 16px rgba(0,0,0,0.04);
  }

  .header { display: none !important; }

  /* ===== LOGO-BANNER oben rechts ===== */
  .logo-banner {
    display: block !important;
    text-align: right;
    padding-bottom: 6mm;
    border-bottom: 1px solid #e8e8e8;
    margin-bottom: 6mm;
  }
  .logo-banner img {
    display: inline-block;
    height: auto;
    max-height: 56px;
    width: auto;
    max-width: 200px;
    object-fit: contain;
    vertical-align: middle;
  }
  .logo-banner span {
    font-size: 22pt;
    font-weight: bold;
    color: #e14d43;
    letter-spacing: -0.5px;
  }

  /* ===== ABSENDER oben rechts ===== */
  .sender-info {
    display: block !important;
    float: right;
    width: 42%;
    text-align: right;
    font-size: 9pt;
    line-height: 1.5;
    color: #444444;
    margin-bottom: 6mm;
    padding-left: 4mm;
  }
  .sender-info .sender-company { margin-bottom: 1mm; }
  .sender-info .sender-company strong {
    font-weight: 700; color: #222222; font-size: 10pt;
  }
  .sender-info .sender-owner { font-size: 8.5pt; color: #666666; }
  .sender-info .sender-street { font-size: 8.5pt; margin-top: 1.5mm; color: #555555; }
  .sender-info .sender-city { font-size: 8.5pt; margin-bottom: 3mm; color: #555555; }
  .sender-info .sender-contact { font-size: 8pt; margin: 0; }
  .sender-info .sender-contact span { display: block; color: #777777; }

  /* ===== EMPFÄNGER links ===== */
  .recipient {
    display: block !important;
    float: left;
    width: 50%;
    margin: 0;
    font-size: 10pt;
    line-height: 1.5;
    color: #000000;
  }
  .recipient > div:first-child {
    font-size: 11pt;
    font-weight: 600;
    margin: 0;
    color: #111111;
  }
  .recipient > div:last-child {
    font-size: 10pt;
    color: #444444;
    margin-top: 1mm;
  }

  /* ===== METADATEN oben rechts (unter Absender) ===== */
  .meta-grid {
    display: block !important;
    float: right;
    width: 42%;
    font-size: 9pt;
    line-height: 1.7;
    color: #444444;
    text-align: right;
    clear: right;
  }
  .meta-col { display: block; width: 100%; }
  .meta-row { display: block; padding: 0; margin: 0; }
  .meta-label { display: inline; color: #999999; font-weight: 400; }
  .meta-value { display: inline; color: #333333; font-weight: 500; }

  /* ===== RECHNUNG TITEL ===== */
  .invoice-title {
    clear: both;
    font-size: 16pt;
    font-weight: 700;
    color: #111111;
    margin-top: 10mm;
    margin-bottom: 6mm;
    padding-top: 4mm;
    border-top: 2px solid #e14d43;
  }

  /* ===== ANREDE ===== */
  .salutation-text {
    display: block !important;
    font-size: 10pt;
    line-height: 1.6;
    margin-bottom: 6mm;
    color: #333333;
  }

  /* ===== TABELLE ===== */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8mm;
    font-size: 9.5pt;
  }
  .items-table thead th {
    background-color: #e8e8e8;
    color: #333333;
    font-weight: 600;
    font-size: 9pt;
    padding: 8px 10px;
    text-align: left;
    border: none;
    border-bottom: 2px solid #cccccc;
  }
  .items-table thead th:last-child,
  .items-table thead th:nth-last-child(2) {
    text-align: right;
  }
  .items-table thead th:first-child {
    width: 6%;
  }
  .items-table tbody td {
    padding: 10px 10px;
    font-size: 9.5pt;
    vertical-align: top;
    border: none;
    border-bottom: 1px solid #eeeeee;
    line-height: 1.5;
  }
  .items-table tbody td:last-child,
  .items-table tbody td:nth-last-child(2) {
    text-align: right;
  }
  .items-table tbody tr:nth-child(even) td {
    background-color: #f8f8f8;
  }
  .items-table tbody tr:nth-child(odd) td {
    background-color: #ffffff;
  }
  .items-table tbody td div:first-child {
    font-weight: 600;
    color: #111111;
  }
  .items-table tbody td div:last-child {
    font-size: 8.5pt;
    color: #888888;
    margin-top: 1mm;
  }

  /* ===== SUMMEN ===== */
  .summary-table {
    width: 280px;
    margin-left: auto;
    margin-bottom: 10mm;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .summary-table td {
    padding: 5px 10px;
    font-size: 9.5pt;
    line-height: 1.5;
    border: none;
  }
  .summary-table td:first-child {
    text-align: left;
    color: #555555;
  }
  .summary-table td:nth-child(2) {
    display: none;
  }
  .summary-table td:last-child {
    text-align: right;
    color: #111111;
    font-weight: 500;
    width: 100px;
  }
  .summary-table tr:last-child td {
    border-top: 2px solid #333333;
    padding-top: 6px;
    font-size: 11pt;
    font-weight: 700;
    color: #111111;
  }

  .footer { display: none !important; }

  /* ===== FUSSZEILE ===== */
  .footer-cols {
    display: block !important;
    border-top: 1px solid #dddddd;
    padding-top: 4mm;
    margin-top: 5mm;
  }
  .footer-cols table { width: 100%; border-collapse: collapse; }
  .footer-cols td {
    width: 25%;
    font-size: 7.5pt;
    line-height: 1.5;
    color: #888888;
    vertical-align: top;
    padding: 0 5px;
  }
  .footer-cols td:first-child { padding-left: 0; }
  .footer-cols td:last-child { padding-right: 0; }
  .footer-cols td strong { color: #555555; font-weight: 600; }
`,
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    cssOverrides: () => `
  body { background: #f4f1ea; padding: 24px; }
  .page { background: #fff; box-shadow: 0 2px 24px rgba(30,58,95,0.1); padding: 0; }
  .header { background: linear-gradient(135deg, #1e3a5f, #2d5a8e); color: #fff; padding: 30px 44px; margin-bottom: 0; border-bottom: 2px solid #d4a843; }
  .header .brand-logo { color: #fff; font-size: 18pt; font-weight: 700; }
  .header .brand-logo svg { fill: #d4a843; width: 32px; height: 32px; }
  .header .brand-address { color: rgba(255,255,255,0.55); font-size: 7pt; margin-top: 4px; }
  .header .company-info { color: rgba(255,255,255,0.7); font-size: 7pt; text-align: right; line-height: 1.6; }
  .header .company-info div:first-child { color: #d4a843; font-weight: 700; font-size: 8pt; }
  .recipient { padding: 24px 44px 8px; margin-bottom: 0; }
  .recipient > div:first-child { font-size: 10pt; }
  .invoice-title { margin: 0 44px 16px; padding-bottom: 10px; border-bottom: 2px solid #1e3a5f; color: #1e3a5f; font-size: 16pt; font-weight: 700; }
  .meta-grid { padding: 14px 44px; margin-bottom: 18px; background: #f8f7f4; gap: 40px; }
  .meta-label { color: #1e3a5f; font-weight: 600; font-size: 7pt; }
  .meta-value { font-weight: 500; font-size: 7pt; }
  .items-table { margin: 0 44px 16px; width: calc(100% - 88px); }
  .items-table th { background: #1e3a5f; color: #fff; border-bottom: none; padding: 9px 8px; font-size: 7.5pt; letter-spacing: 0.3px; }
  .items-table td { padding: 8px; border-bottom: 1px solid #e8e4dd; }
  .items-table tbody tr:last-child td { border-bottom: 2px solid #1e3a5f; }
  .summary-table { margin: 0 44px 20px; }
  .summary-table td { padding: 5px 0; }
  .summary-table tr:last-child td { border-top-color: #1e3a5f; color: #1e3a5f; font-weight: 700; font-size: 10pt; }
  .footer { padding: 14px 44px 30px; border-top: 2px solid #d4a843; margin-top: 0; }
`,
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    cssOverrides: () => `
  body { background: #f0fdfa; padding: 24px; }
  .page { background: #fff; border-radius: 8px; box-shadow: 0 4px 24px rgba(13,148,136,0.08); padding: 0; position: relative; border-left: 4px solid #0d9488; overflow: hidden; }
  .page::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #0d9488, #14b8a6, #5eead4); z-index: 1; }
  .header { padding: 32px 40px 14px; margin-bottom: 0; border-bottom: 1px solid #e2e8f0; }
  .header .brand-logo { color: #0d9488; font-size: 16pt; font-weight: 700; }
  .header .brand-logo svg { fill: #0d9488; width: 30px; height: 30px; }
  .header .brand-address { color: #94a3b8; font-size: 7pt; margin-top: 3px; }
  .header .company-info { color: #64748b; font-size: 7pt; line-height: 1.6; text-align: right; }
  .recipient { background: #f8fafc; border-radius: 6px; padding: 14px 20px; margin: 14px 40px 16px; }
  .recipient > div:first-child { font-size: 9pt; }
  .invoice-title { margin: 0 40px 12px; padding-bottom: 6px; color: #0d9488; font-size: 15pt; font-weight: 700; }
  .meta-grid { padding: 0 40px; margin-bottom: 16px; gap: 40px; }
  .meta-label { color: #0d9488; font-weight: 600; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-value { font-size: 7pt; font-weight: 500; }
  .meta-row { padding: 3px 0; border-bottom: 1px dotted #e2e8f0; }
  .meta-row:last-child { border-bottom: none; }
  .items-table { margin: 0 40px 14px; width: calc(100% - 80px); }
  .items-table th { background: linear-gradient(135deg, #0d9488, #14b8a6); color: #fff; border-bottom: none; padding: 9px 8px; font-size: 7pt; letter-spacing: 0.5px; text-transform: uppercase; }
  .items-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  .items-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .items-table tbody tr:last-child td { border-bottom: 2px solid #0d9488; }
  .summary-table { margin: 0 40px 20px; }
  .summary-table td { padding: 6px 0; }
  .summary-table tr:last-child td { border-top-color: #0d9488; color: #0d9488; font-weight: 700; font-size: 10pt; }
  .footer { padding: 12px 40px 28px; border-top: 1px solid #e2e8f0; margin-top: 0; }
`,
  },
  kompakt: {
    id: 'kompakt',
    name: 'Kompakt',
    cssOverrides: () => `
  body { background: #f7f5f2; padding: 32px; font-family: Georgia, 'Times New Roman', serif; }
  .page { background: #fefcf7; box-shadow: 0 4px 32px rgba(0,0,0,0.06); padding: 0; max-width: 540px; margin: 0 auto; }
  .header { padding: 36px 36px 16px; margin-bottom: 0; text-align: center; }
  .header .brand-logo { color: #2d2d2d; font-size: 22pt; font-weight: 400; letter-spacing: 2px; text-transform: uppercase; }
  .header .brand-logo svg { fill: #2d2d2d; width: 36px; height: 36px; }
  .header .brand-address { color: #8a8a8a; font-size: 7pt; margin-top: 2px; letter-spacing: 0.3px; }
  .header .company-info { color: #5a5a5a; font-size: 7pt; line-height: 1.6; }
  .header .company-info div:first-child { color: #2d2d2d; font-weight: 700; font-size: 8pt; }
  .recipient { padding: 4px 36px 8px; margin-bottom: 0; }
  .recipient > div:first-child { font-size: 9pt; color: #2d2d2d; }
  .invoice-title { margin: 0 36px 20px; padding-bottom: 14px; border-bottom: 1px solid #d4d0c8; color: #2d2d2d; font-size: 18pt; font-weight: 400; letter-spacing: 0.5px; text-align: center; }
  .meta-grid { padding: 8px 36px 16px; margin-bottom: 16px; gap: 32px; justify-content: center; }
  .meta-label { color: #8a8a8a; font-weight: 400; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1px; }
  .meta-value { font-weight: 600; font-size: 7.5pt; color: #2d2d2d; }
  .items-table { margin: 0 36px 14px; width: calc(100% - 72px); }
  .items-table th { border-bottom: none; padding: 8px 6px; font-size: 7pt; letter-spacing: 0.5px; text-transform: uppercase; color: #8a8a8a; font-weight: 400; }
  .items-table td { padding: 10px 6px; border-bottom: 1px solid #ece8e0; font-size: 8pt; color: #2d2d2d; }
  .items-table tbody tr:last-child td { border-bottom: none; }
  .summary-table { margin: 0 36px 20px; }
  .summary-table td { padding: 6px 0; border-bottom: 1px solid #ece8e0; }
  .summary-table tr:last-child td { border-bottom: 2px solid #2d2d2d; color: #2d2d2d; font-weight: 700; font-size: 11pt; }
  .footer { padding: 16px 36px 30px; border-top: 1px solid #d4d0c8; margin-top: 0; text-align: center; font-size: 7pt; color: #8a8a8a; }
`,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    cssOverrides: () => `
  body { background: #0f172a; padding: 24px; }
  .page { background: #1e293b; border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.4); padding: 0; overflow: hidden; }
  .header { background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px 40px 18px; margin-bottom: 0; border-bottom: 1px solid rgba(52,211,153,0.2); }
  .header .brand-logo { color: #34d399; font-size: 17pt; font-weight: 700; }
  .header .brand-logo svg { fill: #34d399; width: 32px; height: 32px; }
  .header .brand-address { color: rgba(255,255,255,0.3); font-size: 7pt; margin-top: 3px; }
  .header .company-info { color: rgba(255,255,255,0.5); font-size: 7pt; line-height: 1.6; text-align: right; }
  .header .company-info div:first-child { color: #34d399; font-weight: 700; font-size: 8pt; }
  .recipient { padding: 20px 40px 6px; margin-bottom: 0; }
  .recipient > div:first-child { font-size: 9pt; color: rgba(255,255,255,0.9); }
  .invoice-title { margin: 0 40px 16px; padding-bottom: 10px; color: #34d399; font-size: 18pt; font-weight: 800; letter-spacing: -0.5px; }
  .meta-grid { padding: 12px 40px; margin: 0 40px 18px; background: rgba(255,255,255,0.03); border-radius: 8px; gap: 32px; }
  .meta-label { color: rgba(255,255,255,0.35); font-weight: 600; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-value { color: rgba(255,255,255,0.85); font-weight: 500; font-size: 7.5pt; }
  .items-table { margin: 0 40px 14px; width: calc(100% - 80px); }
  .items-table th { background: rgba(52,211,153,0.1); color: #34d399; border-bottom: none; padding: 10px 8px; font-size: 7pt; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600; }
  .items-table td { padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
  .items-table tbody tr:last-child td { border-bottom: 1px solid rgba(52,211,153,0.3); }
  .summary-table { margin: 0 40px 20px; }
  .summary-table td { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }
  .summary-table tr:last-child td { border-top: 2px solid #34d399; border-bottom: none; color: #34d399; font-weight: 700; font-size: 11pt; }
  .footer { padding: 14px 40px 28px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 0; color: rgba(255,255,255,0.3); font-size: 7pt; }
`,
  },
};

export type TemplateId = keyof typeof TEMPLATES;
