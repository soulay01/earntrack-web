// 5 Rechnungsdesigns als CSS-Overrides über das gemeinsame HTML-Gerüst in
// generateInvoiceHTML/generateEstimateHTML. IDs bleiben stabil (in Firestore
// pro Firma gespeichert + Plan-Gating), nur Name/Optik/Beschreibung ändern sich.
// Nur Hex-Farben verwenden – html2canvas (PDF-Export) kann kein oklch parsen.
export const TEMPLATES = {
  standard: {
    id: 'standard',
    name: 'Swiss',
    description: 'Schwarz-weiß, viel Weißraum, große markante Typografie und feine Linien – zeitlos und maximal seriös, im Stil klassischer Schweizer Gestaltung.',
    cssOverrides: () => `
  body { background:#fff; padding:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#111; font-size:8.5pt; line-height:1.45; }
  .page { padding:16mm 15mm 12mm; }
  .header { margin-bottom:14mm; align-items:flex-start; }
  .brand-logo { font-size:12pt; font-weight:700; letter-spacing:-0.2px; color:#000; }
  .brand-logo svg { fill:#000; }
  .brand-address { display:none; }
  .company-info { font-size:7pt; color:#555; line-height:1.7; text-align:right; }
  .company-info div:first-child { font-weight:700; color:#000; text-transform:uppercase; letter-spacing:0.8px; font-size:7.5pt; }
  .recipient { float:left; width:52%; margin-bottom:0; font-size:9pt; line-height:1.5; }
  .meta-grid { float:right; width:42%; display:block; margin-bottom:0; font-size:7.5pt; }
  .meta-col { width:100%; }
  .meta-row { padding:2px 0; border-bottom:1px solid #ececec; }
  .meta-row:last-child { border-bottom:none; }
  .meta-label { text-transform:uppercase; font-size:6pt; letter-spacing:1.2px; color:#888; }
  .meta-value { color:#000; font-weight:600; }
  .invoice-title { clear:both; font-size:26pt; font-weight:800; letter-spacing:-1px; color:#000; padding-top:12mm; margin-bottom:7mm; }
  .items-table { font-size:8pt; margin-bottom:8mm; }
  .items-table th { border-bottom:2px solid #000; border-top:none; text-transform:uppercase; font-size:6.5pt; letter-spacing:1px; color:#000; padding:7px 4px; }
  .items-table td { border-bottom:1px solid #e4e4e4; padding:9px 4px; }
  .items-table tbody tr:last-child td { border-bottom:1px solid #e4e4e4; }
  .summary-table { width:230px; font-size:8.5pt; margin-bottom:14mm; }
  .summary-table td { border-bottom:none; padding:4px 0; color:#555; }
  .summary-table tr:last-child td { border-top:2px solid #000; color:#000; font-weight:700; font-size:10.5pt; padding-top:7px; }
  .footer { border-top:1px solid #000; padding-top:4mm; margin-top:6mm; font-size:7pt; color:#555; line-height:1.6; }
  .footer strong { color:#000; }
`,
  },
  professional: {
    id: 'professional',
    name: 'Klassik',
    description: 'Serifenschrift, zentrierter Briefkopf mit doppelter Trennlinie – die traditionelle Kanzlei- und Steuerberater-Optik. Wirkt etabliert und vertrauenswürdig.',
    cssOverrides: () => `
  body { background:#fff; padding:0; font-family:Georgia,'Times New Roman',serif; color:#2b2b2b; font-size:8.5pt; line-height:1.5; }
  .page { padding:14mm 17mm 12mm; }
  .header { display:block; text-align:center; border-bottom:3px double #2b2b2b; padding-bottom:6mm; margin-bottom:10mm; }
  .brand-logo { display:flex; flex-direction:column; align-items:center; gap:5px; font-size:15pt; font-weight:400; letter-spacing:3px; text-transform:uppercase; color:#1a1a1a; }
  .brand-logo svg { fill:#1a1a1a; }
  .brand-logo img { margin-right:0 !important; }
  .brand-address { text-align:center; color:#777; font-size:7.5pt; letter-spacing:0.5px; margin-top:3px; }
  .company-info { display:none; }
  .recipient { float:left; width:52%; margin-bottom:0; font-size:9pt; line-height:1.55; }
  .meta-grid { float:right; width:42%; display:block; margin-bottom:0; font-size:8pt; }
  .meta-col { width:100%; }
  .meta-row { padding:1.5px 0; }
  .meta-label { color:#8a8a8a; font-style:italic; }
  .meta-value { color:#1a1a1a; font-weight:700; }
  .invoice-title { clear:both; font-size:17pt; font-weight:400; letter-spacing:2px; color:#1a1a1a; padding-top:11mm; margin-bottom:6mm; }
  .items-table { font-size:8pt; margin-bottom:8mm; }
  .items-table th { border-top:1px solid #2b2b2b; border-bottom:1px solid #2b2b2b; font-size:7.5pt; font-weight:700; letter-spacing:0.5px; color:#1a1a1a; padding:7px 5px; }
  .items-table td { border-bottom:1px solid #ddd8d0; padding:9px 5px; }
  .items-table tbody tr:last-child td { border-bottom:1px solid #ddd8d0; }
  .summary-table { width:240px; font-size:8.5pt; margin-bottom:12mm; }
  .summary-table td { border-bottom:1px solid #e8e3da; padding:5px 0; }
  .summary-table tr:last-child td { border-top:3px double #2b2b2b; border-bottom:none; color:#1a1a1a; font-weight:700; font-size:10.5pt; padding-top:7px; }
  .footer { border-top:1px solid #c9c2b6; padding-top:4mm; margin-top:6mm; text-align:center; font-size:7.5pt; color:#6f6a60; line-height:1.7; }
  .footer strong { color:#2b2b2b; }
  .footer > div:last-child { margin-top:5px; }
`,
  },
  modern: {
    id: 'modern',
    name: 'Business',
    description: 'Dunkelblauer Kopfbalken über volle Breite, farbiger Tabellenkopf, Meta-Daten in einer Infobox. Klare Corporate-Optik für den professionellen B2B-Auftritt.',
    cssOverrides: () => `
  body { background:#fff; padding:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#26313a; font-size:8.5pt; line-height:1.45; }
  .page { padding:0 0 10mm; }
  .header { background:#16324f; color:#fff; padding:9mm 14mm; margin-bottom:9mm; align-items:center; }
  .brand-logo { color:#fff; font-size:13pt; font-weight:700; }
  .brand-logo svg { fill:#fff; }
  .brand-logo img { background:#fff; border:none !important; border-radius:6px !important; padding:6px 10px !important; }
  .brand-address { color:rgba(255,255,255,0.65); }
  .company-info { color:rgba(255,255,255,0.75); line-height:1.6; }
  .company-info div:first-child { color:#fff; font-weight:700; font-size:8pt; }
  .recipient { margin:0 14mm 7mm; font-size:9pt; line-height:1.5; }
  .meta-grid { margin:0 14mm 8mm; background:#f2f5f8; border-left:3px solid #16324f; padding:4mm 5mm; gap:36px; font-size:7.5pt; }
  .meta-label { color:#5b6b7a; }
  .meta-value { color:#16324f; font-weight:700; }
  .invoice-title { margin:0 14mm 5mm; color:#16324f; font-size:17pt; font-weight:800; letter-spacing:-0.3px; }
  .items-table { margin:0 14mm 8mm; width:calc(100% - 28mm); font-size:8pt; }
  .items-table th { background:#16324f; color:#fff; border-bottom:none; padding:8px 6px; font-size:7pt; letter-spacing:0.5px; text-transform:uppercase; }
  .items-table td { padding:8px 6px; border-bottom:1px solid #e3e9ee; }
  .items-table tbody tr:nth-child(even) td { background:#f7fafc; }
  .items-table tbody tr:last-child td { border-bottom:2px solid #16324f; }
  .summary-table { width:240px; margin-left:auto; margin-right:14mm; margin-bottom:10mm; font-size:8.5pt; }
  .summary-table td { padding:5px 0; border-bottom:1px solid #e3e9ee; }
  .summary-table tr:last-child td { border-top:2px solid #16324f; border-bottom:none; color:#16324f; font-weight:800; font-size:10.5pt; padding-top:7px; }
  .footer { margin:0 14mm; border-top:3px solid #16324f; padding-top:4mm; font-size:7pt; color:#5b6b7a; line-height:1.6; }
  .footer strong { color:#16324f; }
`,
  },
  kompakt: {
    id: 'kompakt',
    name: 'Akzent',
    description: 'Schmale Akzentleiste in Petrol, Meta-Daten in einer sanft getönten Box, dezente Farbakzente in Tabellenkopf und Endsumme. Frisch und modern, ohne laut zu sein.',
    cssOverrides: () => `
  body { background:#fff; padding:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#1f2937; font-size:8.5pt; line-height:1.45; }
  .page { border-left:5px solid #0f766e; padding:14mm 15mm 12mm 16mm; }
  .header { margin-bottom:10mm; align-items:flex-start; }
  .brand-logo { font-size:12.5pt; font-weight:700; color:#0f172a; }
  .brand-logo svg { fill:#0f766e; }
  .brand-logo img { height:48px !important; }
  .brand-address { color:#64748b; margin-top:3px; }
  .company-info { font-size:7pt; color:#64748b; line-height:1.7; }
  .company-info div:first-child { color:#0f766e; font-weight:700; font-size:8pt; }
  .recipient { float:left; width:50%; margin-bottom:0; font-size:9pt; line-height:1.5; }
  .meta-grid { float:right; width:44%; display:block; margin-bottom:0; background:#f0fdfa; border-radius:8px; padding:4mm 5mm; font-size:7.5pt; }
  .meta-col { width:100%; }
  .meta-row { padding:1.5px 0; }
  .meta-label { text-transform:uppercase; font-size:6pt; letter-spacing:0.8px; color:#0f766e; font-weight:600; }
  .meta-value { color:#0f172a; font-weight:600; }
  .invoice-title { clear:both; font-size:19pt; font-weight:800; color:#0f172a; letter-spacing:-0.5px; padding-top:11mm; margin-bottom:2mm; }
  .invoice-title::after { content:''; display:block; width:52px; height:3px; background:#0f766e; margin-top:6px; }
  .items-table { font-size:8pt; margin-top:6mm; margin-bottom:8mm; }
  .items-table th { border-bottom:2px solid #0f766e; text-transform:uppercase; font-size:6.5pt; letter-spacing:0.8px; color:#0f766e; font-weight:700; padding:7px 5px; }
  .items-table td { border-bottom:1px solid #e2e8f0; padding:9px 5px; }
  .items-table tbody tr:last-child td { border-bottom:1px solid #e2e8f0; }
  .summary-table { width:240px; font-size:8.5pt; margin-bottom:12mm; }
  .summary-table td { border-bottom:none; padding:4px 0; color:#475569; }
  .summary-table tr:last-child td { border-top:2px solid #0f766e; color:#0f766e; font-weight:800; font-size:10.5pt; padding-top:7px; }
  .footer { border-top:1px solid #e2e8f0; padding-top:4mm; margin-top:4mm; font-size:7pt; color:#64748b; line-height:1.6; }
  .footer strong { color:#0f766e; }
`,
  },
  premium: {
    id: 'premium',
    name: 'Elegant',
    description: 'Heller Luxus-Look: schwarzer Briefkopf mit Gold-Linie, Serifentitel mit weiter Laufweite, goldene Hairlines – edel und druckfreundlich.',
    cssOverrides: () => `
  body { background:#fff; padding:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#26221b; font-size:8.5pt; line-height:1.5; }
  .page { padding:0 0 10mm; }
  .header { background:#171512; color:#fff; padding:11mm 16mm; margin-bottom:10mm; border-bottom:2px solid #b99a45; align-items:center; }
  .brand-logo { color:#fff; font-size:12.5pt; font-weight:400; letter-spacing:2.5px; text-transform:uppercase; }
  .brand-logo svg { fill:#c9ab56; }
  .brand-logo img { background:#fff; border:none !important; border-radius:4px !important; padding:6px 10px !important; }
  .brand-address { color:rgba(255,255,255,0.45); letter-spacing:0.5px; }
  .company-info { color:rgba(255,255,255,0.65); line-height:1.7; }
  .company-info div:first-child { color:#c9ab56; font-weight:600; letter-spacing:1px; font-size:8pt; }
  .recipient { margin:0 16mm 8mm; font-size:9pt; line-height:1.55; }
  .meta-grid { margin:0 16mm 9mm; border-top:1px solid #b99a45; border-bottom:1px solid #b99a45; padding:3.5mm 0; gap:40px; font-size:7.5pt; }
  .meta-label { text-transform:uppercase; font-size:6pt; letter-spacing:1.2px; color:#a08536; }
  .meta-value { color:#171512; font-weight:600; }
  .invoice-title { margin:0 16mm 6mm; font-family:Georgia,'Times New Roman',serif; font-size:19pt; font-weight:400; letter-spacing:4px; text-transform:uppercase; color:#171512; }
  .items-table { margin:0 16mm 8mm; width:calc(100% - 32mm); font-size:8pt; }
  .items-table th { border-bottom:1px solid #b99a45; text-transform:uppercase; font-size:6.5pt; letter-spacing:1px; color:#a08536; font-weight:600; padding:8px 5px; }
  .items-table td { border-bottom:1px solid #eee9dd; padding:10px 5px; }
  .items-table tbody tr:last-child td { border-bottom:1px solid #eee9dd; }
  .summary-table { width:250px; margin-left:auto; margin-right:16mm; margin-bottom:12mm; font-size:8.5pt; }
  .summary-table td { border-bottom:none; padding:5px 0; color:#6d6656; }
  .summary-table tr:last-child td { border-top:2px solid #b99a45; color:#171512; font-weight:700; font-size:11pt; padding-top:8px; }
  .footer { margin:0 16mm; border-top:1px solid #b99a45; padding-top:4mm; font-size:7pt; color:#8a8272; line-height:1.7; }
  .footer strong { color:#171512; letter-spacing:0.5px; }
`,
  },
};

export type TemplateId = keyof typeof TEMPLATES;
