import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);

    const { default: admin } = await import('firebase-admin');
    const { getAuth } = await import('firebase-admin/auth');

    if (!admin.apps.length) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccount)),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      } else {
        admin.initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      }
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const companyId = userDoc.data()?.companyId || uid;
    const companyDoc = await db.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = companyDoc.data()!;
    if (company.subscriptionStatus !== 'active') {
      return NextResponse.json({ error: 'Kein aktives Abo gefunden' }, { status: 400 });
    }

    const subscriptionId = company.stripeSubscriptionId;
    if (subscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(subscriptionId, {
          prorate: true,
          invoice_now: true,
        });
      } catch (stripeErr: any) {
        if (stripeErr.type !== 'StripeInvalidRequestError') {
          throw stripeErr;
        }
      }
    }

    let couponId: string | null = null;
    const email = decodedToken.email || '';
    try {
      const stripe = getStripe();
      const coupon = await stripe.coupons.create({
        name: `15% Rabatt – ${email}`,
        percent_off: 15,
        duration: 'repeating',
        duration_in_months: 3,
        max_redemptions: 1,
      });
      couponId = coupon.id;
    } catch (e) {
      console.warn('Could not create retention coupon:', e);
    }

    const { Timestamp } = await import('firebase-admin/firestore');
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const updateData: Record<string, any> = {
      subscriptionStatus: 'cancelled',
      dataCleanupAt: Timestamp.fromDate(sevenDaysFromNow),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    updateData.retentionCouponId = couponId || 'pending';
    await db.collection('companies').doc(companyId).update(updateData);

    if (company.stripeCustomerId) {
      const paymentsSnap = await db.collection('payment_requests')
        .where('stripeCustomerId', '==', company.stripeCustomerId)
        .get();
      paymentsSnap.forEach(doc => {
        doc.ref.update({
          status: 'canceled',
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
      });
    }

    return NextResponse.json({ success: true, couponId: updateData.retentionCouponId });
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    const msg = err.type === 'StripeInvalidRequestError'
      ? 'Fehler bei der Stripe-Kündigung'
      : err.message || 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
