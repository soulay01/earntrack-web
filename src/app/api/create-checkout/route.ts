import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getPriceIds, PLAN_LIMITS, EXCESS_CLEANUP_MS } from '@/lib/plans';
import admin from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(`create-checkout:${ip}`, { windowMs: 60_000, max: 10 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

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

    const { priceId, planId, planName, couponId, excessEmployees } = await req.json();
    if (!priceId && !planId) {
      return NextResponse.json({ error: 'Kein Plan ausgewählt' }, { status: 400 });
    }
    const validPlans = ['solo', 'team', 'business'];
    if (planId && (!validPlans.includes(planId) || (getPriceIds()[planId] !== undefined && getPriceIds()[planId] !== priceId))) {
      return NextResponse.json({ error: 'Ungültige Preis-ID für diesen Plan' }, { status: 400 });
    }
    const knownPriceIds = Object.values(getPriceIds()).filter(Boolean);
    if (priceId && knownPriceIds.length > 0 && !knownPriceIds.includes(priceId)) {
      return NextResponse.json({ error: 'Ungültige Preis-ID' }, { status: 400 });
    }

    // Block purchase if user already has an active subscription
    const companyId = userDoc.data()?.companyId || decodedToken.uid;
    const companyDoc = await admin.db.collection('companies').doc(companyId).get();
    const stripe = getStripe();

    // Determine existing Stripe customer for reuse (prevents duplicate customers)
    let existingCustomerId: string | null = null;
    let existingSubscriptionId: string | null = null;

    if (companyDoc.exists) {
      const company = companyDoc.data()!;
      existingCustomerId = company.stripeCustomerId || null;
      existingSubscriptionId = company.stripeSubscriptionId || null;
      const currentStatus = company.subscriptionStatus;

      // Block new checkout if payment is past_due (prevents dual subscriptions)
      if (currentStatus === 'past_due') {
        return NextResponse.json({ error: 'Zahlung ausstehend – bitte zuerst offene Rechnungen begleichen.' }, { status: 400 });
      }

      // Active subscription → upgrade via Stripe subscription update (seamless, no re-auth flow)
      if (currentStatus === 'active' && existingSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
          const subscriptionItemId = subscription.items.data[0]?.id;
          if (!subscriptionItemId) throw new Error('No subscription item found');

          await stripe.subscriptions.update(existingSubscriptionId, {
            items: [{ id: subscriptionItemId, price: priceId }],
            proration_behavior: 'always_invoice',
            metadata: { uid: decodedToken.uid, plan: planId || planName || 'unknown' },
          });

          // Update Firestore plan name + excess cleanup immediately
          try {
            const updateData: Record<string, any> = {
              subscriptionPlan: planId || planName || 'unknown',
            };
            if (excessEmployees && excessEmployees > 0) {
              const excessCount = excessEmployees;
              const companiesSnap = await admin.db.collection('companies').doc(companyId).get();
              const oldPlan = companiesSnap.data()?.subscriptionPlan || 'solo';
              updateData.excessCleanupAt = Timestamp.fromDate(new Date(Date.now() + EXCESS_CLEANUP_MS));
              updateData.excessDataTypes = ['employees'];
              updateData.excessOldPlan = oldPlan;
              updateData.excessCount = excessCount;
              updateData.updatedAt = FieldValue.serverTimestamp();
            }
            await admin.db.collection('companies').doc(companyId).update(updateData);
          } catch (firestoreErr) {
            console.warn('Failed to update Firestore:', firestoreErr);
          }

          return NextResponse.json({ success: true, upgraded: true, url: '/settings/subscription?success=true' });
        } catch (upgradeErr: any) {
          // If the subscription was already deleted at Stripe (stale ID), create a fresh checkout
          if (upgradeErr?.code === 'resource_missing') {
            console.warn('Stripe subscription not found (stale ID), creating new checkout:', upgradeErr);
            existingSubscriptionId = null; // Don't try to cancel a stale subscription
          } else {
            // Real upgrade failure — don't create duplicate subscription (double billing)
            console.error('Subscription upgrade failed:', upgradeErr);
            return NextResponse.json({ error: 'Upgrade fehlgeschlagen. Bitte versuche es erneut oder kontaktiere den Support.' }, { status: 500 });
          }
        }
      }
    }

    const sessionParams: any = {
      mode: 'subscription',
      client_reference_id: decodedToken.uid,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { uid: decodedToken.uid, plan: planId || planName || 'unknown' },
      success_url: `${origin}/settings/subscription?success=true`,
      cancel_url: `${origin}/settings/subscription?canceled=true`,
      locale: 'de',
    };

    // Reuse existing Stripe customer to prevent duplicate customer records
    const tryExistingCustomer = existingCustomerId;
    if (tryExistingCustomer) {
      sessionParams.customer = tryExistingCustomer;
    } else if (decodedToken.email) {
      sessionParams.customer_email = decodedToken.email;
    }

    // If upgrading and old subscription still exists at Stripe, cancel it upon new checkout success
    if (existingSubscriptionId) {
      sessionParams.subscription_data = {
        metadata: { ...sessionParams.metadata, replaced_subscription: existingSubscriptionId },
      };
    }

    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeErr: any) {
      // Test/Live-Key-Mismatch: gespeicherte Kunden-ID ist aus anderem Modus
      if (stripeErr?.type === 'StripeInvalidRequestError' &&
          stripeErr?.message?.includes('similar object exists in test mode')) {
        console.warn('Stripe customer mode mismatch – clearing stored customer ID and retrying with email');
        // Stored customer ID aus Firestore löschen + ohne customer neu versuchen
        await admin.db.collection('companies').doc(companyId).update({
          stripeCustomerId: null,
        }).catch(e => console.warn('Failed to clear stale stripeCustomerId', e));

        delete sessionParams.customer;
        if (decodedToken.email) {
          sessionParams.customer_email = decodedToken.email;
        }
        session = await stripe.checkout.sessions.create(sessionParams);
      } else {
        throw stripeErr; // Unbekannter Fehler – nach oben werfen
      }
    }

    return NextResponse.json({ url: session.url, checkoutUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
