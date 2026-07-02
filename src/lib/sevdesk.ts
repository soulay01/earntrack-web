import { calculateRevenue } from './calculations';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

function parseRevenue(val: unknown): number {
  return (typeof val === 'number' || typeof val === 'string') ? calculateRevenue(val) : 0;
}

function toSevdeskDate(datum: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) return `${datum}T00:00:00+0100`;
  const p = datum.split('.');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00+0100`;
  return new Date().toISOString().slice(0, 10) + 'T00:00:00+0100';
}

async function getSevUser(apiKey: string): Promise<{ userId: string; sevClientId: string } | null> {
  const res = await fetch(`${SEVDESK_BASE}/SevUser`, {
    headers: { Authorization: apiKey },
  });
  const data = await res.json().catch(() => null);
  const user = data?.objects?.[0];
  if (!user) return null;
  return { userId: String(user.id), sevClientId: String(user.sevClient?.id) };
}

export async function testSevdeskConnection(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SEVDESK_BASE}/SevUser`, {
      headers: { Authorization: apiKey },
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.objects?.length > 0) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Ungültiger API-Token' };
    return { ok: false, error: data?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function pushInvoiceToSevdesk(
  assignment: any,
  apiKey: string,
  taxRate = 19,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const revenue = parseRevenue(assignment.umsatz);
  const hours = parseFloat(String(assignment.stunden)) || 0;
  const unitPrice = hours > 0 ? revenue / hours : revenue;

  let userInfo: { userId: string; sevClientId: string };
  try {
    const info = await getSevUser(apiKey);
    if (!info) return { ok: false, error: 'Kein SevDesk-Nutzer gefunden' };
    userInfo = info;
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const body = {
    invoice: {
      objectName: 'Invoice',
      mapAll: 'true',
      invoiceType: 'RE',
      invoiceDate: toSevdeskDate(String(assignment.datum || '')),
      header: String(assignment.projekt || 'Rechnung'),
      discount: 0,
      discountAdditive: false,
      currency: 'EUR',
      status: '100',
      taxRate: taxRate,
      taxText: `Umsatzsteuer ${taxRate}%`,
      taxType: 'default',
      // No contact — invoice is created without linked contact (Laufkundschaft)
      // Customer name stored in customerInternalNote for reference
      contactPerson: { objectName: 'SevUser', id: userInfo.userId },
      sevClient: { objectName: 'SevClient', id: userInfo.sevClientId },
      customerInternalNote: String(assignment.kunde || ''),
      addressName: String(assignment.kunde || ''),
    },
    invoicePosSave: [{
      objectName: 'InvoicePos',
      mapAll: 'true',
      name: String(assignment.projekt || 'Dienstleistung'),
      quantity: hours > 0 ? parseFloat(hours.toFixed(2)) : 1,
      price: parseFloat(unitPrice.toFixed(2)),
      unity: { objectName: 'Unity', id: 1 },
      taxRate: taxRate,
      sevClient: { objectName: 'SevClient', id: userInfo.sevClientId },
    }],
    filename: `Rechnung_${assignment.id || 'unknown'}`,
  };

  try {
    const res = await fetch(`${SEVDESK_BASE}/Invoice/Factory/saveInvoice`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    // SevDesk returns the invoice either in data.objects.invoice or directly in data.invoice
    const invoiceId = data.objects?.invoice?.id ?? data.invoice?.id ?? data.objects?.id;
    if (res.ok && invoiceId) return { ok: true, id: String(invoiceId) };
    return { ok: false, error: data.message || data.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
