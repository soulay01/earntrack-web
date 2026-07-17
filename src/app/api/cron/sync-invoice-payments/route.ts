import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { runInvoicePaymentSync } from '@/lib/invoicePaymentSync';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runInvoicePaymentSync(admin.db);
    console.log('[sync-invoice-payments]', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[sync-invoice-payments] failed:', e);
    return NextResponse.json({ ok: false, error: e.message || 'Internal error' }, { status: 500 });
  }
}
