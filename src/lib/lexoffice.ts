import { calculateRevenue } from './calculations';

const LEXOFFICE_BASE = 'https://api.lexware.io/v1';

function parseRevenue(val: unknown): number {
  return (typeof val === 'number' || typeof val === 'string') ? calculateRevenue(val) : 0;
}

function toIsoDate(datum: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) return `${datum}T00:00:00.000+01:00`;
  const p = datum.split('.');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00.000+01:00`;
  return new Date().toISOString().slice(0, 10) + 'T00:00:00.000+01:00';
}

export async function testLexofficeConnection(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${LEXOFFICE_BASE}/profile`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function pushInvoiceToLexoffice(
  assignment: any,
  apiKey: string,
  taxRate = 19,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const revenue = parseRevenue(assignment.umsatz);
  const hours = parseFloat(String(assignment.stunden)) || 0;
  const unitPrice = hours > 0 ? revenue / hours : revenue;

  const body = {
    voucherDate: toIsoDate(String(assignment.datum || '')),
    address: { name: String(assignment.kunde || 'Unbekannt'), countryCode: 'DE' },
    lineItems: [{
      type: 'custom',
      name: String(assignment.projekt || 'Dienstleistung'),
      quantity: hours > 0 ? parseFloat(hours.toFixed(2)) : 1,
      unitName: hours > 0 ? 'Stunden' : 'Pauschal',
      unitPrice: {
        currency: 'EUR',
        netAmount: parseFloat(unitPrice.toFixed(2)),
        taxRatePercentage: taxRate,
      },
      discountPercentage: 0,
    }],
    totalPrice: { currency: 'EUR' },
    taxConditions: { taxType: 'net' },
    shippingConditions: {
      shippingDate: toIsoDate(String(assignment.datum || '')),
      shippingType: 'service',
    },
    paymentConditions: { paymentTermLabel: '14 Tage ohne Abzug', paymentTermDuration: 14 },
    title: 'Rechnung',
    voucherStatus: 'draft',
  };

  try {
    const res = await fetch(`${LEXOFFICE_BASE}/invoices?finalize=false`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, id: data.id };
    return { ok: false, error: data.IssueList?.[0]?.i18nMessage || data.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function checkLexofficeInvoicePaid(
  externalId: string,
  apiKey: string,
): Promise<{ ok: boolean; paid: boolean; error?: string }> {
  try {
    const res = await fetch(`${LEXOFFICE_BASE}/invoices/${externalId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, paid: false, error: data.message || `HTTP ${res.status}` };
    return { ok: true, paid: data.voucherStatus === 'paidoff' };
  } catch (e: any) {
    return { ok: false, paid: false, error: e.message };
  }
}
