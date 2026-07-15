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

const PLAN_LABELS_DE: Record<string, string> = { trial: 'Testphase', solo: 'Solo', team: 'Team', business: 'Business' };

async function sendEmail(to: string, subject: string, html: string) {
  const transporter = getSmtp();
  await transporter.sendMail({
    from: `"EarnTrack" <${functions.config().gmail.email}>`,
    to,
    subject,
    html,
  });
}

// Gemeinsames Erscheinungsbild für alle Kunden-E-Mails: helle Karte auf warmem
// Untergrund, kleiner Teal-Punkt statt Farbfläche, Serif-Headline für Charakter.
// `inner` ist beliebiges HTML (Absatz + Button, oder eine Liste bei Digests).
function emailShell(inner: string): string {
  return `<div style="margin:0;background:#f4f2ee;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(28,25,23,0.04),0 12px 32px -16px rgba(28,25,23,0.12)">
      <div style="padding:44px 44px 40px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px">
          <span style="width:7px;height:7px;border-radius:50%;background:#0d9488;display:inline-block"></span>
          <span style="font-size:12px;font-weight:600;letter-spacing:0.08em;color:#78716c;text-transform:uppercase">EarnTrack</span>
        </div>
        ${inner}
      </div>
    </div>
    <p style="text-align:center;color:#a8a29e;font-size:11px;margin-top:24px">EarnTrack &middot; Business Manager</p>
  </div>`;
}

// Standardform für einfache Transaktionsmails: Anrede, Serif-Headline,
// Fließtext, ein CTA-Button, Fallback-Link, Fußnotiz.
function emailBody(opts: { greeting: string; headline: string; bodyHtml: string; ctaText: string; ctaLink: string; footerNote?: string }): string {
  const footer = opts.footerNote || 'Diese E-Mail wurde automatisch von EarnTrack verschickt.';
  return `<p style="font-size:14px;font-weight:600;color:#0d9488;margin:0 0 12px">${esc(opts.greeting)}</p>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:500;color:#1c1917;margin:0 0 18px;line-height:1.4;letter-spacing:-0.01em">${opts.headline}</h1>
    <p style="font-size:14.5px;line-height:1.75;color:#57534e;margin:0 0 30px">${opts.bodyHtml}</p>
    <a href="${opts.ctaLink}" style="display:inline-block;padding:13px 30px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14.5px;letter-spacing:-0.01em">${esc(opts.ctaText)}</a>
    <div style="border-top:1px solid #f0ede8;margin-top:36px;padding-top:24px">
      <p style="font-size:12px;color:#a8a29e;line-height:1.6;margin:0">
        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
        <span style="color:#0d9488;word-break:break-all">${opts.ctaLink}</span>
      </p>
      <p style="font-size:12px;color:#d6d3d1;margin:20px 0 0">${footer}</p>
    </div>`;
}

async function getUserEmail(uid: string): Promise<string | null> {
  try {
    const user = await admin.auth().getUser(uid);
    return user.email || null;
  } catch (e) { functions.logger.error('getUserEmail failed', e); return null; }
}

