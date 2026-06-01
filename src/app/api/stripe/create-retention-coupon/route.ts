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
    if (company.subscriptionStatus !== 'cancelled' && company.subscriptionStatus !== 'expired') {
      return NextResponse.json({ error: 'Nur für gekündigte Abos' }, { status: 400 });
    }

    if (company.retentionCouponId && company.retentionCouponId !== 'pending') {
      return NextResponse.json({ couponId: company.retentionCouponId });
    }

    const stripe = getStripe();
    const email = decodedToken.email || '';
    const coupon = await stripe.coupons.create({
      name: `15% Rabatt – ${email}`,
      percent_off: 15,
      duration: 'repeating',
      duration_in_months: 3,
      max_redemptions: 1,
    });

    await db.collection('companies').doc(companyId).update({
      retentionCouponId: coupon.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ couponId: coupon.id });
  } catch (err: any) {
    console.error('Create retention coupon error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
