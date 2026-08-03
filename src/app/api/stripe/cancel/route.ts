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

    const companyRef = db.collection('companies').doc(companyId);
    const sevenDaysFromNow = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    /**
     * Sofortige Kündigung: nur für Abos ohne laufende Stripe-Subscription
     * (z. B. per Admin freigeschaltet). Hier gibt es keine bereits bezahlte
     * Restlaufzeit, die zu wahren wäre — die Export-Frist startet sofort.
     */
    async function cancelImmediately() {
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(companyRef);
        if (!snap.exists) throw new Error('Company not found');
        if (snap.data()?.subscriptionStatus !== 'active') return;

        const updateData: Record<string, any> = {
          subscriptionStatus: 'cancelled',
          dataCleanupAt: Timestamp.fromDate(sevenDaysFromNow()),
          cancelAtPeriodEnd: FieldValue.delete(),
          subscriptionEndsAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (couponId) updateData.retentionCouponId = couponId;
        transaction.update(companyRef, updateData);
      });
    }

    if (!subscriptionId) {
      try {
        await cancelImmediately();
      } catch (txErr) {
        console.error('Firestore-Transaktion fehlgeschlagen – Kündigung abgebrochen:', txErr);
        return NextResponse.json({
          error: 'Fehler beim Speichern des Kündigungsstatus. Bitte versuche es erneut.',
        }, { status: 500 });
      }
      return NextResponse.json({ success: true, couponId, endsAt: null, immediate: true });
    }

    // Laufendes Stripe-Abo: zum Ende des bezahlten Zeitraums kündigen, nicht
    // sofort. AGB § 6 sichert Zugriff "bis zum Ende des aktuellen Abrechnungs-
    // zeitraums" zu — eine sofortige Kündigung nähme dem Kunden bezahlte Zeit.
    //
    // Reihenfolge bewusst Stripe zuerst: Scheitert danach der Firestore-Schreib-
    // vorgang, bleibt der Zustand trotzdem heilbar — Stripe beendet zum Perioden-
    // ende und der deleted-Webhook trägt Status und Löschfrist nach. Umgekehrt
    // hieße ein Stripe-Fehler: lokal gekündigt, aber weiter abgerechnet.
    let periodEnd: number | null = null;
    try {
      const stripe = getStripe();
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      // Stripe setzt `cancel_at` beim Vormerken auf das Periodenende. Ab
      // SDK 22 liegt `current_period_end` nur noch auf den Items, deshalb
      // dient das erste Item als Rückfallebene.
      periodEnd = typeof updated.cancel_at === 'number'
        ? updated.cancel_at
        : updated.items?.data?.[0]?.current_period_end ?? null;
    } catch (stripeErr: any) {
      const alreadyGone = stripeErr.type === 'StripeInvalidRequestError'
        && stripeErr.message?.includes('No such subscription');
      if (!alreadyGone) {
        console.error('Stripe cancel_at_period_end failed:', stripeErr);
        return NextResponse.json({
          error: 'Die Kündigung konnte nicht vorgemerkt werden. Bitte versuche es erneut.',
        }, { status: 502 });
      }
      console.warn('Stripe subscription already gone – cancelling locally');
      try {
        await cancelImmediately();
      } catch (txErr) {
        console.error('Local fallback cancellation failed:', txErr);
        return NextResponse.json({
          error: 'Fehler beim Speichern des Kündigungsstatus. Bitte versuche es erneut.',
        }, { status: 500 });
      }
      return NextResponse.json({ success: true, couponId, endsAt: null, immediate: true });
    }

    // Status bleibt bewusst 'active': der Kunde arbeitet bis zum Periodenende
    // normal weiter. Erst der deleted-Webhook schaltet auf 'cancelled' und
    // startet damit die 7-tägige Export-Frist.
    try {
      await companyRef.update({
        cancelAtPeriodEnd: true,
        subscriptionEndsAt: periodEnd
          ? Timestamp.fromMillis(periodEnd * 1000)
          : FieldValue.delete(),
        ...(couponId ? { retentionCouponId: couponId } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (dbErr) {
      // Unkritisch: Stripe kennt die Kündigung, der Webhook zieht nach.
      console.error('Could not persist cancelAtPeriodEnd (Stripe already scheduled):', dbErr);
    }

    // payment_requests werden bewusst NICHT hier auf 'canceled' gesetzt: das
    // Abo läuft bis zum Periodenende weiter. Der deleted-Webhook erledigt das
    // zum tatsächlichen Vertragsende.
    return NextResponse.json({
      success: true,
      couponId,
      endsAt: periodEnd ? periodEnd * 1000 : null,
      immediate: false,
    });
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    const msg = err.type === 'StripeInvalidRequestError'
      ? 'Fehler bei der Stripe-Kündigung'
      : err.message || 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