// ─── Stripe Customer Portal Session ───
export const createPortalSession = functions.runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_MODE', 'SITE_URL'] }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');

  const uid = context.auth.uid;
  const returnUrl = data?.returnUrl || `${SITE_URL}/settings/subscription`;

  const userSnap = await db.collection('users').doc(uid).get();
  const companyId = userSnap.data()?.companyId || uid;
  const companySnap = await db.collection('companies').doc(companyId).get();
  const stripeCustomerId = companySnap.data()?.stripeCustomerId as string | undefined;
  if (!stripeCustomerId) {
    throw new functions.https.HttpsError('not-found', 'Kein Stripe-Kunde gefunden');
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  } catch (err: any) {
    functions.logger.error('Portal session error:', err);
    throw new functions.https.HttpsError('internal', 'Fehler beim Öffnen des Kundenportals');
  }
});

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
                const planLabel = PLAN_LABELS_DE[plan] || plan;
                await sendEmail(email, 'Willkommen bei EarnTrack – Lege dein Passwort fest',
                  emailShell(emailBody({
                    greeting: `Hallo ${esc(email.split('@')[0])},`,
                    headline: 'Willkommen an Bord.',
                    bodyHtml: `Dein <b>${esc(planLabel)}</b>-Abo ist aktiv. Lege jetzt dein Passwort fest, um dich bei EarnTrack anzumelden und direkt loszulegen.`,
                    ctaText: 'Passwort festlegen',
                    ctaLink: link,
                  })));
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

      case 'charge.refunded': {
        const charge = event.data.object as any;
        const refundCustomerId = charge.customer as string;
        if (!refundCustomerId) break;

        const refundProcessedRef = db.collection('_stripe_events').doc(event.id);
        const refundProcessedSnap = await refundProcessedRef.get();
        if (refundProcessedSnap.exists) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          break;
        }

        const refundPaymentsSnap = await db.collection('payment_requests')
          .where('stripeCustomerId', '==', refundCustomerId)
          .get();

        for (const doc of refundPaymentsSnap.docs) {
          const data = doc.data();
          if (!data.companyId) continue;
          const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db.collection('companies').doc(data.companyId).update({
            subscriptionStatus: 'cancelled',
            dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(e => functions.logger.warn('Refund company update failed', e));
          break;
        }

        await refundProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        functions.logger.info(`Charge refunded for customer ${refundCustomerId}`);
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
  'earntrack_solo_monthly': 'solo',
  'earntrack_team_monthly': 'team',
  'earntrack_business_monthly': 'business',
};

function validateRevenueCatSignature(req: functions.https.Request): boolean {
  const secret = functions.config().revenuecat?.webhook_secret;
  if (!secret) {
    functions.logger.warn('[RevenueCat] Webhook secret not configured – set via firebase functions:config:set revenuecat.webhook_secret="..."');
    return false;
  }
  const authHeader = req.headers['authorization'] as string || '';
  const expected = 'Bearer ' + secret;
  // Timing-safe Vergleich verhindert Timing-Angriffe zur Geheimnis-Enumeration
  if (authHeader.length !== expected.length) {
    functions.logger.warn('[RevenueCat] Invalid Authorization header');
    return false;
  }
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (!require('crypto').timingSafeEqual(a, b)) {
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
          return {
            subscriptionStatus: 'cancelled',
            revenuecatCancelReason: cancelReason,
            revenuecatEventId: eventId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        }
        case 'EXPIRATION': {
          const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return {
            subscriptionStatus: 'expired',
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
        case 'REFUND': {
          const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return {
            subscriptionStatus: 'cancelled',
            dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
            revenuecatEventId: eventId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        }
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
  const { action, platform } = data;
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

  // Granulares Event fürs Live-Analytics-Feed & die User-Aktivitäts-Historie —
  // eigener try/catch, damit ein Fehler hier nie die eigentliche Nutzeraktion blockiert
  // (gleiches Prinzip wie das bestehende lautlose Fehlschlagen von logUsage im Client).
  try {
    await db.collection('activity_events').add({
      uid,
      action,
      platform: (platform === 'ios' || platform === 'android') ? platform : 'web',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    functions.logger.error('activity_events write failed', e);
  }

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
        let overdueInvoiceCount = 0;

        for (const a of assignments as any[]) {
          if (settings.emailInvoices) {
            const dueDate = a.invoiceDueDate ? parseDate(a.invoiceDueDate) : null;
            if (dueDate && a.invoiceStatus !== 'paid') {
              const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
              if (diffDays < 0) {
                dueInvoices.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – überfällig seit ${a.invoiceDueDate}`);
                overdueInvoiceCount++;
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
          let inner = `<p style="font-size:14px;font-weight:600;color:#0d9488;margin:0 0 12px">Hallo ${esc(userEmail.split('@')[0])},</p>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;color:#1c1917;margin:0 0 20px;line-height:1.4;letter-spacing:-0.01em">Deine EarnTrack-Erinnerungen</h1>`;

          if (dueInvoices.length > 0) {
            inner += '<h2 style="color:#b45309;font-size:14px;font-weight:600;margin:0 0 8px">Rechnungen</h2>';
            inner += '<ul style="padding-left:20px;color:#57534e;font-size:14px;line-height:1.7;margin:0">' + dueInvoices.join('') + '</ul>';
            inner += `<p style="color:#a8a29e;font-size:13px;margin-top:12px 0 0">Status in EarnTrack aktualisieren: <a href="${SITE_URL}/invoices" style="color:#0d9488">Rechnungen öffnen</a></p>`;
          }

          if (upcomingAssignments.length > 0) {
            inner += '<h2 style="color:#0d9488;font-size:14px;font-weight:600;margin:24px 0 8px">Anstehende Termine</h2>';
            inner += '<ul style="padding-left:20px;color:#57534e;font-size:14px;line-height:1.7;margin:0">' + upcomingAssignments.join('') + '</ul>';
            inner += `<p style="color:#a8a29e;font-size:13px;margin:12px 0 0">Alle Termine ansehen: <a href="${SITE_URL}/assignments" style="color:#0d9488">Termine öffnen</a></p>`;
          }

          inner += `<div style="border-top:1px solid #f0ede8;margin-top:28px;padding-top:20px">
            <p style="font-size:12px;color:#d6d3d1;margin:0">Du erhältst diese E-Mail, weil du Benachrichtigungen in EarnTrack aktiviert hast. <a href="${SITE_URL}/settings/notifications" style="color:#0d9488">Einstellungen ändern</a></p>
          </div>`;

          const html = emailShell(inner);
          await sendEmail(userEmail, `EarnTrack: ${dueInvoices.length > 0 ? 'Rechnungserinnerung' : 'Terminerinnerung'}`, html);
          functions.logger.info(`Email sent to ${userEmail}`);
        }

        // Push zusätzlich zur E-Mail bei überfälligen Rechnungen – eigener try/catch,
        // damit ein Push-Fehler nie die E-Mail-Logik oder andere User im Lauf blockiert.
        // Nur echte Überfälligkeiten (diffDays < 0) lösen die "überfällig"-Push aus,
        // nicht bloß bald fällige (dueInvoices enthält auch die <= 3 Tage-Fälle).
        if (overdueInvoiceCount > 0) {
          try {
            const pushTitle = '💶 Überfällige Rechnung';
            const pushBody = overdueInvoiceCount === 1
              ? 'Eine Rechnung ist überfällig.'
              : `${overdueInvoiceCount} Rechnungen sind überfällig.`;
            await writeNotificationDocs([uid], { type: 'invoice_overdue', title: pushTitle, body: pushBody });
            await sendPushToRecipients([uid], pushTitle, pushBody, token => ({
              to: token,
              title: pushTitle,
              body: pushBody,
              data: { type: 'invoice_overdue' },
            }));
          } catch (pushErr) {
            functions.logger.error(`[checkNotifications] Overdue invoice push failed for ${uid}`, pushErr);
          }
        }

        // Nur einmal täglich (Stunde 8, das Cron läuft stündlich) – vergessene
        // Zeiterfassung und Trial-Ende sollen nicht stündlich erneut feuern.
        if (now.getHours() === 8) {
          const isOwner = userDoc.data().role !== 'employee';

          try {
            const openEntriesSnap = await db.collection('clock_entries')
              .where('userId', '==', uid)
              .where('clockOut', '==', null)
              .limit(20)
              .get();
            const forgottenEntries = openEntriesSnap.docs.filter(d => {
              const clockIn = d.data().clockIn?.toDate ? d.data().clockIn.toDate() : null;
              return clockIn && fmtDate(clockIn) !== today;
            });
            if (forgottenEntries.length > 0) {
              const fTitle = '⏱️ Zeiterfassung vergessen?';
              const fBody = forgottenEntries.length === 1
                ? 'Du hast gestern vergessen, dich auszustempeln.'
                : `Du hast ${forgottenEntries.length} offene Zeiterfassungen von vergangenen Tagen.`;
              await writeNotificationDocs([uid], { type: 'forgotten_clockout', title: fTitle, body: fBody });
              await sendPushToRecipients([uid], fTitle, fBody, token => ({
                to: token,
                title: fTitle,
                body: fBody,
                data: { type: 'forgotten_clockout' },
              }));
            }
          } catch (clockErr) {
            functions.logger.error(`[checkNotifications] Forgotten clock-out check failed for ${uid}`, clockErr);
          }

          if (isOwner) {
            try {
              const companySnap = await db.collection('companies').doc(userDoc.data().companyId || uid).get();
              const companyData = companySnap.data();
              if (companyData?.subscriptionStatus === 'trial' && companyData?.trialEndsAt) {
                const trialEnd = companyData.trialEndsAt.toDate ? companyData.trialEndsAt.toDate() : new Date(companyData.trialEndsAt);
                const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / 86400000);
                if (diffDays === 3 || diffDays === 1) {
                  const tTitle = '⏳ Testphase endet bald';
                  const tBody = diffDays === 1 ? 'Deine Testphase endet morgen.' : `Deine Testphase endet in ${diffDays} Tagen.`;
                  await writeNotificationDocs([uid], { type: 'trial_ending', title: tTitle, body: tBody });
                  await sendPushToRecipients([uid], tTitle, tBody, token => ({
                    to: token,
                    title: tTitle,
                    body: tBody,
                    data: { type: 'trial_ending' },
                  }));
                }
              }
            } catch (trialErr) {
              functions.logger.error(`[checkNotifications] Trial-ending check failed for ${uid}`, trialErr);
            }
          }

          // Wochen-Recap zusätzlich nur montags (getDay() === 1), nur für Owner.
          if (isOwner && now.getDay() === 1) {
            try {
              const weekAgo = new Date(now.getTime() - 7 * 86400000);
              let weekRevenue = 0;
              let weekCount = 0;
              for (const a of assignments as any[]) {
                const aDate = a.datum ? parseDate(a.datum) : null;
                if (!aDate || aDate < weekAgo || aDate >= now) continue;
                weekCount++;
                const materialSum = Array.isArray(a.materialien)
                  ? a.materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0)
                  : 0;
                weekRevenue += parseGermanNumber(a.umsatz) + materialSum;
              }
              if (weekCount > 0) {
                const rTitle = '📊 Deine Woche bei EarnTrack';
                const rBody = `${weekCount} Auftrag${weekCount === 1 ? '' : 'e'}, ${weekRevenue.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€ Umsatz.`;
                await writeNotificationDocs([uid], { type: 'weekly_recap', title: rTitle, body: rBody });
                await sendPushToRecipients([uid], rTitle, rBody, token => ({
                  to: token,
                  title: rTitle,
                  body: rBody,
                  data: { type: 'weekly_recap' },
                }));
              }
            } catch (recapErr) {
              functions.logger.error(`[checkNotifications] Weekly recap failed for ${uid}`, recapErr);
            }
          }
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

// Einfaches Firestore-basiertes Rate-Limit gegen E-Mail-Bombing: max. 1 Mail pro Adresse/Aktion
// innerhalb des Cooldowns. Transaktion verhindert Races bei parallelen Aufrufen. Die Collection
// rate_limits fällt in firestore.rules unter Default-Deny (nur Admin SDK schreibt).
const EMAIL_RATE_LIMIT_MS = 60 * 1000;
async function enforceEmailRateLimit(action: string, email: string): Promise<boolean> {
  const key = `${action}_${email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_')}`;
  const ref = db.collection('rate_limits').doc(key);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const last = snap.exists ? (snap.data()?.lastSentAt || 0) : 0;
      if (now - last < EMAIL_RATE_LIMIT_MS) return false;
      tx.set(ref, { lastSentAt: now, action });
      return true;
    });
  } catch (e) {
    functions.logger.error('enforceEmailRateLimit error:', e);
    return true; // fail-open: ein Limiter-Fehler darf legitime Mails nicht blockieren
  }
}

// Branded Bestätigungsmail statt der nackten Firebase-Auth-Standardmail.
// Erzeugt den Verifizierungslink über den Admin SDK und verschickt ihn über
// den bestehenden Gmail-Transport mit dem gleichen Look wie die anderen Mails.
export const sendVerificationEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');
  const email = context.auth.token.email;
  if (!email) throw new functions.https.HttpsError('failed-precondition', 'Keine E-Mail-Adresse hinterlegt');
  if (!(await enforceEmailRateLimit('verify', email))) {
    throw new functions.https.HttpsError('resource-exhausted', 'Bitte warte einen Moment, bevor du eine weitere E-Mail anforderst.');
  }

  const continueUrl = (data && typeof data.continueUrl === 'string' && data.continueUrl) || `${SITE_URL}/email-verified`;
  const displayName = esc(email.split('@')[0]);
  // Aktuell nur 'trial' im Einsatz (Direktkauf-Nutzer sind bereits verifiziert
  // und bekommen stattdessen die Passwort-festlegen-Mail unten) — Parameter
  // trotzdem vorgesehen, falls ein zweiter Registrierungsweg dazukommt.
  const isPaid = !!(data && data.context === 'paid');

  try {
    const link = await admin.auth().generateEmailVerificationLink(email, {
      url: continueUrl,
      handleCodeInApp: true,
    });
    const html = emailShell(emailBody({
      greeting: `Hallo ${displayName},`,
      headline: 'Schön, dass du bei EarnTrack dabei bist.',
      bodyHtml: isPaid
        ? 'Bestätige kurz deine E-Mail-Adresse, um dein Konto zu aktivieren und direkt mit EarnTrack loszulegen.'
        : 'Bestätige kurz deine E-Mail-Adresse, um dein Konto zu aktivieren und deine 14-tägige Testphase zu starten. Wir freuen uns, dich auf dem Weg zu einem besser organisierten Business zu begleiten.',
      ctaText: 'E-Mail-Adresse bestätigen',
      ctaLink: link,
      footerNote: 'Diese E-Mail wurde angefordert, weil du dich mit dieser Adresse bei EarnTrack registriert hast. War das nicht du? Ignoriere sie einfach.',
    }));
    await sendEmail(email, 'Bestätige deine E-Mail-Adresse – EarnTrack', html);
    return { success: true };
  } catch (e: any) {
    functions.logger.error('sendVerificationEmail failed:', e);
    throw new functions.https.HttpsError('internal', 'E-Mail konnte nicht gesendet werden');
  }
});

// Passwort-zurücksetzen-Mail — Gegenstück zu sendVerificationEmail, aber ohne
// Auth-Pflicht (Nutzer hat das Passwort ja gerade vergessen). Gibt bewusst
// immer { success: true } zurück, auch wenn die Adresse nicht existiert, um
// keine Rückschlüsse auf vorhandene Konten zuzulassen (wie Firebase es selbst tut).
export const sendPasswordResetEmail = functions.https.onCall(async (data) => {
  const email = data && typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) throw new functions.https.HttpsError('invalid-argument', 'E-Mail-Adresse erforderlich');

  // Rate-Limit: still { success: true } zurückgeben (keine Enumeration), aber keine Mail senden.
  if (!(await enforceEmailRateLimit('pwreset', email))) {
    return { success: true };
  }

  const continueUrl = (data && typeof data.continueUrl === 'string' && data.continueUrl) || `${SITE_URL}/email-verified`;
  const displayName = esc(email.split('@')[0]);

  try {
    const link = await admin.auth().generatePasswordResetLink(email, {
      url: continueUrl,
      handleCodeInApp: true,
    });
    const html = emailShell(emailBody({
      greeting: `Hallo ${displayName},`,
      headline: 'Setze dein neues Passwort.',
      bodyHtml: 'Du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort zu vergeben.',
      ctaText: 'Neues Passwort festlegen',
      ctaLink: link,
      footerNote: 'Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.',
    }));
    await sendEmail(email, 'Setze dein neues Passwort – EarnTrack', html);
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') {
      functions.logger.error('sendPasswordResetEmail failed:', e);
    }
  }
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
        recipientId: uid,
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
        recipientId: uid,
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

async function sendExpoPush(entries: { uid: string; token: string }[], buildMessage: (token: string) => Record<string, unknown>): Promise<void> {
  const stale: { uid: string; token: string }[] = [];
  for (let i = 0; i < entries.length; i += PUSH_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + PUSH_CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk.map(e => buildMessage(e.token))),
      });
      if (!res.ok) {
        functions.logger.warn(`Expo push chunk status ${res.status}`);
      } else {
        const result: any = await res.json();
        if (result.data) {
          for (let j = 0; j < result.data.length; j++) {
            const ticket = result.data[j];
            if (ticket?.status === 'error') {
              const errType = ticket.details?.error || ticket.message || 'unknown';
              functions.logger.warn(`Expo push ticket error for token ${chunk[j]?.token?.substring(0, 16)}...: ${errType}`);
              if (ticket.details?.error === 'DeviceNotRegistered') stale.push(chunk[j]);
            }
          }
        }
      }
    } catch (err) {
      functions.logger.error('Expo push chunk failed', err);
    }
  }
  // Tote Expo-Tokens entfernen – aber nur, wenn seither kein neuer Token registriert wurde
  // (Race-Schutz: nicht den frisch gesetzten Token eines Neu-Logins löschen).
  if (stale.length > 0) {
    await Promise.allSettled(stale.map(async ({ uid, token }) => {
      const ref = db.collection('users').doc(uid);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.data()?.expoPushToken === token) {
          tx.update(ref, { expoPushToken: admin.firestore.FieldValue.delete() });
        }
      }).catch(() => { /* ignorieren */ });
    }));
    functions.logger.info(`Expo: ${stale.length} stale token(s) removed`);
  }
}

