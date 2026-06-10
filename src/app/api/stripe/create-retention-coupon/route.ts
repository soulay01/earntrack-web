import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import admin from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  try {
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

    const uid = decodedToken.uid;
    const db = admin.db;

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

    const companyRef = db.collection('companies').doc(companyId);

    // Atomisch prüfen – verhindert Race-Conditions
    const existingCoupon = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(companyRef);
      if (!snap.exists) throw new Error('Company not found');
      const existing = snap.data()?.retentionCouponId;
      if (existing && existing !== 'pending') {
        return existing; // Bereits existierender Coupon – wiederverwenden
      }
      return null; // Neuen Coupon erstellen
    });

    if (existingCoupon) {
      return NextResponse.json({ couponId: existingCoupon });
    }

    // Create Stripe coupon
    const stripe = getStripe();
    const email = decodedToken.email || '';
    const coupon = await stripe.coupons.create({
      name: `15% Rabatt – ${email}`,
      percent_off: 15,
      duration: 'repeating',
      duration_in_months: 3,
      max_redemptions: 1,
    });

    // Zweite Transaktion: stellt sicher, dass kein anderer Request bereits geschrieben hat
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(companyRef);
      const existing = snap.data()?.retentionCouponId;
      if (existing && existing !== 'pending') {
        // Ein anderer Request hat bereits einen Coupon gespeichert – Stripe-Coupon bleibt als Orphan
        return;
      }
      transaction.update(companyRef, {
        retentionCouponId: coupon.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ couponId: coupon.id });
  } catch (err: any) {
    console.error('Create retention coupon error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
