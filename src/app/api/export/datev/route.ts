import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { generateDatevBuchungsstapel, generateDatevFilename } from '@/lib/datev';
import { getFeatureFlag } from '@/lib/plans';

// DATEV-Export serverseitig statt clientseitig: der Plan-Check und die Rohdaten kommen
// beide aus dem Admin-SDK, damit der Export nicht per Browser-Konsole umgangen werden kann
// (der Client kennt weder den echten Plan-Stand vertrauenswürdig noch bekommt er die Daten
// anders als über diesen Weg — das reine UI-Gating davor bleibt zusätzlich als schnelles Feedback).
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await admin.auth.verifyIdToken(authHeader);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { taxRate = 19, skr = '04' } = await req.json().catch(() => ({}));
    if (skr !== '03' && skr !== '04') {
      return NextResponse.json({ error: 'Ungültiger SKR' }, { status: 400 });
    }

    const db = admin.db;
    const userSnap = await db.collection('users').doc(uid).get();
    const companyId = userSnap.exists ? (userSnap.data()?.companyId || uid) : uid;

    const companySnap = await db.collection('companies').doc(companyId).get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: 'Firma nicht gefunden' }, { status: 404 });
    }
    const company = companySnap.data() || {};

    if (!getFeatureFlag(company.subscriptionPlan, 'datevExport')) {
      return NextResponse.json({ error: 'DATEV-Export ist im Solo-Plan nicht enthalten.' }, { status: 403 });
    }

    const [assignmentsSnap, customersSnap] = await Promise.all([
      db.collection('assignments').where('companyId', '==', companyId).limit(2000).get(),
      db.collection('customers').where('companyId', '==', companyId).limit(2000).get(),
    ]);
    const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const companyName = company.companyName || company.name || '';
    const csv = generateDatevBuchungsstapel(assignments, companyName, Number(taxRate), skr, customers);
    const invoiceCount = assignments.filter((a: any) => parseFloat(String(a.umsatz ?? '').replace(/[€\s]/g, '')) > 0).length;
    const filename = generateDatevFilename(invoiceCount, skr);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('DATEV export error:', err);
    return NextResponse.json({ error: 'DATEV-Export fehlgeschlagen' }, { status: 500 });
  }
}