/**
 * Sendet FCM-Push-Benachrichtigungen an Web-Nutzer über Firebase Cloud Messaging.
 * Wird zusammen mit sendExpoPush verwendet, um sowohl Mobile- als auch Web-Nutzer zu erreichen.
 */
async function sendFcmPush(
  entries: { uid: string; token: string }[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (entries.length === 0) return;
  const tokens = entries.map(e => e.token);
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
    // Tote/abgelaufene Tokens aus dem jeweiligen User-Dokument entfernen,
    // damit sie nicht dauerhaft fehlschlagen und Kosten/Logs verursachen.
    const stale: { uid: string; token: string }[] = [];
    response.responses.forEach((r, i) => {
      const code = (r as any).error?.code || '';
      if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
        stale.push(entries[i]);
      }
    });
    if (stale.length > 0) {
      await Promise.allSettled(stale.map(({ uid, token }) =>
        db.collection('users').doc(uid).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
        }).catch(() => { /* Feld evtl. nicht vorhanden – ignorieren */ }),
      ));
      functions.logger.info(`FCM: ${stale.length} stale token(s) removed`);
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
  const expoEntries: { uid: string; token: string }[] = [];
  const fcmEntries: { uid: string; token: string }[] = [];
  const seenExpo = new Set<string>();
  const seenFcm = new Set<string>();

  for (const uid of uids) {
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.data();
      if (!userData) continue;
      if (userData.expoPushToken && !seenExpo.has(userData.expoPushToken)) {
        seenExpo.add(userData.expoPushToken);
        expoEntries.push({ uid, token: userData.expoPushToken });
      }
      // Alle registrierten Geräte des Users berücksichtigen (Multi-Device),
      // mit Fallback auf das Legacy-Einzelfeld fcmToken. Duplikate herausfiltern.
      const tokens: string[] = Array.isArray(userData.fcmTokens)
        ? userData.fcmTokens
        : (userData.fcmToken ? [userData.fcmToken] : []);
      for (const t of tokens) {
        if (t && !seenFcm.has(t)) { seenFcm.add(t); fcmEntries.push({ uid, token: t }); }
      }
    } catch (e) {
      functions.logger.warn(`Token fetch failed for ${uid}`, e);
    }
  }

  const sends: Promise<void>[] = [];
  if (expoEntries.length > 0) {
    sends.push(sendExpoPush(expoEntries, buildExpoMessage));
  }
  if (fcmEntries.length > 0) {
    sends.push(sendFcmPush(fcmEntries, title, body, fcmData));
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
      .where('subscriptionStatus', 'in', ['trial', 'trialing'])
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

// Ändert das Passwort eines Mitarbeiters via Admin SDK.
// Nur der Company-Owner (companyId == auth.uid) darf diese Funktion aufrufen.
// Ersetzt den unsicheren client-seitigen Firebase REST API Aufruf mit gespeichertem Klartext-Passwort.
export const changeEmployeePassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Nicht authentifiziert');
  }

  const { employeeId, employeeUid, newPassword } = data || {};

  if (!employeeId || !employeeUid || !newPassword) {
    throw new functions.https.HttpsError('invalid-argument', 'employeeId, employeeUid und newPassword sind erforderlich');
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new functions.https.HttpsError('invalid-argument', 'Passwort muss mindestens 8 Zeichen haben');
  }

  // Mitarbeiter-Dokument laden und Eigentümerschaft prüfen
  const empDoc = await db.collection('employees').doc(employeeId).get();
  if (!empDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Mitarbeiter nicht gefunden');
  }

  const empData = empDoc.data()!;
  if (empData.companyId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Keine Berechtigung für diesen Mitarbeiter');
  }

  // Passwort ändern via Admin SDK (kein Klartext-Passwort nötig)
  await admin.auth().updateUser(employeeUid, { password: newPassword });

  functions.logger.log(`[changeEmployeePassword] Password changed for employee ${employeeId} by company ${context.auth.uid}`);
  return { success: true };
});

