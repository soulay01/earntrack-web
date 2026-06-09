import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getPriceIds } from '@/lib/plans';
import admin from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.earntrack.de';
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);

    let decodedToken;
    try {
      decodedToken = await admin.auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Verify owner role
    const userDoc = await admin.db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { priceId, planId, planName, couponId } = await req.json();
    if (!priceId && !planId) {
      return NextResponse.json({ error: 'Kein Plan ausgewählt' }, { status: 400 });
    }
    if (planId && getPriceIds()[planId] && getPriceIds()[planId] !== priceId) {
      return NextResponse.json({ error: 'Ungültige Preis-ID für diesen Plan' }, { status: 400 });
    }

    // Block purchase if user already has an active subscription
    const companyId = userDoc.data()?.companyId || decodedToken.uid;
    const companyDoc = await admin.db.collection('companies').doc(companyId).get();
    if (companyDoc.exists) {
      const company = companyDoc.data()!;
      if (company.subscriptionStatus === 'active') {
        return NextResponse.json({ error: 'Du hast bereits ein aktives Abo. Kündige zuerst, um den Plan zu wechseln.' }, { status: 400 });
      }
    }

    const stripe = getStripe();

    const sessionParams: any = {
      mode: 'subscription',
      customer_email: decodedToken.email || '',
      client_reference_id: decodedToken.uid,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { uid: decodedToken.uid, plan: planId || planName || 'unknown' },
      success_url: `${origin}/settings/subscription?success=true`,
      cancel_url: `${origin}/settings/subscription?canceled=true`,
      locale: 'de',
    };
    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url, checkoutUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
