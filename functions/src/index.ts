import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { getStorage } from 'firebase-admin/storage';

admin.initializeApp();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || functions.config().admin?.email || (() => { throw new Error('ADMIN_EMAIL not configured. Set via env var or firebase functions:config:set admin.email="..."'); })();
const SITE_URL = process.env.SITE_URL || functions.config().site?.url || 'https://earntrack.de';

const db = admin.firestore();

function trimVal(v: string | undefined | null): string {
  return (v || '').trim();
}

function isTestMode(): boolean {
  return process.env.STRIPE_TEST_MODE === 'true' || functions.config().stripe?.test_mode === 'true';
}

let _stripeInstance: any = null;
let _stripeTestMode = false;

function getStripe(): any {
  const testMode = isTestMode();
  if (_stripeInstance && _stripeTestMode === testMode) return _stripeInstance;
  const secret = trimVal(testMode
    ? (process.env.STRIPE_TEST_SECRET_KEY || functions.config().stripe?.test_secret || '')
    : (process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret || ''));
  if (!secret) throw new Error(`Stripe ${testMode ? 'test' : 'live'} secret not configured`);
  _stripeTestMode = testMode;
  _stripeInstance = new (require('stripe'))(secret, {
    apiVersion: '2025-02-24.acacia',
  });
  return _stripeInstance;
}

const STRIPE_WEBHOOK_SECRET = () => {
  const testMode = isTestMode();
  const tm = functions.config().stripe?.test_mode;
  const secret = trimVal(testMode
    ? (process.env.STRIPE_TEST_WEBHOOK_SECRET_KEY || functions.config().stripe?.test_webhook_secret || '')
    : (process.env.STRIPE_WEBHOOK_SECRET_KEY || functions.config().stripe?.webhook_secret || ''));
  functions.logger.log('STRIPE_WEBHOOK_SECRET', { testMode, configTestMode: tm, secretLen: secret.length, secretPreview: secret.substring(0, 10) + '...' });
  return secret;
};

function getSmtp() {
  const email = functions.config().gmail?.email;
  const password = functions.config().gmail?.password;
  if (!email || !password) throw new Error('Gmail config missing. Run: firebase functions:config:set gmail.email="..." gmail.password="..."');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: password },
  });
}

function parseDate(str: any): Date | null {
  if (!str) return null;
  if (typeof str.toDate === 'function') return str.toDate();
  if (typeof str !== 'string') return new Date(str);
  const parts = str.split('.');
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return new Date(str);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function esc(s: string | undefined | null): string {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function sendEmail(to: string, subject: string, html: string) {
  const transporter = getSmtp();
  await transporter.sendMail({
    from: `"EarnTrack" <${functions.config().gmail.email}>`,
    to,
    subject,
    html,
  });
}

async function getUserEmail(uid: string): Promise<string | null> {
  try {
    const user = await admin.auth().getUser(uid);
    return user.email || null;
  } catch (e) { functions.logger.error('getUserEmail failed', e); return null; }
}

// ─── Stripe Checkout Session erstellen ───
export const createCheckoutSession = functions.runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET_KEY', 'STRIPE_TEST_MODE', 'SITE_URL', 'ADMIN_EMAIL'] }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');

  const { priceId, planId, planName, successUrl, cancelUrl } = data;
  if (!priceId && !planId) throw new functions.https.HttpsError('invalid-argument', 'Kein Plan ausgewählt');
  if (!priceId) throw new functions.https.HttpsError('invalid-argument', 'priceId ist erforderlich');

  const uid = context.auth.uid;
  const userEmail = context.auth.token.email || '';

  // Block if company is past_due – user must resolve outstanding invoices first
  const existingCompany = await db.collection('companies').doc(uid).get();
  if (existingCompany.exists && existingCompany.data()?.subscriptionStatus === 'past_due') {
    throw new functions.https.HttpsError('failed-precondition', 'Zahlung ist überfällig. Bitte zuerst offene Rechnungen begleichen.');
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(userEmail ? { customer_email: userEmail } : {}),
      client_reference_id: uid,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { uid, plan: planId || planName || 'unknown', planId: planId || '' },
      success_url: successUrl || `${SITE_URL}/settings/subscription?success=true`,
      cancel_url: cancelUrl || `${SITE_URL}/settings/subscription?canceled=true`,
      locale: 'de',
    });

    return { sessionId: session.id, checkoutUrl: session.url, url: session.url };
  } catch (err: any) {
    functions.logger.error('Stripe checkout error:', err);
    throw new functions.https.HttpsError('internal', 'Fehler bei der Zahlungsabwicklung');
  }
});