const EMPLOYEE_EMAIL_DOMAIN = 'earntrack.de';

// Legt einen Mitarbeiter-Account serverseitig via Admin SDK an. Ersetzt den ungesicherten
// Client-Direktaufruf an die Identity-Toolkit-REST-API (accounts:signUp). Erzwingt Owner-Auth,
// E-Mail-Domain, Passwort-Policy und das Employee-Limit des Abo-Plans serverseitig.
export const createEmployee = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Nicht authentifiziert');
  }
  const ownerUid = context.auth.uid;
  const { email, password, displayName, assignmentId, stundenlohn, existingEmpDocId } = data || {};

  // Eingabevalidierung (Trust-Boundary)
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!emailNorm || !emailNorm.endsWith(`@${EMPLOYEE_EMAIL_DOMAIN}`)) {
    throw new functions.https.HttpsError('invalid-argument', 'Ungültige Mitarbeiter-E-Mail');
  }
  if (typeof password !== 'string' || password.length < 8
    || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*]/.test(password)) {
    throw new functions.https.HttpsError('invalid-argument', 'Passwort erfüllt die Anforderungen nicht');
  }
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', 'Name erforderlich');
  }
  const rate = Math.max(0, Number(stundenlohn) || 0);

  // Employee-Limit des Plans serverseitig prüfen (Client-Check ist umgehbar).
  const companySnap = await db.collection('companies').doc(ownerUid).get();
  const plan: string = companySnap.exists ? (companySnap.data()?.subscriptionPlan || 'trial') : 'trial';
  const limit = plan === 'solo' ? 2 : plan === 'team' ? 5 : Infinity; // trial/business = unbegrenzt
  const empCountSnap = await db.collection('employees').where('companyId', '==', ownerUid).count().get();
  if (empCountSnap.data().count >= limit) {
    throw new functions.https.HttpsError('resource-exhausted', 'Employee-Limit des Plans erreicht');
  }

  // Auth-Account anlegen
  let employeeUid: string;
  try {
    const userRecord = await admin.auth().createUser({
      email: emailNorm,
      password,
      emailVerified: true,
      displayName: name,
    });
    employeeUid = userRecord.uid;
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'Dieser Benutzername ist bereits vergeben');
    }
    functions.logger.error('[createEmployee] createUser failed:', e);
    throw new functions.https.HttpsError('internal', 'Mitarbeiter konnte nicht erstellt werden');
  }

  // Firestore-Dokumente anlegen; bei Fehler den Auth-Account wieder entfernen (kein Waisen-Account).
  try {
    await db.collection('users').doc(employeeUid).set({
      email: emailNorm,
      displayName: name,
      role: 'employee',
      linkedToProject: assignmentId || null,
      linkedToProjects: assignmentId ? [assignmentId] : [],
      linkedBy: ownerUid,
      companyId: ownerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      emailVerified: true,
    });

    if (assignmentId) {
      await db.collection('project_members').doc(assignmentId).set({
        [employeeUid]: {
          uid: employeeUid,
          displayName: name,
          email: emailNorm,
          role: 'employee',
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }

    if (existingEmpDocId) {
      await db.collection('employees').doc(existingEmpDocId).update({
        email: emailNorm,
        needsSetup: true,
        hasCredentials: true,
      });
    } else {
      await db.collection('employees').add({
        companyId: ownerUid,
        name,
        stundenlohn: rate,
        gesamtstunden: 0,
        notizen: '',
        imageUrl: '',
        email: emailNorm,
        needsSetup: true,
        hasCredentials: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (e: any) {
    try { await admin.auth().deleteUser(employeeUid); } catch (_) {}
    functions.logger.error('[createEmployee] Firestore write failed, rolled back auth user:', e);
    throw new functions.https.HttpsError('internal', 'Mitarbeiter konnte nicht erstellt werden');
  }

  functions.logger.log(`[createEmployee] Employee ${employeeUid} created by company ${ownerUid}`);
  return { success: true, employeeUid, email: emailNorm };
});

// ─── IAP Receipt-Validierung ───────────────────────────────────────────────
// Validiert einen App-Store-/Play-Kauf server-seitig und schreibt das Entitlement per Admin SDK.
// Nötig, weil Clients subscription-Felder laut firestore.rules nicht schreiben dürfen.
//
// Konfiguration (vor Release setzen):
//   - iOS:     firebase functions:config:set appstore.shared_secret="<App-Store Connect Shared Secret>"
//   - Android: Das Functions-Service-Account in der Play Console unter "API-Zugriff" verknüpfen
//              und die Berechtigung "Finanzdaten / Bestellungen und Abos verwalten" erteilen.
const IAP_PLAN_FROM_PRODUCT: Record<string, string> = {
  earntrack_solo_monthly: 'solo',
  earntrack_team_monthly: 'team',
  earntrack_business_monthly: 'business',
};
const ANDROID_PACKAGE_NAME = 'com.earntrack.app';

async function verifyAppleReceipt(receiptData: string, sharedSecret: string): Promise<{ valid: boolean; productId?: string; expiresAt?: number }> {
  const body = JSON.stringify({ 'receipt-data': receiptData, password: sharedSecret, 'exclude-old-transactions': true });
  const call = async (url: string) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return res.json() as Promise<any>;
  };
  // Immer zuerst Production, bei 21007 (Sandbox-Receipt) auf Sandbox ausweichen (Apple-Empfehlung).
  let json = await call('https://buy.itunes.apple.com/verifyReceipt');
  if (json.status === 21007) json = await call('https://sandbox.itunes.apple.com/verifyReceipt');
  if (json.status !== 0) return { valid: false };

  const infos: any[] = json.latest_receipt_info || [];
  let best: { productId: string; exp: number } | null = null;
  for (const it of infos) {
    const exp = parseInt(it.expires_date_ms || '0', 10);
    if (exp > Date.now() && (!best || exp > best.exp)) best = { productId: it.product_id, exp };
  }
  return best ? { valid: true, productId: best.productId, expiresAt: best.exp } : { valid: false };
}

async function verifyGoogleSubscription(purchaseToken: string, productId: string): Promise<{ valid: boolean; productId?: string; expiresAt?: number }> {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    functions.logger.warn('[verifyReceipt] Google Play API error', { status: res.status });
    return { valid: false };
  }
  const json = await res.json() as any;
  const exp = parseInt(json.expiryTimeMillis || '0', 10);
  // paymentState: 0 = pending (noch nicht bezahlt) → nicht aktivieren
  if (json.paymentState === 0 || exp <= Date.now()) return { valid: false };
  return { valid: true, productId, expiresAt: exp };
}

async function writeNotificationDocs(
  uids: string[],
  payload: { type: string; title: string; body: string; assignmentId?: string },
): Promise<void> {
  const batch = db.batch();
  for (const uid of uids) {
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      recipientId: uid,
      ...payload,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export const verifyAppStoreReceipt = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Nicht authentifiziert');
  }
  const { platform, receiptData, productId, companyId, transactionId } = data || {};

  // Owner darf ausschließlich das eigene Company-Entitlement setzen.
  if (companyId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Keine Berechtigung für diese Company');
  }
  if (typeof receiptData !== 'string' || typeof productId !== 'string' || !transactionId) {
    throw new functions.https.HttpsError('invalid-argument', 'receiptData, productId, transactionId erforderlich');
  }
  if (!IAP_PLAN_FROM_PRODUCT[productId]) {
    throw new functions.https.HttpsError('invalid-argument', 'Unbekanntes Produkt');
  }

  let result: { valid: boolean; productId?: string; expiresAt?: number };
  try {
    if (platform === 'ios') {
      const secret = process.env.APPSTORE_SHARED_SECRET || functions.config().appstore?.shared_secret;
      if (!secret) {
        functions.logger.error('[verifyReceipt] APPSTORE_SHARED_SECRET not configured');
        throw new functions.https.HttpsError('failed-precondition', 'App-Store-Validierung nicht konfiguriert');
      }
      result = await verifyAppleReceipt(receiptData, secret);
    } else if (platform === 'android') {
      result = await verifyGoogleSubscription(receiptData, productId);
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Unbekannte Plattform');
    }
  } catch (e: any) {
    if (e instanceof functions.https.HttpsError) throw e;
    functions.logger.error('[verifyReceipt] validation failed:', e);
    return { valid: false };
  }

  if (!result.valid) {
    functions.logger.log(`[verifyReceipt] invalid/expired receipt for company ${companyId}`);
    return { valid: false };
  }

  const finalPlan = IAP_PLAN_FROM_PRODUCT[result.productId || productId] || IAP_PLAN_FROM_PRODUCT[productId];
  await db.collection('companies').doc(companyId).set({
    subscriptionStatus: 'active',
    subscriptionPlan: finalPlan,
    subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
    nextBillingDate: result.expiresAt ? admin.firestore.Timestamp.fromMillis(result.expiresAt) : null,
    trialEndsAt: admin.firestore.FieldValue.delete(),
    dataCleanupAt: admin.firestore.FieldValue.delete(),
    excessCleanupAt: null,
    lastVerifiedTransactionId: transactionId,
    lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Bei Downgrade zu viele Mitarbeiter → 7-Tage-Frist zum Aufräumen setzen (wie im alten Client-Flow).
  const limit = finalPlan === 'solo' ? 2 : finalPlan === 'team' ? 5 : Infinity;
  if (limit !== Infinity) {
    const cnt = await db.collection('employees').where('companyId', '==', companyId).count().get();
    if (cnt.data().count > limit) {
      await db.collection('companies').doc(companyId).set({
        excessCleanupAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }, { merge: true });
    }
  }

  functions.logger.log(`[verifyReceipt] company ${companyId} activated on plan ${finalPlan}`);
  return { valid: true, plan: finalPlan };
});

/**
 * Sendet einen Push an den Firmen-Owner, wenn ein Lagerartikel unter die
 * Mindestmenge fällt. Feuert nur beim Übergang (vorher >= min, jetzt < min),
 * nicht bei jedem weiteren Update, solange der Bestand niedrig bleibt.
 */
export const onInventoryLowStock = functions.firestore
  .document('inventory_items/{itemId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.companyId) return;

    const min = Number(after.minQuantity) || 0;
    if (min <= 0) return;

    const beforeQty = Number(before?.quantity) || 0;
    const afterQty = Number(after.quantity) || 0;
    const crossedBelowMin = beforeQty >= min && afterQty < min;
    if (!crossedBelowMin) return;

    const ownerId = after.companyId;
    const itemName = after.name || 'Artikel';
    const unit = after.unit || 'Stk';
    const title = '📦 Nachbestellen';
    const body = `${itemName}: ${afterQty} ${unit} auf Lager (unter Mindestbestand ${min})`;

    try {
      await writeNotificationDocs([ownerId], { type: 'low_stock', title, body });
      await sendPushToRecipients([ownerId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'low_stock', itemId: context.params.itemId },
      }));
      functions.logger.info(`Low-stock push sent for item ${context.params.itemId} to ${ownerId}`);
    } catch (err) {
      functions.logger.error(`[onInventoryLowStock] Push failed for item ${context.params.itemId}`, err);
    }
  });

// Deutsche Zahlformate (Komma-Dezimal, € / Leerzeichen) robust parsen – gleiche
// Logik wie in der Mobile-App (calculateRevenue), hier für Cloud Functions neu
// nachgebaut, da kein gemeinsamer Code zwischen den beiden Projekten existiert.
function parseGermanNumber(v: any): number {
  const raw = String(v ?? '0').replace(/[€\s]/g, '').trim();
  if (!raw) return 0;
  if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
  if (raw.includes(',')) return parseFloat(raw.replace(',', '.')) || 0;
  return parseFloat(raw) || 0;
}

/**
 * Sendet einen Push an den Firmen-Owner, wenn ein Auftrag auf "Abgeschlossen"
 * gesetzt wird und die Marge (inkl. verknüpftem Lager-Material) unter 10 %
 * liegt (Grade D/F, gleiche Grenze wie calculateAssignmentProfitScore in der
 * Mobile-App). Feuert nur beim Übergang zu "Abgeschlossen", nicht bei jedem
 * weiteren Update eines bereits abgeschlossenen Auftrags.
 */
export const onAssignmentLowMargin = functions.firestore
  .document('assignments/{assignmentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.companyId) return;
    if (before?.status === 'Abgeschlossen' || after.status !== 'Abgeschlossen') return;

    const hours = parseGermanNumber(after.stunden);
    const rate = parseGermanNumber(after.stundenlohn);
    const materialien = Array.isArray(after.materialien) ? after.materialien : [];
    const materialSum = materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
    const materialCost = materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.costPrice != null ? m.costPrice : m.unitPrice) || 0), 0);

    const revenue = parseGermanNumber(after.umsatz) + materialSum;
    const cost = hours * rate + materialCost;
    if (revenue <= 0) return;
    const margin = ((revenue - cost) / revenue) * 100;
    if (margin >= 10) return;

    const ownerId = after.companyId;
    const kunde = after.kunde || after.projekt || 'Auftrag';
    const title = '📉 Niedrige Marge';
    const body = `${kunde}: nur ${margin.toFixed(0)}% Marge bei diesem Auftrag.`;

    try {
      await writeNotificationDocs([ownerId], { type: 'low_margin', title, body, assignmentId: context.params.assignmentId });
      await sendPushToRecipients([ownerId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'low_margin', assignmentId: context.params.assignmentId },
      }));
      functions.logger.info(`Low-margin push sent for assignment ${context.params.assignmentId} to ${ownerId}`);
    } catch (err) {
      functions.logger.error(`[onAssignmentLowMargin] Push failed for assignment ${context.params.assignmentId}`, err);
    }
  });
