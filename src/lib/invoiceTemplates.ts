export const TEMPLATES = {
  standard: {
    id: 'standard',
    name: 'Standard',
    cssOverrides: () => '',
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
};

export type TemplateId = keyof typeof TEMPLATES;
