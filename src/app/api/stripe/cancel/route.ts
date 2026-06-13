import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import admin from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

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
    if (company.subscriptionStatus !== 'active') {
      return NextResponse.json({ error: 'Kein aktives Abo gefunden' }, { status: 400 });
    }

    const subscriptionId = company.stripeSubscriptionId;

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

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 1. ZUERST Firestore-Transaktion: lokalen Status sichern, bevor Stripe kontaktiert wird
    try {
      await db.runTransaction(async (transaction) => {
        const companyRef = db.collection('companies').doc(companyId);
        const snap = await transaction.get(companyRef);
        if (!snap.exists) throw new Error('Company not found');

        const currentStatus = snap.data()?.subscriptionStatus;
        if (currentStatus !== 'active') {
          console.warn('Company status is already:', currentStatus);
          return;
        }

        const updateData: Record<string, any> = {
          subscriptionStatus: 'cancelled',
          dataCleanupAt: Timestamp.fromDate(sevenDaysFromNow),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (couponId) updateData.retentionCouponId = couponId;
        transaction.update(companyRef, updateData);
      });
    } catch (txErr) {
      console.error('Firestore-Transaktion fehlgeschlagen – Kündigung abgebrochen:', txErr);
      return NextResponse.json({
        error: 'Fehler beim Speichern des Kündigungsstatus. Bitte versuche es erneut.',
      }, { status: 500 });
    }

    // 2. DANACH Stripe-Cancel (Firestore-Status ist bereits gesichert)
    if (subscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(subscriptionId, {
          prorate: true,
          invoice_now: false,
        });
      } catch (stripeErr: any) {
        if (stripeErr.type === 'StripeInvalidRequestError' && stripeErr.message?.includes('No such subscription')) {
          console.warn('Stripe subscription already deleted, local cancellation already saved');
        } else {
          // Firestore-Status ist bereits 'cancelled' – Stripe-Cancel hat nicht geklappt
          // Das ist der bessere Zustand als umgekehrt, aber wir loggen es
          console.error('Stripe cancel failed after local save – manual review needed:', stripeErr);
          await db.collection('companies').doc(companyId).update({
            _stripeCancelFailedAt: FieldValue.serverTimestamp(),
            _stripeCancelError: stripeErr.message || 'Unknown error',
          }).catch(e => console.warn('Could not log Stripe cancel failure:', e));
        }
      }
    }

    if (company.stripeCustomerId) {
      try {
        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', company.stripeCustomerId)
          .get();
        const paymentBatch = db.batch();
        paymentsSnap.forEach(doc => {
          paymentBatch.update(doc.ref, {
            status: 'canceled',
            canceledAt: FieldValue.serverTimestamp(),
          });
        });
        await paymentBatch.commit();
      } catch (e) {
        console.warn('payment_requests status update failed:', e);
      }
    }

    return NextResponse.json({ success: true, couponId });
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    const msg = err.type === 'StripeInvalidRequestError'
      ? 'Fehler bei der Stripe-Kündigung'
      : err.message || 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
