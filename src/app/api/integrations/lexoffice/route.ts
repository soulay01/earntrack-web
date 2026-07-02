import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { testLexofficeConnection, pushInvoiceToLexoffice } from '@/lib/lexoffice';

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const decoded = await admin.auth.verifyIdToken(authHeader.slice(7));
    const userDoc = await admin.db.collection('users').doc(decoded.uid).get();
    const companyId = userDoc.data()?.companyId || decoded.uid;

    const companyDoc = await admin.db.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const secretsDoc = await admin.db.collection('companies').doc(companyId).collection('private').doc('integrations').get();
    const savedApiKey: string | undefined = secretsDoc.data()?.lexofficeApiKey;

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (body.action === 'test') {
      const keyToTest: string = body.keyOverride || savedApiKey || '';
      if (!keyToTest) return NextResponse.json({ ok: false, error: 'Kein API-Key angegeben' });
      const result = await testLexofficeConnection(keyToTest);
      return NextResponse.json(result);
    }

    const apiKey = savedApiKey;
    if (!apiKey) return NextResponse.json({ error: 'Kein Lexoffice API-Key konfiguriert. Bitte unter Einstellungen → Integrationen hinterlegen.' }, { status: 400 });

    if (body.action === 'push') {
      const invoiceSnap = await admin.db.collection('companies').doc(companyId).collection('settings').doc('invoice').get();
      const taxRate = parseFloat(invoiceSnap.data()?.taxRate) || 19;
      const result = await pushInvoiceToLexoffice(body.assignment, apiKey, taxRate);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