// ─── Stripe Webhook ───
export const stripeWebhook = functions.runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET_KEY', 'STRIPE_TEST_MODE', 'SITE_URL', 'ADMIN_EMAIL'] }).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const sig = req.headers['stripe-signature'] as string;
  let event: any;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET());
  } catch (err: any) {
    functions.logger.error('Stripe webhook signature error:', err);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;

        // Wichtig: payment_status prüfen — bei SEPA kann die Zahlung erst später bestätigt werden
        const paymentStatus = session.payment_status as string;
        const isPaid = paymentStatus === 'paid' || paymentStatus === 'no_payment_required';

        let uid = session.metadata?.uid || session.client_reference_id;
        const email = session.customer_email || session.metadata?.email || '';
        const plan = session.metadata?.plan || 'unknown';
        const stripeCustomerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Public checkout: client_reference_id is the email, not a Firebase UID
        if (uid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uid)) uid = null;

        // If no uid was provided (e.g., public checkout from landing page),
        // look up or create the user by email
        if (!uid && email) {
          try {
            const userRecord = await admin.auth().getUserByEmail(email);
            uid = userRecord.uid;
          } catch (e: any) {
            if (e.code !== 'auth/user-not-found') {
              functions.logger.error(`Error looking up user by email ${email}`, e);
              res.status(200).json({ received: true });
              return;
            }
            functions.logger.info(`User not found by email ${email}, creating new account`);
            const newUser = await admin.auth().createUser({
              email,
              emailVerified: true,
              password: Math.random().toString(36).slice(2) + 'Ab1!',
            });
            uid = newUser.uid;

            // Send password reset email so user can set their password (non-blocking)
            if (!isTestMode()) {
              try {
                const link = await admin.auth().generatePasswordResetLink(email);
                await sendEmail(email, 'Willkommen bei EarnTrack – Lege dein Passwort fest',
                  `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
                    <div style="background:linear-gradient(135deg,#0d9488,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center">
                      <h1 style="color:#fff;margin:0;font-size:20px">Willkommen bei EarnTrack!</h1>
                    </div>
                    <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                      <p style="color:#334155">Dein Abonnement ist aktiv. Lege jetzt dein Passwort fest, um dich anzumelden.</p>
                      <a href="${link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Passwort festlegen</a>
                      <p style="color:#64748b;font-size:12px;margin-top:16px">Dein Plan: <b>${plan}</b></p>
                    </div>
                  </div>`);
              } catch (e) {
                functions.logger.error('Welcome email failed:', e);
              }
            }
            functions.logger.info(`Created new user ${uid} from Stripe checkout (${email})`);
          }
        }

        if (!uid) { res.status(200).json({ received: true }); return; }

        const companyId = uid;

        let eventProcessed = false;
        await db.runTransaction(async (transaction) => {
          const stripeEventRef = db.collection('_stripe_events').doc(event.id);
          const stripeEventSnap = await transaction.get(stripeEventRef);
          if (stripeEventSnap.exists) {
            eventProcessed = true;
            return;
          }

          const existingCompanySnap = await transaction.get(db.collection('companies').doc(companyId));
          const companyData: Record<string, any> = {
            subscriptionStatus: isPaid ? 'active' : 'pending',
            subscriptionPlan: plan,
            stripeCustomerId,
            stripeSubscriptionId: subscriptionId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            dataCleanupAt: admin.firestore.FieldValue.delete(),
            retentionCouponId: admin.firestore.FieldValue.delete(),
          };
          if (!existingCompanySnap.exists) {
            companyData.createdAt = admin.firestore.FieldValue.serverTimestamp();
            companyData.name = email.split('@')[0] || 'Mein Unternehmen';
          }
          transaction.set(stripeEventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
          transaction.set(db.collection('payment_requests').doc(uid), {
            companyId: uid,
            userEmail: email,
            plan,
            status: isPaid ? 'approved' : 'pending',
            stripeCustomerId,
            stripeSubscriptionId: subscriptionId,
            amount: session.amount_total,
            currency: session.currency,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          transaction.set(db.collection('users').doc(uid), {
            email,
            companyId: uid,
            role: 'owner',
            stripeCustomerId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(db.collection('companies').doc(companyId), companyData, { merge: true });
        });

        if (eventProcessed) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          res.status(200).json({ received: true });
          return;
        }

        // Check employee limit and set cleanup timestamp if exceeded
        // Source of truth: earntrack-web/src/lib/plans.ts PLAN_LIMITS
        const EMP_LIMITS: Record<string, number> = { solo: 2, team: 5, business: Infinity };
        const planLimit = EMP_LIMITS[plan] ?? Infinity;
        if (planLimit !== Infinity) {
          const empSnap = await db.collection('employees').where('companyId', '==', companyId).limit(500).get();
          if (empSnap.size > planLimit) {
            const cleanupAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await db.collection('companies').doc(companyId).update({
              excessCleanupAt: admin.firestore.Timestamp.fromDate(cleanupAt),
            });
          }
        }

        // Cancel old subscription if replaced
        const replacedSub = session.metadata?.replaced_subscription as string | undefined;
        if (replacedSub) {
          try {
            const stripe = getStripe();
            await stripe.subscriptions.cancel(replacedSub, { prorate: true, invoice_now: false });
            functions.logger.info(`Cancelled old subscription ${replacedSub} after new checkout for ${email}`);
          } catch (e: any) {
            if (e?.code !== 'resource_missing') {
              functions.logger.error(`Failed to cancel replaced subscription ${replacedSub}:`, e);
            }
          }
        }

        if (!isTestMode()) {
          try {
            await sendEmail(
              ADMIN_EMAIL,
              '💰 Neue Zahlung erhalten – EarnTrack',
              `<p>Ein neuer Kunde hat EarnTrack abonniert:</p>
               <ul>
                 <li><b>E-Mail:</b> ${email}</li>
                 <li><b>Plan:</b> ${plan}</li>
                 <li><b>Betrag:</b> ${session.amount_total ? (session.amount_total / 100).toFixed(2) + ' ' + session.currency?.toUpperCase() : 'N/A'}</li>
                 <li><b>Stripe Customer ID:</b> ${stripeCustomerId}</li>
               </ul>`
            );
          } catch (e) {
            functions.logger.error('Admin payment email failed:', e);
          }
        }
        functions.logger.info(`Payment completed for ${email} (${plan})`);
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const asyncSession = event.data.object as any;
        const asyncUid = asyncSession.metadata?.uid || asyncSession.client_reference_id || '';
        const asyncEmail = asyncSession.customer_email || asyncSession.metadata?.email || '';

        if (asyncUid && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asyncUid)) {
          await db.collection('companies').doc(asyncUid).update({
            subscriptionStatus: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(e => functions.logger.warn('async payment success update failed:', e));

          const paySnap = await db.collection('payment_requests').doc(asyncUid).get();
          if (paySnap.exists) {
            await paySnap.ref.update({ status: 'approved', paidAt: admin.firestore.FieldValue.serverTimestamp() });
          }

          functions.logger.info(`Async payment succeeded for ${asyncEmail || asyncUid}, status set to active`);
        }

        const asyncProcRef = db.collection('_stripe_events').doc(event.id);
        await asyncProcRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const failedSession = event.data.object as any;
        const failedUid = failedSession.metadata?.uid || failedSession.client_reference_id || '';
        const failedEmail = failedSession.customer_email || failedSession.metadata?.email || '';

        if (failedUid && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(failedUid)) {
          await db.collection('companies').doc(failedUid).update({
            subscriptionStatus: 'expired',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(e => functions.logger.warn('async payment failure update failed:', e));

          const failPaySnap = await db.collection('payment_requests').doc(failedUid).get();
          if (failPaySnap.exists) {
            await failPaySnap.ref.update({ status: 'failed' });
          }

          functions.logger.info(`Async payment failed for ${failedEmail || failedUid}, status set to expired`);

          if (!isTestMode()) {
            try {
              await sendEmail(
                ADMIN_EMAIL,
                '⚠️ SEPA-Zahlung fehlgeschlagen – EarnTrack',
                `<p>Eine SEPA-Zahlung ist fehlgeschlagen:</p>
                 <ul>
                   <li><b>E-Mail:</b> ${failedEmail || 'Unbekannt'}</li>
                   <li><b>UID:</b> ${failedUid}</li>
                 </ul>
                 <p>Der Account wurde auf <b>expired</b> gesetzt.</p>`
              );
            } catch (e) {
              functions.logger.error('Admin async payment failure email failed:', e);
            }
          }
        }

        const failProcRef = db.collection('_stripe_events').doc(event.id);
        await failProcRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        const subId = subscription.id;

        const subDeletedProcessedRef = db.collection('_stripe_events').doc(event.id);
        const subDeletedProcessedSnap = await subDeletedProcessedRef.get();
        if (subDeletedProcessedSnap.exists) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          break;
        }

        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', customerId)
          .get();

        let companyUpdated = false;
        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (!data.stripeSubscriptionId || data.stripeSubscriptionId !== subscription.id) continue;
          await doc.ref.update({ status: 'canceled', canceledAt: admin.firestore.FieldValue.serverTimestamp() }).catch(e => functions.logger.warn('Cancel payment update failed', e));
          if (data.companyId && !companyUpdated) {
            companyUpdated = true;
            const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await db.collection('companies').doc(data.companyId).update({
              subscriptionStatus: 'cancelled',
              dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(e => functions.logger.warn('Cancel company update failed', e));
          }
        }

        await subDeletedProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        functions.logger.info(`Subscription cancelled for customer ${customerId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;

        functions.logger.info(`Invoice payment succeeded for customer ${customerId}`);

        const invProcessedRef = db.collection('_stripe_events').doc(event.id);
        const invProcessedSnap = await invProcessedRef.get();
        if (invProcessedSnap.exists) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          break;
        }

        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', customerId)
          .get();

        let companyUpdated = false;
        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (!data.stripeSubscriptionId || (invoice.subscription && data.stripeSubscriptionId !== invoice.subscription)) continue;
          if (data.companyId && !companyUpdated) {
            companyUpdated = true;
            await db.collection('companies').doc(data.companyId).update({
              subscriptionStatus: 'active',
              invoicePaymentFailedAt: admin.firestore.FieldValue.delete(),
              invoicePaymentAttempts: admin.firestore.FieldValue.delete(),
              dataCleanupAt: admin.firestore.FieldValue.delete(),
              retentionCouponId: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        await invProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const custId = subscription.customer as string;
        const subStatus = subscription.status as string;

        functions.logger.info(`Subscription updated for customer ${custId}: status=${subStatus}`);

        const subUpdProcessedRef = db.collection('_stripe_events').doc(event.id);
        const subUpdProcessedSnap = await subUpdProcessedRef.get();
        if (subUpdProcessedSnap.exists) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          break;
        }

        const STATUS_MAP: Record<string, string> = {
          active: 'active',
          past_due: 'past_due',
          unpaid: 'expired',
          paused: 'paused',
          canceled: 'cancelled',
          cancelled: 'cancelled',
          incomplete_expired: 'expired',
        };

        const mappedStatus = STATUS_MAP[subStatus];
        if (!mappedStatus) {
          await subUpdProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
          break;
        }

        const subPaymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', custId)
          .get();

        let companyUpdated = false;
        for (const doc of subPaymentsSnap.docs) {
          const data = doc.data();
          if (!data.stripeSubscriptionId || data.stripeSubscriptionId !== subscription.id) continue;
          if (data.companyId && !companyUpdated) {
            companyUpdated = true;
            const updateData: Record<string, any> = {
              subscriptionStatus: mappedStatus,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (mappedStatus === 'active') {
              updateData.invoicePaymentFailedAt = admin.firestore.FieldValue.delete();
              updateData.invoicePaymentAttempts = admin.firestore.FieldValue.delete();
              updateData.dataCleanupAt = admin.firestore.FieldValue.delete();
              updateData.retentionCouponId = admin.firestore.FieldValue.delete();
            }
            await db.collection('companies').doc(data.companyId).update(updateData);
          }
        }

        await subUpdProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const attemptCount = invoice.attempt_count || 1;
        const nextAttempt = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null;

        functions.logger.warn(`Invoice payment failed for customer ${customerId} (attempt ${attemptCount})`);

        const invFailProcessedRef = db.collection('_stripe_events').doc(event.id);
        const invFailProcessedSnap = await invFailProcessedRef.get();
        if (invFailProcessedSnap.exists) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          break;
        }

        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', customerId)
          .get();

        let companyUpdated = false;
        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (!data.stripeSubscriptionId || (invoice.subscription && data.stripeSubscriptionId !== invoice.subscription)) continue;
          if (data.companyId && !companyUpdated) {
            companyUpdated = true;
            await db.collection('companies').doc(data.companyId).update({
              subscriptionStatus: 'past_due',
              invoicePaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
              invoicePaymentAttempts: attemptCount,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Benachrichtige den Admin bei erstmaligem Fehlschlag
            if (attemptCount <= 2) {
              const userEmail = data.userEmail || '';
              const nextAttemptStr = nextAttempt ? nextAttempt.toLocaleString('de-DE') : 'unbekannt';
              try {
                await sendEmail(
                  ADMIN_EMAIL,
                  '⚠️ Zahlung fehlgeschlagen – EarnTrack',
                  `<p>Eine Abo-Zahlung ist fehlgeschlagen:</p>
                   <ul>
                     <li><b>Kunde:</b> ${userEmail}</li>
                     <li><b>Versuch:</b> ${attemptCount}. Mal</li>
                     <li><b>Nächster Versuch:</b> ${nextAttemptStr}</li>
                     <li><b>Stripe Customer ID:</b> ${customerId}</li>
                   </ul>`
                );
              } catch (e) {
                functions.logger.error('Payment failed admin email error:', e);
              }
            }
          }
        }

        await invFailProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });

        functions.logger.warn(`Invoice payment failed processed for customer ${customerId}`);
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    functions.logger.error('Stripe webhook handler error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── RevenueCat Webhook ───
const REVENUECAT_PRODUCT_PLANS = {
  'earntrack-solo-monthly': 'solo',
  'earntrack-team-monthly': 'team',
  'earntrack-business-monthly': 'business',
};

function validateRevenueCatSignature(req: functions.https.Request): boolean {
  const secret = functions.config().revenuecat?.webhook_secret;
  if (!secret) {
    functions.logger.warn('[RevenueCat] Webhook secret not configured – set via firebase functions:config:set revenuecat.webhook_secret="..."');
    return false;
  }
  const authHeader = req.headers['authorization'] as string || '';
  const expected = 'Bearer ' + secret;
  if (authHeader !== expected) {
    functions.logger.warn('[RevenueCat] Invalid Authorization header');
    return false;
  }
  return true;
}

export const revenuecatWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  if (!validateRevenueCatSignature(req)) {
    res.status(401).send('Invalid signature');
    return;
  }

  try {
    const event = req.body;
    const eventType = event.event?.type || '';
    const appUserId = event.event?.app_user_id || '';
    const productId = event.event?.product_id || '';
    const periodType = event.event?.period_type || 'normal'; // normal, trial, intro
    const eventId = event.event?.id || '';

    if (!appUserId) {
      functions.logger.warn('[RevenueCat] No app_user_id in webhook');
      res.json({ received: true });
      return;
    }

    if (!eventId) {
      functions.logger.warn('[RevenueCat] No event_id in webhook, cannot deduplicate – skipping');
      res.json({ received: true });
      return;
    }

    functions.logger.info(`[RevenueCat] Event: ${eventType} for user ${appUserId}, product: ${productId}`);

      const plan = REVENUECAT_PRODUCT_PLANS[productId as keyof typeof REVENUECAT_PRODUCT_PLANS] || null;
      const companyRef = db.collection('companies').doc(appUserId);
      const rcProcessedRef = db.collection('_stripe_events').doc(`rc_${eventId}`);

    // Determine update data based on event type
    const getUpdateData = (companyExists: boolean): Record<string, any> | null => {
      switch (eventType) {
        case 'INITIAL_PURCHASE': {
          if (!plan) return null;
          const data: Record<string, any> = {
            subscriptionStatus: 'active',
            subscriptionPlan: plan,
            revenuecatProductId: productId,
            revenuecatEventId: eventId,
            dataCleanupAt: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (!companyExists) {
            data.name = '';
            data.createdAt = admin.firestore.FieldValue.serverTimestamp();
          }
          return data;
        }
        case 'RENEWAL':
        case 'UNCANCELLATION': {
          const data: Record<string, any> = {
            subscriptionStatus: 'active',
            revenuecatProductId: productId,
            revenuecatEventId: eventId,
            dataCleanupAt: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (!companyExists) {
            data.name = '';
            data.createdAt = admin.firestore.FieldValue.serverTimestamp();
          }
          if (plan) data.subscriptionPlan = plan;
          return data;
        }
        case 'CANCELLATION': {
          const cancelReason = event.event?.cancel_reason || 'unknown';
          const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return {
            subscriptionStatus: 'cancelled',
            revenuecatCancelReason: cancelReason,
            dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
            revenuecatEventId: eventId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        }
        case 'BILLING_ISSUE':
          return {
            subscriptionStatus: 'past_due',
            revenuecatEventId: eventId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        case 'PRODUCT_CHANGE': {
          const data: Record<string, any> = {
            revenuecatProductId: productId,
            revenuecatEventId: eventId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (plan) data.subscriptionPlan = plan;
          return data;
        }
        case 'SUBSCRIPTION_PAUSED':
          return {
            subscriptionStatus: 'paused',
            revenuecatEventId: eventId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        default:
          return null;
      }
    };

    // Execute all writes atomically in a transaction
    let processed = false;
    await db.runTransaction(async (transaction) => {
      const markerSnap = await transaction.get(rcProcessedRef);
      if (markerSnap.exists) {
        processed = true;
        return;
      }
      const companySnap = await transaction.get(companyRef);
      const updateData = getUpdateData(companySnap.exists);
      if (updateData === null) {
        // Unrecognized product or unhandled event – still mark as processed
        transaction.set(rcProcessedRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), type: eventType }, { merge: true });
        return;
      }
      transaction.set(rcProcessedRef, { processedAt: admin.firestore.FieldValue.serverTimestamp(), type: eventType }, { merge: true });
      transaction.set(companyRef, updateData, { merge: true });
    });

    if (processed) {
      functions.logger.info(`[RevenueCat] Event ${eventId} already processed, skipping`);
      res.json({ received: true });
      return;
    }

    res.json({ received: true });
  } catch (err) {
    functions.logger.error('[RevenueCat] Webhook handler error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── Demo-Signup Benachrichtigung ───
export const onDemoSignup = functions.firestore
  .document('demo_signups/{uid}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { uid } = context.params;

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#0d9488,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">🎉 Neue Demo-Anmeldung</h1>
        </div>
        <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
          <p style="font-size:15px;color:#334155"><b>${esc(data.name) || 'Unbekannt'}</b> hat sich für die 14-Tage-Demo angemeldet.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Name</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.name) || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Unternehmen</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.companyName) || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">E-Mail</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.email) || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Telefon</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.phone) || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Adresse</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.address) || '-'}</td></tr>
          </table>
          <p style="margin-top:16px;color:#64748b;font-size:13px">
            Trial läuft bis: ${data.trialEndsAt?.toDate?.()?.toLocaleDateString('de-DE') || 'N/A'}<br>
            Quelle: ${data.source || 'Webseite'}
          </p>
          <a href="https://console.firebase.google.com/project/${process.env.GCLOUD_PROJECT}/firestore/data/~2Fdemo_signups~2F${uid}"
             style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
            In Firebase ansehen
          </a>
        </div>
      </div>`;

    try {
      await sendEmail(ADMIN_EMAIL, '🎉 Neue Demo-Anmeldung – EarnTrack', html);
      functions.logger.info(`Demo signup email sent for ${data.email || uid}`);
    } catch (err) {
      functions.logger.error('Failed to send demo signup email', err);
    }
  });

// ─── Usage Log (tägliche Nutzung tracken) ───
export const logUsage = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');

  const uid = context.auth.uid;
  const { action } = data;
  if (!action) throw new functions.https.HttpsError('invalid-argument', 'Keine Aktion angegeben');

  const today = new Date().toISOString().split('T')[0];
  const logId = `${uid}_${today}`;

  const updateData: Record<string, any> = {
    uid,
    date: today,
    lastAction: action,
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
    actions: admin.firestore.FieldValue.increment(1),
  };
  updateData[`actionCounts.${action}`] = admin.firestore.FieldValue.increment(1);

  await db.collection('usage_log').doc(logId).set(updateData, { merge: true });

  return { logged: true };
});

export const checkNotifications = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).pubsub.schedule('every 60 minutes').onRun(async () => {
  const now = new Date();
  const today = fmtDate(now);
  const tomorrow = fmtDate(new Date(now.getTime() + 86400000));

  let lastDoc: admin.firestore.DocumentSnapshot | null = null;
  const PAGE_SIZE = 500;
  let processed = 0;

  while (true) {
    let query: admin.firestore.Query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const usersSnap = await query.get();
    if (usersSnap.empty) break;

    for (const userDoc of usersSnap.docs) {
      try {
        processed++;
        const uid = userDoc.id;
        const settings = userDoc.data().notifications;
        if (!settings) { lastDoc = userDoc; continue; }

        const userEmail = await getUserEmail(uid);
        if (!userEmail) { lastDoc = userDoc; continue; }

        const assignmentsSnap = await db.collection('assignments')
          .where('companyId', '==', userDoc.data().companyId)
          .limit(500)
          .get();
        const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const dueInvoices: string[] = [];
        const upcomingAssignments: string[] = [];

        for (const a of assignments as any[]) {
          if (settings.emailInvoices) {
            const dueDate = a.invoiceDueDate ? parseDate(a.invoiceDueDate) : null;
            if (dueDate && a.invoiceStatus !== 'paid') {
              const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
              if (diffDays < 0) {
                dueInvoices.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – überfällig seit ${a.invoiceDueDate}`);
              } else if (diffDays <= 3) {
                dueInvoices.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – fällig am ${a.invoiceDueDate}`);
              }
            }
          }

          if (settings.emailReports) {
            const aDate = a.datum ? parseDate(a.datum) : null;
            if (aDate) {
              const dStr = fmtDate(aDate);
              if (dStr === today || dStr === tomorrow) {
                upcomingAssignments.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – ${esc(a.kunde) || ''} am ${dStr}`);
              }
            }
          }
        }

        if (dueInvoices.length > 0 || upcomingAssignments.length > 0) {
          let html = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">';
          html += '<div style="background:linear-gradient(135deg,#0d9488,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center">';
          html += '<h1 style="color:#fff;margin:0;font-size:20px">EarnTrack Benachrichtigungen</h1>';
          html += '</div>';
          html += '<div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">';

          if (dueInvoices.length > 0) {
            html += '<h2 style="color:#dc2626;font-size:16px">📄 Rechnungen</h2>';
            html += '<ul style="padding-left:20px">' + dueInvoices.join('') + '</ul>';
            html += `<p style="color:#64748b;font-size:13px;margin-top:12px">Status in EarnTrack aktualisieren: <a href="${SITE_URL}/invoices" style="color:#0d9488">Rechnungen öffnen</a></p>`;
          }

          if (upcomingAssignments.length > 0) {
            html += '<h2 style="color:#0d9488;font-size:16px;margin-top:20px">⏰ Anstehende Termine</h2>';
            html += '<ul style="padding-left:20px">' + upcomingAssignments.join('') + '</ul>';
            html += `<p style="color:#64748b;font-size:13px;margin-top:12px">Alle Termine ansehen: <a href="${SITE_URL}/assignments" style="color:#0d9488">Termine öffnen</a></p>`;
          }

          html += '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">';
          html += `<p style="color:#94a3b8;font-size:11px">Du erhältst diese E-Mail, weil du Benachrichtigungen in EarnTrack aktiviert hast.<br>Einstellungen ändern: <a href="${SITE_URL}/settings/notifications" style="color:#0d9488">Benachrichtigungen</a></p>`;
          html += '</div></div>';

          await sendEmail(userEmail, `EarnTrack: ${dueInvoices.length > 0 ? 'Rechnungserinnerung' : 'Terminerinnerung'}`, html);
          functions.logger.info(`Email sent to ${userEmail}`);
        }
        lastDoc = userDoc;
      } catch (err) {
        functions.logger.error(`[checkNotifications] Error processing user ${userDoc.id}`, err);
        lastDoc = userDoc;
      }
    }
  }
  functions.logger.info(`[checkNotifications] Processed ${processed} users`);
});

export const sendTestEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');
  const transporter = getSmtp();
  await transporter.sendMail({
    from: `"EarnTrack" <${functions.config().gmail.email}>`,
    to: functions.config().gmail.email,
    subject: 'EarnTrack Test-E-Mail',
    html: '<p>Test erfolgreich. Deine E-Mail-Konfiguration funktioniert.</p>',
  });
  return { success: true };
});

// Erfordert Blaze (Pay-as-you-go) Plan. Aktivieren wenn upgrade durchgeführt:
//
// export const onNewProjectMember = functions.firestore
//   .document('project_members/{assignmentId}')
//   .onWrite(async (change, context) => {
//     const { assignmentId } = context.params;
//
//     const beforeData = change.before.data() || {};
//     const afterData = change.after.data() || {};
//
//     const newUids = Object.keys(afterData).filter(uid => !beforeData[uid]);
//     if (newUids.length === 0) return;
//
//     const assignmentSnap = await db.collection('assignments').doc(assignmentId).get();
//     const assignment = assignmentSnap.data();
//     const projectName = assignment?.projekt || 'Einem Projekt';
//     const customerName = assignment?.kunde || '';
//
//     for (const uid of newUids) {
//       const memberInfo = afterData[uid];
//       const displayName = memberInfo?.displayName || 'Mitarbeiter';
//
//       await db.collection('notifications').add({
//         userId: uid,
//         type: 'project_assigned',
//         title: 'Neues Projekt',
//         body: `Du wurdest zu "${projectName}"${customerName ? ` (${customerName})` : ''} hinzugefügt.`,
//         assignmentId,
//         read: false,
//         createdAt: admin.firestore.FieldValue.serverTimestamp(),
//       });
//
//       try {
//         const userSnap = await db.collection('users').doc(uid).get();
//         const fcmToken = userSnap.data()?.fcmToken;
//         if (fcmToken) {
//           await admin.messaging().send({
//             token: fcmToken,
//             notification: {
//               title: 'Neues Projekt',
//               body: `Du wurdest zu "${projectName}" hinzugefügt.`,
//             },
//             data: {
//               type: 'project_assigned',
//               assignmentId,
//             },
//           });
//           functions.logger.info(`FCM push sent to ${uid}`);
//         }
//       } catch (err) {
//         functions.logger.info(`No FCM token for ${uid} or push failed`);
//       }
//   }
// });

/**
 * Sendet Push-Benachrichtigungen (Expo) an alle Projektmitglieder,
 * wenn jemand auf eine Notiz antwortet – egal ob von Web-App oder Mobile-App.
 * Dadurch werden auch Benachrichtigungen zugestellt, wenn der Chef
 * über die Web-App antwortet.
 */
export const onNoteReply = functions.firestore
  .document('project_note_replies/{replyId}')
  .onCreate(async (snap, context) => {
    const reply = snap.data();
    if (!reply.noteId) return;

    const noteSnap = await db.collection('project_notes').doc(reply.noteId).get();
    if (!noteSnap.exists) return;
    const noteData = noteSnap.data()!;
    if (!noteData.assignmentId) return;

    const [assignmentSnap, membersSnap] = await Promise.all([
      db.collection('assignments').doc(noteData.assignmentId).get(),
      db.collection('project_members').doc(noteData.assignmentId).get(),
    ]);

    const ownerId = assignmentSnap.exists
      ? (assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId)
      : null;

    const recipientUids = new Set<string>();
    if (ownerId && ownerId !== reply.userId) recipientUids.add(ownerId);
    if (membersSnap.exists) {
      Object.keys(membersSnap.data()!).forEach(mUid => {
        if (mUid !== reply.userId) recipientUids.add(mUid);
      });
    }

    if (recipientUids.size === 0) return;

    const body = `${reply.userName || 'Jemand'}: ${(reply.text || '').substring(0, 50)}`;

    await sendPushToRecipients(
      Array.from(recipientUids),
      '💬 Neue Antwort',
      body,
      token => ({
        to: token,
        title: '💬 Neue Antwort',
        body,
        data: { noteId: reply.noteId, assignmentId: noteData.assignmentId, type: 'note_reply' },
      }),
      { noteId: reply.noteId, assignmentId: noteData.assignmentId, type: 'note_reply' },
    );

    functions.logger.info(`Push sent for reply ${context.params.replyId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * Sendet Push-Benachrichtigungen, wenn eine Notiz von der Web-App erstellt wird.
 */
export const onNoteCreated = functions.firestore
  .document('project_notes/{noteId}')
  .onCreate(async (snap, context) => {
    const note = snap.data();
    if (!note.assignmentId) return;

    const [assignmentSnap, membersSnap] = await Promise.all([
      db.collection('assignments').doc(note.assignmentId).get(),
      db.collection('project_members').doc(note.assignmentId).get(),
    ]);

    const ownerId = assignmentSnap.exists
      ? (assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId)
      : null;

    const recipientUids = new Set<string>();
    if (ownerId && ownerId !== note.userId) recipientUids.add(ownerId);
    if (membersSnap.exists) {
      Object.keys(membersSnap.data()!).forEach(mUid => {
        if (mUid !== note.userId) recipientUids.add(mUid);
      });
    }

    if (recipientUids.size === 0) return;

    const displayName = note.userName || note.userEmail || 'Mitarbeiter';
    const isPinned = note.isPinned || false;
    const title = isPinned ? '📌 Neue Ankündigung' : '📝 Neue Notiz';
    const body = `${displayName}: ${(note.text || note.note || '').substring(0, 50)}`;

    await sendPushToRecipients(
      Array.from(recipientUids),
      title,
      body,
      token => ({
        to: token,
        title,
        body,
        data: { assignmentId: note.assignmentId, type: isPinned ? 'pinned_note' : 'note' },
      }),
      { assignmentId: note.assignmentId, type: isPinned ? 'pinned_note' : 'note' },
    );

    functions.logger.info(`Push sent for note ${context.params.noteId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * Sendet Push-Benachrichtigungen an Projektbesitzer und Mitglieder,
 * wenn ein Mitarbeiter sich ein- oder ausstempelt.
 */
export const onClockEntry = functions.firestore
  .document('clock_entries/{entryId}')
  .onCreate(async (snap, context) => {
    const entry = snap.data();
    if (!entry.assignmentId || !entry.userId) return;

    const [assignmentSnap, membersSnap] = await Promise.all([
      db.collection('assignments').doc(entry.assignmentId).get(),
      db.collection('project_members').doc(entry.assignmentId).get(),
    ]);
    if (!assignmentSnap.exists) return;

    const ownerId = assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId || null;

    const userName = entry.userName || 'Mitarbeiter';
    const isManualEntry = !!entry.clockOut;
    let title: string, body: string;
    if (isManualEntry) {
      title = '⏰ Arbeitszeit eingetragen';
      body = `${userName} hat Arbeitszeit eingetragen`;
    } else {
      title = '▶️ Eingestempelt';
      body = `${userName} hat sich eingestempelt`;
    }

    const recipientUids = new Set<string>();
    if (ownerId && ownerId !== entry.userId) recipientUids.add(ownerId);
    if (membersSnap.exists) {
      Object.keys(membersSnap.data()!).forEach(mUid => {
        if (mUid !== entry.userId) recipientUids.add(mUid);
      });
    }
    if (recipientUids.size === 0) return;

    // In-App Benachrichtigungen für alle Empfänger
    const batch = db.batch();
    for (const uid of recipientUids) {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: uid,
        type: 'clock_entry',
        title,
        body,
        assignmentId: entry.assignmentId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // Expo + FCM Push
    await sendPushToRecipients(
      Array.from(recipientUids),
      title,
      body,
      token => ({
        to: token,
        title,
        body,
        data: { assignmentId: entry.assignmentId, type: 'clock_entry' },
      }),
      { assignmentId: entry.assignmentId, type: 'clock_entry' },
    );

    functions.logger.info(`Push sent for clock entry ${context.params.entryId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * Sendet Push-Benachrichtigung bei Ausstempeln (clockOut wird gesetzt).
 * Feuert bei UPDATE, da clockOut beim Verlassen des Einsatzes gesetzt wird.
 */
export const onClockEntryUpdate = functions.firestore
  .document('clock_entries/{entryId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.assignmentId || !after?.userId) return;
    if (before?.clockOut || !after.clockOut) return;

    const [assignmentSnap, membersSnap] = await Promise.all([
      db.collection('assignments').doc(after.assignmentId).get(),
      db.collection('project_members').doc(after.assignmentId).get(),
    ]);
    if (!assignmentSnap.exists) return;

    const ownerId = assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId || null;

    const userName = after.userName || 'Mitarbeiter';
    const duration = after.totalMinutes || 0;
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const title = '🏁 Mitarbeiter ausgestempelt';
    const body = `${userName} hat den Einsatz beendet. Arbeitszeit: ${hours}h ${mins}min`;

    const recipientUids = new Set<string>();
    if (ownerId && ownerId !== after.userId) recipientUids.add(ownerId);
    if (membersSnap.exists) {
      Object.keys(membersSnap.data()!).forEach(mUid => {
        if (mUid !== after.userId) recipientUids.add(mUid);
      });
    }
    if (recipientUids.size === 0) return;

    // In-App Benachrichtigung
    const batch = db.batch();
    for (const uid of recipientUids) {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: uid,
        type: 'clock_out',
        title,
        body,
        assignmentId: after.assignmentId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // Expo + FCM Push
    await sendPushToRecipients(
      Array.from(recipientUids),
      title,
      body,
      token => ({
        to: token,
        title,
        body,
        data: { assignmentId: after.assignmentId, type: 'clock_out', totalMinutes: duration },
      }),
      { assignmentId: after.assignmentId, type: 'clock_out', totalMinutes: String(duration) },
    );

    functions.logger.info(`Push sent for clock-out ${context.params.entryId} to ${recipientUids.size} recipient(s)`);
  });

// ─── Push-Helper: Expo (Mobile) + FCM (Web) ───
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHUNK_SIZE = 100;

async function sendExpoPush(tokens: string[], buildMessage: (token: string) => Record<string, unknown>): Promise<void> {
  for (let i = 0; i < tokens.length; i += PUSH_CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + PUSH_CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk.map(buildMessage)),
      });
      if (!res.ok) {
        functions.logger.warn(`Expo push chunk status ${res.status}`);
      } else {
        const result: any = await res.json();
        if (result.data) {
          for (let j = 0; j < result.data.length; j++) {
            const ticket = result.data[j];
            if (ticket?.status === 'error') {
              functions.logger.warn(`Expo push ticket error for token ${chunk[j]?.substring(0, 16)}...: ${ticket.message || ticket.details?.error || 'unknown'}`);
            }
          }
        }
      }
    } catch (err) {
      functions.logger.error('Expo push chunk failed', err);
    }
  }
}

/**
 * Sendet FCM-Push-Benachrichtigungen an Web-Nutzer über Firebase Cloud Messaging.
 * Wird zusammen mit sendExpoPush verwendet, um sowohl Mobile- als auch Web-Nutzer zu erreichen.
 */
async function sendFcmPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;
  try {
    const message = {
      tokens,
      data: { ...(data || {}), title, body },
      webpush: {
        fcmOptions: {
          link: data?.url || '/',
        },
      },
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    if (response.failureCount > 0) {
      functions.logger.warn(`FCM push: ${response.successCount} sent, ${response.failureCount} failed`);
    } else {
      functions.logger.info(`FCM push sent to ${response.successCount} web device(s)`);
    }
  } catch (err) {
    functions.logger.error('FCM push failed', err);
  }
}

/**
 * Sammelt sowohl Expo- als auch FCM-Tokens für eine Liste von UIDs
 * und sendet Push-Benachrichtigungen über beide Kanäle.
 */
async function sendPushToRecipients(
  uids: string[],
  title: string,
  body: string,
  buildExpoMessage: (token: string) => Record<string, unknown>,
  fcmData?: Record<string, string>,
): Promise<void> {
  const expoTokens: string[] = [];
  const fcmTokens: string[] = [];

  for (const uid of uids) {
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.data();
      if (userData?.expoPushToken) expoTokens.push(userData.expoPushToken);
      if (userData?.fcmToken) fcmTokens.push(userData.fcmToken);
    } catch (e) {
      functions.logger.warn(`Token fetch failed for ${uid}`, e);
    }
  }

  const sends: Promise<void>[] = [];
  if (expoTokens.length > 0) {
    sends.push(sendExpoPush(expoTokens, buildExpoMessage));
  }
  if (fcmTokens.length > 0) {
    sends.push(sendFcmPush(fcmTokens, title, body, fcmData));
  }
  await Promise.allSettled(sends);
}

// ─── Cleanup excess employees after plan downgrade ───
async function isCompanyStillCancelled(companyId: string): Promise<boolean> {
  const snap = await db.collection('companies').doc(companyId).get();
  const status = snap.data()?.subscriptionStatus;
  if (status === 'active' || status === 'paused' || status === 'past_due') {
    await snap.ref.update({
      dataCleanupAt: admin.firestore.FieldValue.delete(),
      retentionCouponId: admin.firestore.FieldValue.delete(),
    });
    return false;
  }
  return true;
}

async function paginatedQuery(collectionName: string, field: string, value: string, limit = 500): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const results: admin.firestore.QueryDocumentSnapshot[] = [];
  let lastDoc: admin.firestore.DocumentSnapshot | null = null;
  while (true) {
    let q: admin.firestore.Query = db.collection(collectionName)
      .where(field, '==', value)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(limit);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach(d => results.push(d));
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return results;
}

// Source of truth: earntrack-web/src/lib/plans.ts PLAN_LIMITS
const EMP_LIMITS: Record<string, number> = { solo: 2, team: 5, business: Infinity };

export const cleanupExcessEmployees = functions.runWith({ timeoutSeconds: 540 }).pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // 1) Post-cancellation data cleanup (7-day grace period)
    const canceledCompanies = await db.collection('companies')
      .where('dataCleanupAt', '<', now)
      .limit(50)
      .get();

    if (!canceledCompanies.empty) {
      const COLLECTIONS_TO_CLEAR = [
        'employees', 'customers', 'assignments', 'invoices', 'estimates',
        'clock_entries', 'payment_requests',
      ];
      const BATCH_LIMIT = 500;

      for (const companyDoc of canceledCompanies.docs) {
        const companyId = companyDoc.id;
        try {
        const companyData = companyDoc.data();
        const bucket = getStorage().bucket();

        if (companyData.subscriptionStatus === 'active' || companyData.subscriptionStatus === 'paused') {
          functions.logger.warn(`[CancelCleanup] Skipping company ${companyId} – subscription is ${companyData.subscriptionStatus}`);
          await companyDoc.ref.update({
            dataCleanupAt: admin.firestore.FieldValue.delete(),
            retentionCouponId: admin.firestore.FieldValue.delete(),
          });
          continue;
        }

        let totalDeleted = 0;

        // Get all assignment IDs (paginated)
        const assignmentDocs = await paginatedQuery('assignments', 'companyId', companyId);
        const assignmentIds = assignmentDocs.map(d => d.id);

        // Collect all note IDs from project_notes for reply cleanup
        const allNoteIds: string[] = [];
        for (let i = 0; i < assignmentIds.length; i += 10) {
          const chunk = assignmentIds.slice(i, i + 10);
          const notesSnap = await db.collection('project_notes')
            .where('assignmentId', 'in', chunk)
            .get();
          notesSnap.docs.forEach(d => allNoteIds.push(d.id));
        }

        // Re-check company status BEFORE deleting any data
        if (!(await isCompanyStillCancelled(companyId))) continue;

        // Delete assignment-linked collections (no companyId field)
        for (const aId of assignmentIds) {
          await db.collection('project_members').doc(aId).delete().catch(e => functions.logger.warn('Project member delete failed', e));
          totalDeleted++;
        }

        // Re-check before project_photos deletion
        if (!(await isCompanyStillCancelled(companyId))) continue;

        for (let i = 0; i < assignmentIds.length; i += 10) {
          const chunk = assignmentIds.slice(i, i + 10);
          const snap = await db.collection('project_photos').where('assignmentId', 'in', chunk).get();
          const docs = snap.docs;

          for (const d of docs) {
            const storagePath = d.data().storagePath as string | undefined;
            if (storagePath) {
              try { await bucket.file(storagePath).delete(); } catch (e: any) {
                if (e.code !== 404) functions.logger.error(`[CancelCleanup] Storage delete failed: ${storagePath}`, e);
              }
            }
          }

          for (let j = 0; j < docs.length; j += BATCH_LIMIT) {
            const batch = db.batch();
            docs.slice(j, j + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          totalDeleted += docs.length;
        }

        // Re-check before project_notes deletion
        if (!(await isCompanyStillCancelled(companyId))) continue;

        for (let i = 0; i < assignmentIds.length; i += 10) {
          const chunk = assignmentIds.slice(i, i + 10);
          for (const col of ['project_notes', 'notifications', 'project_invites'] as const) {
            const snap = await db.collection(col).where('assignmentId', 'in', chunk).get();
            const docs = snap.docs;
            for (let j = 0; j < docs.length; j += BATCH_LIMIT) {
              const batch = db.batch();
              docs.slice(j, j + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
            totalDeleted += docs.length;
          }
        }

        // Re-check before project_note_replies deletion
        if (!(await isCompanyStillCancelled(companyId))) continue;

        for (let i = 0; i < allNoteIds.length; i += 10) {
          const chunk = allNoteIds.slice(i, i + 10);
          const snap = await db.collection('project_note_replies')
            .where('noteId', 'in', chunk)
            .get();
          const docs = snap.docs;
          for (let j = 0; j < docs.length; j += BATCH_LIMIT) {
            const batch = db.batch();
            docs.slice(j, j + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          totalDeleted += docs.length;
        }

        if (assignmentIds.length > 0) {
          functions.logger.log(`[CancelCleanup] Deleted assignment-linked data for ${companyId} (${assignmentIds.length} assignments, ${allNoteIds.length} notes)`);
        }

        // Re-check before main cleanup
        if (!(await isCompanyStillCancelled(companyId))) continue;

        // Main cleanup via companyId (paginated per collection)
        for (const colName of COLLECTIONS_TO_CLEAR) {
          const docs = await paginatedQuery(colName, 'companyId', companyId);

          for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const batch = db.batch();
            const chunk = docs.slice(i, i + BATCH_LIMIT);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          totalDeleted += docs.length;
          if (docs.length > 0) {
            functions.logger.log(`[CancelCleanup] Deleted ${docs.length} docs from ${colName} for ${companyId}`);
          }
        }

        await companyDoc.ref.update({
          subscriptionStatus: 'expired',
          dataCleanupAt: admin.firestore.FieldValue.delete(),
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        functions.logger.log(`[CancelCleanup] Complete: ${totalDeleted} docs deleted, company ${companyId} set to expired`);
        } catch (e) {
          functions.logger.error(`[CancelCleanup] Failed for company ${companyId}:`, e);
        }
      }
    }

    // 2) Existing excess employee cleanup
    const companiesSnap = await db.collection('companies')
      .where('excessCleanupAt', '<', now)
      .limit(50)
      .get();

    if (companiesSnap.empty) {
      functions.logger.log('No excess cleanup jobs due');
      return;
    }

    let totalDeleted = 0;
    const BATCH_LIMIT = 500;

    for (const companyDoc of companiesSnap.docs) {
      const data = companyDoc.data();
      const plan: string = data.subscriptionPlan || '';
      const planLimit = EMP_LIMITS[plan] ?? Infinity;
      const companyId = companyDoc.id;

      const empDocs = await paginatedQuery('employees', 'companyId', companyId);

      // sort manually since not all docs may have createdAt
      empDocs.sort((a, b) => {
        const at = a.data().createdAt?.toMillis?.() || 0;
        const bt = b.data().createdAt?.toMillis?.() || 0;
        return at - bt;
      });

      const excess = empDocs.length - planLimit;
      if (excess > 0) {
        const toDelete = empDocs.slice(-excess);
        for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
          const batch = db.batch();
          toDelete.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        totalDeleted += toDelete.length;
        functions.logger.log(`Deleted ${toDelete.length} excess employees for company ${companyId} (plan: ${plan}, limit: ${planLimit}, had: ${empDocs.length})`);
      } else {
        functions.logger.log(`Company ${companyId} no longer has excess employees (plan: ${plan}, count: ${empDocs.length}, limit: ${planLimit})`);
      }

      await companyDoc.ref.update({
        excessCleanupAt: admin.firestore.FieldValue.delete(),
      });
    }

    functions.logger.log(`Cleanup complete: ${totalDeleted} employees deleted across ${companiesSnap.size} companies`);

    // 3) Retry failed Stripe cancellations (when _stripeCancelFailedAt is set)
    const failedCancelCompanies = await db.collection('companies')
      .where('_stripeCancelFailedAt', '>', admin.firestore.Timestamp.fromDate(new Date(0)))
      .limit(20)
      .get()
      .catch(() => null); // Gracefully handle missing index

    if (failedCancelCompanies && !failedCancelCompanies.empty) {
      for (const companyDoc of failedCancelCompanies.docs) {
        const companyId = companyDoc.id;
        const data = companyDoc.data();
        const subscriptionId = data.stripeSubscriptionId as string | undefined;

        if (!subscriptionId) {
          // No subscription to cancel – just clean up the flag
          await companyDoc.ref.update({
            _stripeCancelFailedAt: admin.firestore.FieldValue.delete(),
            _stripeCancelError: admin.firestore.FieldValue.delete(),
          }).catch(e => functions.logger.warn(`[StripeCancelRetry] Cleanup flag only for ${companyId}:`, e));
          functions.logger.log(`[StripeCancelRetry] No subscription ID for ${companyId}, cleaned up flag`);
          continue;
        }

        try {
          const stripe = getStripe();
          await stripe.subscriptions.cancel(subscriptionId, {
            prorate: true,
            invoice_now: false,
          });
          // Success – clean up the failure flag
          await companyDoc.ref.update({
            _stripeCancelFailedAt: admin.firestore.FieldValue.delete(),
            _stripeCancelError: admin.firestore.FieldValue.delete(),
          }).catch(e => functions.logger.warn(`[StripeCancelRetry] Flag cleanup failed for ${companyId}:`, e));
          functions.logger.log(`[StripeCancelRetry] Successfully cancelled Stripe subscription ${subscriptionId} for ${companyId}`);
        } catch (e: any) {
          if (e.type === 'StripeInvalidRequestError' && e.message?.includes('No such subscription')) {
            // Subscription already deleted in Stripe – clean up our flag
            await companyDoc.ref.update({
              _stripeCancelFailedAt: admin.firestore.FieldValue.delete(),
              _stripeCancelError: admin.firestore.FieldValue.delete(),
            }).catch(err => functions.logger.warn(`[StripeCancelRetry] Flag cleanup (no such sub) for ${companyId}:`, err));
            functions.logger.log(`[StripeCancelRetry] Subscription ${subscriptionId} already gone in Stripe for ${companyId}, cleaned up flag`);
          } else {
            functions.logger.error(`[StripeCancelRetry] Retry failed for company ${companyId} (sub: ${subscriptionId}):`, e.message || e);
          }
        }
      }
    }
  });

// ─── Trial Expiration (täglich) ───
export const expireTrials = functions.pubsub.schedule('every 60 minutes').onRun(async () => {
  const now = new Date();
  const BATCH_LIMIT = 500;
  let expired = 0;
  let totalChecked = 0;
  let lastDoc: admin.firestore.DocumentSnapshot | null = null;

  while (true) {
    let query: admin.firestore.Query = db.collection('companies')
      .where('subscriptionStatus', '==', 'trial')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(100);
    if (lastDoc) query = query.startAfter(lastDoc);
    const companiesSnap = await query.get();
    if (companiesSnap.empty) break;

    totalChecked += companiesSnap.size;
    const toExpire: admin.firestore.DocumentReference[] = [];

    for (const doc of companiesSnap.docs) {
      const data = doc.data();
      if (!data.trialEndsAt) continue;
      const trialEnd = data.trialEndsAt?.toDate ? data.trialEndsAt.toDate() : new Date(data.trialEndsAt);
      if (trialEnd instanceof Date && !isNaN(trialEnd.getTime()) && trialEnd < now) {
        toExpire.push(doc.ref);
        expired++;
      }
    }

    for (let i = 0; i < toExpire.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = toExpire.slice(i, i + BATCH_LIMIT);
      chunk.forEach(ref => batch.update(ref, { subscriptionStatus: 'expired' }));
      await batch.commit();
    }

    lastDoc = companiesSnap.docs[companiesSnap.docs.length - 1];
  }

  functions.logger.log(`[ExpireTrials] ${expired} trials expired (${totalChecked} checked)`);
});
