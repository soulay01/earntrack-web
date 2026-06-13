import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET() {
  try {
    const isTestMode = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === 'true';
    if (!isTestMode) {
      return NextResponse.json({ error: 'Nur im Testmodus' }, { status: 403 });
    }

    // Reset ALL companies that have an active/cancelled/trialing subscription
    const companies = await admin.db.collection('companies')
      .where('subscriptionStatus', 'in', ['active', 'cancelled', 'trialing', 'past_due', 'paused'])
      .get();

    let count = 0;
    for (const doc of companies.docs) {
      await admin.db.collection('companies').doc(doc.id).update({
        subscriptionStatus: 'expired',
        subscriptionPlan: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt: null,
        excessCleanupAt: null,
        excessDataTypes: null,
        excessOldPlan: null,
        excessCount: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
    }

    return NextResponse.json({
      success: true,
      companiesReset: count,
    });
  } catch (err: any) {
    console.error('Reset error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
