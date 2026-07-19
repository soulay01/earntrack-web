import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await admin.auth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    // Allow in test mode OR for admin users in production
    const isTestMode = process.env.STRIPE_TEST_MODE === 'true';
    const isAdminUser = ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || '');
    if (!isTestMode && !isAdminUser) {
      return NextResponse.json({ error: 'Test-Modus ist nicht aktiviert' }, { status: 403 });
    }

    // Verify owner role
    const userDoc = await admin.db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const reset = body.reset;
    const plan = ['solo', 'team', 'business'].includes(body.plan) ? body.plan : null;

    const companyId = userDoc.data()?.companyId || uid;

    if (reset) {
      await admin.db.collection('companies').doc(companyId).set({
        subscriptionPlan: null,
        subscriptionStatus: 'expired',
        trialEndsAt: null,
        excessCleanupAt: null,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } else {
      await admin.db.collection('companies').doc(companyId).set({
        subscriptionStatus: 'active',
        ...(plan ? { subscriptionPlan: plan } : {}),
        trialEndsAt: null,
        excessCleanupAt: null,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Test activate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
