import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET() {
  try {
    const isTestMode = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === 'true';
    if (!isTestMode) {
      return NextResponse.json({ error: 'Nur im Testmodus' }, { status: 403 });
    }

    // Find first company with active subscription in test mode
    const companies = await admin.db.collection('companies')
      .where('subscriptionStatus', '==', 'active')
      .limit(1)
      .get();

    if (companies.empty) {
      return NextResponse.json({ message: 'Keine aktiven Subscriptions gefunden' });
    }

    const doc = companies.docs[0];
    await admin.db.collection('companies').doc(doc.id).update({
      subscriptionStatus: 'expired',
      subscriptionPlan: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      excessCleanupAt: null,
      excessDataTypes: null,
      excessOldPlan: null,
      excessCount: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      companyId: doc.id,
      previousPlan: doc.data().subscriptionPlan,
    });
  } catch (err: any) {
    console.error('Reset error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
