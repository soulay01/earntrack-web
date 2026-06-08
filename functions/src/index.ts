import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { getStorage } from 'firebase-admin/storage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

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

function getStripe(): any {
  const testMode = isTestMode();
  const secret = trimVal(testMode
    ? (process.env.STRIPE_TEST_SECRET_KEY || functions.config().stripe?.test_secret || '')
    : (process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret || ''));
  if (!secret) throw new Error(`Stripe ${testMode ? 'test' : 'live'} secret not configured`);
  return new (require('stripe'))(secret, {
    apiVersion: '2026-04-22.dahlia',
  });
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

function parseDate(str: string | undefined | null): Date | null {
  if (!str) return null;
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

  const uid = context.auth.uid;
  const userEmail = context.auth.token.email || '';

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      client_reference_id: uid,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { uid, plan: planId || planName || 'unknown' },
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
        let uid = session.metadata?.uid || session.client_reference_id;
        const email = session.customer_email || session.metadata?.email || '';
        const plan = session.metadata?.plan || 'unknown';
        const stripeCustomerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Public checkout: client_reference_id is the email, not a Firebase UID
        if (uid && uid.includes('@')) uid = null;

        // If no uid was provided (e.g., public checkout from landing page),
        // look up or create the user by email
        if (!uid && email) {
          try {
            const userRecord = await admin.auth().getUserByEmail(email);
            uid = userRecord.uid;
          } catch (e) {
            functions.logger.info(`User not found by email ${email}, creating new account`, e);
            const newUser = await admin.auth().createUser({
              email,
              emailVerified: true,
              password: Math.random().toString(36).slice(2) + 'Ab1!',
            });
            uid = newUser.uid;

            // Send password reset email so user can set their password (non-blocking)
            if (!isTestMode()) {
              admin.auth().generatePasswordResetLink(email).then(link => {
                sendEmail(email, 'Willkommen bei EarnTrack – Lege dein Passwort fest',
                  `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
                    <div style="background:linear-gradient(135deg,#0d9488,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center">
                      <h1 style="color:#fff;margin:0;font-size:20px">Willkommen bei EarnTrack!</h1>
                    </div>
                    <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                      <p style="color:#334155">Dein Abonnement ist aktiv. Lege jetzt dein Passwort fest, um dich anzumelden.</p>
                      <a href="${link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Passwort festlegen</a>
                      <p style="color:#64748b;font-size:12px;margin-top:16px">Dein Plan: <b>${plan}</b></p>
                    </div>
                  </div>`).catch(e => functions.logger.error('Welcome email failed:', e));
              }).catch(e => functions.logger.error('Password reset link failed:', e));
            }
            functions.logger.info(`Created new user ${uid} from Stripe checkout (${email})`);
          }
        }

        if (!uid) { res.status(200).json({ received: true }); return; }

        const companyId = uid;

        await db.collection('payment_requests').doc(uid).set({
          companyId: uid,
          userEmail: email,
          plan,
          status: 'approved',
          stripeCustomerId,
          stripeSubscriptionId: subscriptionId,
          amount: session.amount_total,
          currency: session.currency,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection('users').doc(uid).set({
          email,
          companyId: uid,
          role: 'owner',
          stripeCustomerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        await db.collection('companies').doc(companyId).set({
          subscriptionStatus: 'active',
          subscriptionPlan: plan,
          stripeCustomerId,
          stripeSubscriptionId: subscriptionId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          dataCleanupAt: admin.firestore.FieldValue.delete(),
          retentionCouponId: admin.firestore.FieldValue.delete(),
        }, { merge: true });

        // Check employee limit and set cleanup timestamp if exceeded
        const EMP_LIMITS: Record<string, number> = { solo: 2, team: 5, business: Infinity };
        const planLimit = EMP_LIMITS[plan] ?? Infinity;
        if (planLimit !== Infinity) {
          const empSnap = await db.collection('employees').where('companyId', '==', companyId).get();
          if (empSnap.size > planLimit) {
            const cleanupAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await db.collection('companies').doc(companyId).update({
              excessEmployeeCleanupAt: admin.firestore.Timestamp.fromDate(cleanupAt),
            });
          }
        }

        if (!isTestMode()) {
          sendEmail(
            ADMIN_EMAIL,
            '💰 Neue Zahlung erhalten – EarnTrack',
            `<p>Ein neuer Kunde hat EarnTrack abonniert:</p>
             <ul>
               <li><b>E-Mail:</b> ${email}</li>
               <li><b>Plan:</b> ${plan}</li>
               <li><b>Betrag:</b> ${session.amount_total ? (session.amount_total / 100).toFixed(2) + ' ' + session.currency?.toUpperCase() : 'N/A'}</li>
               <li><b>Stripe Customer ID:</b> ${stripeCustomerId}</li>
             </ul>`
          ).catch(e => functions.logger.error('Admin payment email failed:', e));
        }
        functions.logger.info(`Payment completed for ${email} (${plan})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;

        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', customerId)
          .get();

        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (data.stripeSubscriptionId && data.stripeSubscriptionId !== subscription.id) continue;
          await doc.ref.update({ status: 'canceled', canceledAt: admin.firestore.FieldValue.serverTimestamp() }).catch(e => functions.logger.warn('Cancel payment update failed', e));
          if (data.companyId) {
            const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await db.collection('companies').doc(data.companyId).update({
              subscriptionStatus: 'cancelled',
              dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(e => functions.logger.warn('Cancel company update failed', e));
          }
        }

        functions.logger.info(`Subscription cancelled for customer ${customerId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;

        functions.logger.info(`Invoice payment succeeded for customer ${customerId}`);

        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', customerId)
          .get();

        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (data.stripeSubscriptionId && invoice.subscription && data.stripeSubscriptionId !== invoice.subscription) continue;
          if (data.companyId) {
            await db.collection('companies').doc(data.companyId).update({
              subscriptionStatus: 'active',
              invoicePaymentFailedAt: admin.firestore.FieldValue.delete(),
              invoicePaymentAttempts: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(e => functions.logger.warn('Invoice payment success update failed', e));
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const custId = subscription.customer as string;
        const subStatus = subscription.status as string; // active, past_due, canceled, etc.

        functions.logger.info(`Subscription updated for customer ${custId}: status=${subStatus}`);

        if (subStatus === 'active' || subStatus === 'past_due') {
          const subPaymentsSnap = await db.collection('payment_requests')
            .where('stripeCustomerId', '==', custId)
            .get();

          for (const doc of subPaymentsSnap.docs) {
            const data = doc.data();
            if (data.stripeSubscriptionId && data.stripeSubscriptionId !== subscription.id) continue;
            if (data.companyId) {
              const updateData: Record<string, any> = {
                subscriptionStatus: subStatus,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
              if (subStatus === 'active') {
                updateData.invoicePaymentFailedAt = admin.firestore.FieldValue.delete();
                updateData.invoicePaymentAttempts = admin.firestore.FieldValue.delete();
              }
              await db.collection('companies').doc(data.companyId).update(updateData).catch(e => functions.logger.warn('Subscription update failed', e));
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const attemptCount = invoice.attempt_count || 1;
        const nextAttempt = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null;

        functions.logger.warn(`Invoice payment failed for customer ${customerId} (attempt ${attemptCount})`);

        const paymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', customerId)
          .get();

        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (data.stripeSubscriptionId && invoice.subscription && data.stripeSubscriptionId !== invoice.subscription) continue;
          if (data.companyId) {
            await db.collection('companies').doc(data.companyId).update({
              subscriptionStatus: 'past_due',
              invoicePaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
              invoicePaymentAttempts: attemptCount,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(e => functions.logger.warn('Payment failed company update', e));

            // Benachrichtige den Admin bei erstmaligem Fehlschlag
            if (attemptCount <= 2) {
              const userEmail = data.userEmail || '';
              const nextAttemptStr = nextAttempt ? nextAttempt.toLocaleString('de-DE') : 'unbekannt';
              sendEmail(
                ADMIN_EMAIL,
                '⚠️ Zahlung fehlgeschlagen – EarnTrack',
                `<p>Eine Abo-Zahlung ist fehlgeschlagen:</p>
                 <ul>
                   <li><b>Kunde:</b> ${userEmail}</li>
                   <li><b>Versuch:</b> ${attemptCount}. Mal</li>
                   <li><b>Nächster Versuch:</b> ${nextAttemptStr}</li>
                   <li><b>Stripe Customer ID:</b> ${customerId}</li>
                 </ul>`
              ).catch(e => functions.logger.error('Payment failed admin email error:', e));
            }
          }
        }

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

export const revenuecatWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

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

    functions.logger.info(`[RevenueCat] Event: ${eventType} for user ${appUserId}, product: ${productId}`);

    const plan = REVENUECAT_PRODUCT_PLANS[productId as keyof typeof REVENUECAT_PRODUCT_PLANS] || null;
    const companyRef = db.collection('companies').doc(appUserId);

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION': {
        const updateData: Record<string, any> = {
          subscriptionStatus: 'active',
          revenuecatProductId: productId,
          revenuecatEventId: eventId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (plan) updateData.subscriptionPlan = plan;
        await companyRef.set(updateData, { merge: true });

        functions.logger.info(`[RevenueCat] Subscription activated for user ${appUserId} (${plan})`);
        break;
      }

      case 'CANCELLATION': {
        const cancelReason = event.event?.cancel_reason || 'unknown';
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await companyRef.set({
          subscriptionStatus: 'cancelled',
          revenuecatCancelReason: cancelReason,
          dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
          revenuecatEventId: eventId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        functions.logger.info(`[RevenueCat] Subscription cancelled for user ${appUserId} (reason: ${cancelReason})`);
        break;
      }

      case 'BILLING_ISSUE':
        await companyRef.set({
          subscriptionStatus: 'past_due',
          revenuecatEventId: eventId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        functions.logger.warn(`[RevenueCat] Billing issue for user ${appUserId}`);
        break;

      case 'PRODUCT_CHANGE': {
        const productChangeData: Record<string, any> = {
          revenuecatProductId: productId,
          revenuecatEventId: eventId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (plan) productChangeData.subscriptionPlan = plan;
        await companyRef.set(productChangeData, { merge: true });

        functions.logger.info(`[RevenueCat] Product changed for user ${appUserId} to ${plan}`);
        break;
      }

      case 'SUBSCRIPTION_PAUSED':
        await companyRef.set({
          subscriptionStatus: 'paused',
          revenuecatEventId: eventId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        functions.logger.info(`[RevenueCat] Subscription paused for user ${appUserId}`);
        break;

      default:
        functions.logger.info(`[RevenueCat] Unhandled event type: ${eventType} for user ${appUserId}`);
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
          <p style="font-size:15px;color:#334155"><b>${data.name || 'Unbekannt'}</b> hat sich für die 14-Tage-Demo angemeldet.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Name</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${data.name || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Unternehmen</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${data.companyName || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">E-Mail</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${data.email || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Telefon</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${data.phone || '-'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Adresse</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${data.address || '-'}</td></tr>
          </table>
          <p style="margin-top:16px;color:#64748b;font-size:13px">
            Trial läuft bis: ${data.trialEndsAt?.toDate?.()?.toLocaleDateString('de-DE') || 'N/A'}<br>
            Quelle: ${data.source || 'Webseite'}
          </p>
          <a href="https://console.firebase.google.com/project/earntrack-new/firestore/data/~2Fdemo_signups~2F${uid}"
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

export const checkNotifications = functions.pubsub.schedule('every 60 minutes').onRun(async () => {
  const now = new Date();
  const today = fmtDate(now);
  const tomorrow = fmtDate(new Date(now.getTime() + 86400000));

  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) return;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const settings = userDoc.data().notifications;
    if (!settings) continue;

    const userEmail = await getUserEmail(uid);
    if (!userEmail) continue;

    const assignmentsSnap = await db.collection('assignments')
      .where('companyId', '==', userDoc.data().companyId)
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
            dueInvoices.push(`<li><b>${a.projekt || 'Unbenannt'}</b> – überfällig seit ${a.invoiceDueDate}`);
          } else if (diffDays <= 3) {
            dueInvoices.push(`<li><b>${a.projekt || 'Unbenannt'}</b> – fällig am ${a.invoiceDueDate}`);
          }
        }
      }

      if (settings.emailReports) {
        const aDate = a.datum ? parseDate(a.datum) : null;
        if (aDate) {
          const dStr = fmtDate(aDate);
          if (dStr === today || dStr === tomorrow) {
            upcomingAssignments.push(`<li><b>${a.projekt || 'Unbenannt'}</b> – ${a.kunde || ''} am ${dStr}`);
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

      try {
        await sendEmail(userEmail, `EarnTrack: ${dueInvoices.length > 0 ? 'Rechnungserinnerung' : 'Terminerinnerung'}`, html);
        functions.logger.info(`Email sent to ${userEmail}`);
      } catch (err) {
        functions.logger.error(`Failed to send email to ${userEmail}`, err);
      }
    }
  }
});

export const sendTestEmail = functions.https.onCall(async () => {
  const transporter = getSmtp();
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

    const tokens: string[] = [];
    for (const uid of recipientUids) {
      try {
        const userSnap = await db.collection('users').doc(uid).get();
        const token = userSnap.data()?.expoPushToken;
        if (token) tokens.push(token);
      } catch (e) { functions.logger.error('Push token fetch failed (onReplyCreated)', e); }
    }

    if (tokens.length === 0) return;

    const body = `${reply.userName || 'Jemand'}: ${(reply.text || '').substring(0, 50)}`;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(tokens.map(token => ({
          to: token,
          title: '💬 Neue Antwort',
          body,
          data: { noteId: reply.noteId, assignmentId: noteData.assignmentId, type: 'note_reply' },
        }))),
      });
      functions.logger.info(`Push sent for reply ${context.params.replyId} to ${tokens.length} device(s)`);
    } catch (err) {
      functions.logger.error('Expo push failed', err);
    }
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

    const tokens: string[] = [];
    for (const uid of recipientUids) {
      try {
        const userSnap = await db.collection('users').doc(uid).get();
        const token = userSnap.data()?.expoPushToken;
        if (token) tokens.push(token);
      } catch (e) { functions.logger.error('Push token fetch failed (onNoteCreated)', e); }
    }

    if (tokens.length === 0) return;

    const displayName = note.userName || note.userEmail || 'Mitarbeiter';
    const isPinned = note.isPinned || false;
    const title = isPinned ? '📌 Neue Ankündigung' : '📝 Neue Notiz';
    const body = `${displayName}: ${(note.text || note.note || '').substring(0, 50)}`;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(tokens.map(token => ({
          to: token,
          title,
          body,
          data: { assignmentId: note.assignmentId, type: isPinned ? 'pinned_note' : 'note' },
        }))),
      });
      functions.logger.info(`Push sent for note ${context.params.noteId} to ${tokens.length} device(s)`);
    } catch (err) {
      functions.logger.error('Expo push failed', err);
    }
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

    const assignmentSnap = await db.collection('assignments').doc(entry.assignmentId).get();
    if (!assignmentSnap.exists) return;

    const ownerId = assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId || null;
    if (!ownerId || ownerId === entry.userId) return;

    const userName = entry.userName || 'Mitarbeiter';
    const isManualEntry = !!entry.clockOut;
    const isClockOut = isManualEntry;
    let title: string, body: string;
    if (isManualEntry) {
      title = '⏰ Arbeitszeit eingetragen';
      body = `${userName} hat Arbeitszeit eingetragen`;
    } else {
      title = '▶️ Eingestempelt';
      body = `${userName} hat sich eingestempelt`;
    }

    const recipientUids = new Set<string>([ownerId]);

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

    // Expo Push-Benachrichtigungen
    const tokens: string[] = [];
    for (const uid of recipientUids) {
      try {
        const userSnap = await db.collection('users').doc(uid).get();
        const token = userSnap.data()?.expoPushToken;
        if (token) tokens.push(token);
      } catch (e) { functions.logger.error('Push token fetch failed (onClockEntryCreated)', e); }
    }

    if (tokens.length === 0) return;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(tokens.map(token => ({
          to: token,
          title,
          body,
          data: { assignmentId: entry.assignmentId, type: 'clock_entry' },
        }))),
      });
      functions.logger.info(`Push sent for clock entry ${context.params.entryId} to ${tokens.length} device(s)`);
    } catch (err) {
      functions.logger.error('Expo push failed', err);
    }
  });

// ─── Cleanup excess employees after plan downgrade ───
export const cleanupExcessEmployees = functions.runWith({ timeoutSeconds: 540 }).pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // 1) Post-cancellation data cleanup (7-day grace period)
    const canceledCompanies = await db.collection('companies')
      .where('dataCleanupAt', '<', now)
      .get();

    if (!canceledCompanies.empty) {
      const COLLECTIONS_TO_CLEAR = [
        'employees', 'customers', 'assignments', 'invoices', 'estimates',
        'clock_entries', 'payment_requests',
      ];
      const BATCH_LIMIT = 500;

      for (const companyDoc of canceledCompanies.docs) {
        const companyId = companyDoc.id;
        const companyData = companyDoc.data();

        if (companyData.subscriptionStatus === 'active') {
          functions.logger.warn(`[CancelCleanup] Skipping company ${companyId} – subscription is active`);
          await companyDoc.ref.update({
            dataCleanupAt: admin.firestore.FieldValue.delete(),
            retentionCouponId: admin.firestore.FieldValue.delete(),
          });
          continue;
        }

        let totalDeleted = 0;

        // Get all assignment IDs before deleting assignments
        const assignmentsSnap = await db.collection('assignments')
          .where('companyId', '==', companyId)
          .get();
        const assignmentIds = assignmentsSnap.docs.map(d => d.id);

        // Collect all note IDs from project_notes for reply cleanup
        const allNoteIds: string[] = [];
        for (let i = 0; i < assignmentIds.length; i += 10) {
          const chunk = assignmentIds.slice(i, i + 10);
          const notesSnap = await db.collection('project_notes')
            .where('assignmentId', 'in', chunk)
            .get();
          notesSnap.docs.forEach(d => allNoteIds.push(d.id));
        }

        // Delete assignment-linked collections (no companyId field)
        // project_members: doc key = assignmentId
        for (const aId of assignmentIds) {
          await db.collection('project_members').doc(aId).delete().catch(e => functions.logger.warn('Project member delete failed', e));
          totalDeleted++;
        }

        // project_photos: delete storage files + Firestore docs
        for (let i = 0; i < assignmentIds.length; i += 10) {
          const chunk = assignmentIds.slice(i, i + 10);
          const snap = await db.collection('project_photos').where('assignmentId', 'in', chunk).get();
          const docs = snap.docs;

          const bucket = getStorage().bucket();
          for (const d of docs) {
            const storagePath = d.data().storagePath as string | undefined;
            if (storagePath) {
              bucket.file(storagePath).delete().catch((e: any) => {
                if (e.code !== 404) functions.logger.error(`[CancelCleanup] Storage delete failed: ${storagePath}`, e);
              });
            }
          }

          for (let j = 0; j < docs.length; j += BATCH_LIMIT) {
            const batch = db.batch();
            docs.slice(j, j + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          totalDeleted += docs.length;
        }

        // project_notes, notifications, project_invites: by assignmentId (Firestore only)
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

        // project_note_replies: by noteId (collected above)
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

        // Re-check company status (might have been reactivated by checkout during cleanup)
        const recheckCompany = await companyDoc.ref.get();
        if (recheckCompany.data()?.subscriptionStatus === 'active') {
          functions.logger.warn(`[CancelCleanup] Company ${companyId} was reactivated during cleanup – aborting`);
          await companyDoc.ref.update({
            dataCleanupAt: admin.firestore.FieldValue.delete(),
            retentionCouponId: admin.firestore.FieldValue.delete(),
          });
          continue;
        }

        // Main cleanup via companyId
        for (const colName of COLLECTIONS_TO_CLEAR) {
          const snap = await db.collection(colName)
            .where('companyId', '==', companyId)
            .get();

          const docs = snap.docs;
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
      }
    }

    // 2) Existing excess employee cleanup
    const companiesSnap = await db.collection('companies')
      .where('excessEmployeeCleanupAt', '<', now)
      .get();

    if (companiesSnap.empty) {
      functions.logger.log('No excess cleanup jobs due');
      return;
    }

    const EMP_LIMITS: Record<string, number> = { solo: 2, team: 5, business: Infinity };
    let totalDeleted = 0;

    for (const companyDoc of companiesSnap.docs) {
      const data = companyDoc.data();
      const plan: string = data.subscriptionPlan || '';
      const planLimit = EMP_LIMITS[plan] ?? Infinity;
      const companyId = companyDoc.id;

      const empSnap = await db.collection('employees')
        .where('companyId', '==', companyId)
        .get();

      // sort manually since not all docs may have createdAt
      empSnap.docs.sort((a, b) => {
        const at = a.data().createdAt?.toMillis?.() || 0;
        const bt = b.data().createdAt?.toMillis?.() || 0;
        return at - bt;
      });

      const excess = empSnap.size - planLimit;
      if (excess > 0) {
        const toDelete = empSnap.docs.slice(-excess);
        const batch = db.batch();
        toDelete.forEach(d => batch.delete(d.ref));
        await batch.commit();
        totalDeleted += toDelete.length;
        functions.logger.log(`Deleted ${toDelete.length} excess employees for company ${companyId} (plan: ${plan}, limit: ${planLimit}, had: ${empSnap.size})`);
      } else {
        functions.logger.log(`Company ${companyId} no longer has excess employees (plan: ${plan}, count: ${empSnap.size}, limit: ${planLimit})`);
      }

      await companyDoc.ref.update({
        excessEmployeeCleanupAt: admin.firestore.FieldValue.delete(),
      });
    }

    functions.logger.log(`Cleanup complete: ${totalDeleted} employees deleted across ${companiesSnap.size} companies`);
  });

// ─── Trial Expiration (täglich) ───
export const expireTrials = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const now = new Date();
  const companiesSnap = await db.collection('companies')
    .where('subscriptionStatus', '==', 'trial')
    .get();

  let expired = 0;
  const batch = db.batch();
  for (const doc of companiesSnap.docs) {
    const data = doc.data();
    if (data.trialEndsAt?.toDate?.() && data.trialEndsAt.toDate() < now) {
      batch.update(doc.ref, { subscriptionStatus: 'expired' });
      expired++;
    }
  }
  if (expired > 0) await batch.commit();
  functions.logger.log(`[ExpireTrials] ${expired} trials expired (${companiesSnap.size} checked)`);
});
