import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

admin.initializeApp();

// functions.config() throws in 2nd Gen (Cloud Run based) containers — this file is
// shared by both 1st Gen and 2nd Gen functions, so every top-level config read must
// survive that throw instead of crashing the container before it can boot.
function safeFunctionsConfig(): Record<string, any> {
  try {
    return functions.config();
  } catch {
    return {};
  }
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || safeFunctionsConfig().admin?.email || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || safeFunctionsConfig().contact?.email || 'info@earntrack.de';
const SITE_URL = process.env.SITE_URL || safeFunctionsConfig().site?.url || 'https://earntrack.de';

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
  const email = functions.config().mail?.email;
  const password = functions.config().mail?.password;
  if (!email || !password) throw new Error('Mail config missing. Run: firebase functions:config:set mail.email="info@earntrack.de" mail.password="..."');
  return nodemailer.createTransport({
    host: 'smtp.zoho.eu',
    port: 465,
    secure: true,
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
    from: `"EarnTrack" <${functions.config().mail.email}>`,
    to,
    subject,
    html,
  });
}

function getTelegramConfig(opts?: { tokenEnv?: string; chatIdEnv?: string }): { token: string; chatId: string } | null {
  const token = trimVal(process.env[opts?.tokenEnv || 'TELEGRAM_BOT_TOKEN'] || safeFunctionsConfig().telegram?.token);
  const chatId = trimVal(process.env[opts?.chatIdEnv || 'TELEGRAM_CHAT_ID'] || safeFunctionsConfig().telegram?.chat_id);
  if (!token || !chatId) return null;
  return { token, chatId };
}

async function sendTelegramMessage(text: string, opts?: { tokenEnv?: string; chatIdEnv?: string }): Promise<void> {
  const config = getTelegramConfig(opts);
  if (!config) {
    functions.logger.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — skipping notification');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    throw new Error(`Telegram API error ${res.status}: ${await res.text()}`);
  }
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
export const createPortalSession = functions.runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_MODE', 'SITE_URL'] }).region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
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

// ─── Stripe Webhook ───
/**
 * Erkennt, ob eine Firma gleichzeitig über Stripe und über einen App-Store
 * bezahlt, und meldet das.
 *
 * Die Web-Seite blockiert einen solchen Doppelkauf bereits (create-checkout).
 * Umgekehrt geht das nicht: Ein Store-Kauf ist abgeschlossen, bevor unser
 * Server davon erfährt — den Zugang zu verweigern träfe einen Kunden, der
 * gerade bezahlt hat. Deshalb hier nur markieren und melden, damit eine Seite
 * von Hand aufgelöst werden kann.
 */
async function flagDualSubscriptionIfAny(companyId: string, incoming: 'iap' | 'stripe'): Promise<void> {
  try {
    const snap = await db.collection('companies').doc(companyId).get();
    if (!snap.exists) return;
    const data = snap.data()!;
    if (data.subscriptionStatus !== 'active') return;

    const hasStripe = Boolean(data.stripeSubscriptionId);
    const hasIap = Boolean(data.iapPlatform || data.appleOriginalTransactionId || data.revenuecatProductId);
    const conflict = incoming === 'iap' ? hasStripe : hasIap;
    if (!conflict) return;

    await snap.ref.update({
      dualSubscriptionDetectedAt: admin.firestore.FieldValue.serverTimestamp(),
      dualSubscriptionSource: incoming,
    }).catch(() => undefined);

    functions.logger.error(
      `DUAL SUBSCRIPTION: company ${companyId} pays via Stripe and app store (incoming: ${incoming})`,
    );

    if (ADMIN_EMAIL) {
      await sendEmail(
        ADMIN_EMAIL,
        '⚠️ Doppeltes Abo erkannt – EarnTrack',
        `<p>Die Firma <b>${esc(companyId)}</b> hat gleichzeitig ein Stripe-Abo und ein Store-Abo.</p>
         <p>Auslöser: ${incoming === 'iap' ? 'Kauf im App/Play Store' : 'Kauf über die Web-App'}.</p>
         <p>Bitte eine der beiden Seiten erstatten oder kündigen, sonst zahlt der Kunde doppelt.</p>`,
      ).catch(e => functions.logger.warn('Dual-subscription alert mail failed', e));
    }
  } catch (e) {
    functions.logger.warn('flagDualSubscriptionIfAny failed', e);
  }
}

/**
 * Ermittelt die Firma zu einer Stripe-Subscription.
 *
 * Primärquelle bleibt `payment_requests` — dort wird die Zuordnung beim
 * Checkout geschrieben. Fehlt der Eintrag oder ist er veraltet (manuell
 * angelegte Abos, Datenmigration, gelöschtes Dokument), liefen Status-Updates
 * bisher ins Leere: der Kunde blieb dann z. B. dauerhaft auf 'active', obwohl
 * Stripe längst gekündigt hat. Deshalb wird zusätzlich direkt in `companies`
 * gesucht — dort stehen stripeSubscriptionId und stripeCustomerId ebenfalls.
 *
 * Beide Felder sind einzelfeld-indiziert, ein Composite-Index ist nicht nötig.
 */
async function resolveCompanyId(
  customerId: string,
  subscriptionId: string | null,
): Promise<string | null> {
  if (customerId) {
    const paymentsSnap = await db.collection('payment_requests')
      .where('stripeCustomerId', '==', customerId)
      .get();
    for (const doc of paymentsSnap.docs) {
      const data = doc.data();
      // Bei bekannter Subscription nur den passenden Eintrag akzeptieren,
      // sonst würde ein abgelöstes Alt-Abo die falsche Firma treffen.
      if (subscriptionId && data.stripeSubscriptionId !== subscriptionId) continue;
      if (data.companyId) return data.companyId as string;
    }
  }

  if (subscriptionId) {
    const bySub = await db.collection('companies')
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    if (!bySub.empty) {
      functions.logger.warn(`resolveCompanyId: fell back to companies via subscription ${subscriptionId}`);
      return bySub.docs[0].id;
    }

    // Bewusst KEIN Rückfall auf die Kunden-ID, sobald eine Subscription bekannt
    // ist: Nach einem Tarifwechsel wird das alte Abo gekündigt, während das neue
    // bereits läuft. Ein Treffer allein über den Kunden würde dann die Firma
    // wegen des Alt-Abos als gekündigt markieren, obwohl sie zahlt.
    functions.logger.info(`resolveCompanyId: no company for subscription ${subscriptionId} – likely a replaced subscription, ignoring`);
    return null;
  }

  if (customerId) {
    const byCustomer = await db.collection('companies')
      .where('stripeCustomerId', '==', customerId)
      .limit(1)
      .get();
    if (!byCustomer.empty) {
      functions.logger.warn(`resolveCompanyId: fell back to companies via customer ${customerId}`);
      return byCustomer.docs[0].id;
    }
  }

  functions.logger.error(`resolveCompanyId: no company for customer ${customerId} / subscription ${subscriptionId}`);
  return null;
}

export const stripeWebhook = functions.runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET_KEY', 'STRIPE_TEST_MODE', 'SITE_URL', 'ADMIN_EMAIL'] }).region('us-central1', 'europe-west1').https.onRequest(async (req, res) => {
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

        for (const doc of paymentsSnap.docs) {
          const data = doc.data();
          if (!data.stripeSubscriptionId || data.stripeSubscriptionId !== subscription.id) continue;
          await doc.ref.update({ status: 'canceled', canceledAt: admin.firestore.FieldValue.serverTimestamp() }).catch(e => functions.logger.warn('Cancel payment update failed', e));
        }

        const cancelCompanyId = await resolveCompanyId(customerId, subId);
        if (cancelCompanyId) {
          // Jetzt endet der Vertrag tatsächlich — erst ab hier läuft die
          // 7-tägige Export-Frist aus AGB § 7.
          const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db.collection('companies').doc(cancelCompanyId).update({
            subscriptionStatus: 'cancelled',
            dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
            cancelAtPeriodEnd: admin.firestore.FieldValue.delete(),
            subscriptionEndsAt: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(e => functions.logger.warn('Cancel company update failed', e));
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

        // Eine zum Periodenende vorgemerkte Kündigung lässt den Stripe-Status
        // auf 'active' — das Abo läuft ja noch. Dieses Flag unterscheidet
        // "läuft normal" von "läuft aus", damit die Reaktivierungs-Logik
        // unten die Kündigung nicht versehentlich zurücknimmt.
        const willCancel = subscription.cancel_at_period_end === true;
        const cancelAt: number | null = typeof subscription.cancel_at === 'number'
          ? subscription.cancel_at
          : subscription.items?.data?.[0]?.current_period_end ?? null;

        const subCompanyId = await resolveCompanyId(custId, subscription.id);
        if (subCompanyId) {
          {
            const updateData: Record<string, any> = {
              subscriptionStatus: mappedStatus,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (mappedStatus === 'active') {
              updateData.invoicePaymentFailedAt = admin.firestore.FieldValue.delete();
              updateData.invoicePaymentAttempts = admin.firestore.FieldValue.delete();

              if (willCancel) {
                // Gekündigt, läuft aber noch: Zugriff bleibt, die Löschfrist
                // startet erst mit dem deleted-Event. Der Retention-Coupon
                // muss erhalten bleiben, sonst greift das Rückholangebot ins Leere.
                updateData.cancelAtPeriodEnd = true;
                if (cancelAt) {
                  updateData.subscriptionEndsAt = admin.firestore.Timestamp.fromMillis(cancelAt * 1000);
                }
              } else {
                // Echte Reaktivierung (oder Kündigung zurückgenommen).
                updateData.dataCleanupAt = admin.firestore.FieldValue.delete();
                updateData.retentionCouponId = admin.firestore.FieldValue.delete();
                updateData.cancelAtPeriodEnd = admin.firestore.FieldValue.delete();
                updateData.subscriptionEndsAt = admin.firestore.FieldValue.delete();
              }
            }
            await db.collection('companies').doc(subCompanyId).update(updateData)
              .catch(e => functions.logger.warn('Subscription updated: company update failed', e));
          }
        }

        await subUpdProcessedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type }, { merge: true });
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as any;
        const refundCustomerId = charge.customer as string;
        if (!refundCustomerId) break;

        // Stripe feuert dieses Event auch bei Teilerstattungen. Nur eine
        // vollständige Erstattung beendet das Abo — eine Kulanzgutschrift von
        // ein paar Euro darf weder den Zugang sperren noch die Löschung der
        // Betriebsdaten auslösen.
        const refunded = typeof charge.amount_refunded === 'number' ? charge.amount_refunded : 0;
        const chargedTotal = typeof charge.amount === 'number' ? charge.amount : 0;
        if (chargedTotal <= 0 || refunded < chargedTotal) {
          functions.logger.info(
            `Partial refund for customer ${refundCustomerId} (${refunded}/${chargedTotal}) – subscription untouched`,
          );
          break;
        }

        const refundProcessedRef = db.collection('_stripe_events').doc(event.id);
        const refundProcessedSnap = await refundProcessedRef.get();
        if (refundProcessedSnap.exists) {
          functions.logger.info(`Stripe event ${event.id} already processed, skipping`);
          break;
        }

        // Eine Erstattung hängt an einem Charge, nicht an einer Subscription —
        // hier ist die Kunden-ID die einzige verfügbare Zuordnung.
        const refundCompanyId = await resolveCompanyId(refundCustomerId, null);
        if (refundCompanyId) {
          const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db.collection('companies').doc(refundCompanyId).update({
            subscriptionStatus: 'cancelled',
            dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
            cancelAtPeriodEnd: admin.firestore.FieldValue.delete(),
            subscriptionEndsAt: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(e => functions.logger.warn('Refund company update failed', e));
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

    // Nach dem Aktivieren prüfen, ob parallel ein Stripe-Abo läuft.
    if (eventType === 'INITIAL_PURCHASE' || eventType === 'UNCANCELLATION') {
      await flagDualSubscriptionIfAny(appUserId, 'iap');
    }

    res.json({ received: true });
  } catch (err) {
    functions.logger.error('[RevenueCat] Webhook handler error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── Demo-Signup Benachrichtigung ───
// Nutzt eigene TELEGRAM_DEMO_*-Secrets (Demo-Bot), damit die Benachrichtigung
// nicht über den Feedback-Bot läuft (dessen Token als env-var eingebacken ist).
export const onDemoSignup = functions.runWith({ secrets: ['TELEGRAM_DEMO_BOT_TOKEN', 'TELEGRAM_DEMO_CHAT_ID'] }).region('europe-west1').firestore
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

    const sourceLabel: Record<string, string> = {
      website: 'Website',
      website_social: 'Website (Social-Login)',
      mobile_app: 'Mobile App',
    };
    const source = sourceLabel[data.source] || data.source || 'Unbekannt';
    const text = `🎉 Neue Demo-Anmeldung – EarnTrack\n\n` +
      `👤 ${data.name || 'Unbekannt'}\n` +
      `🏢 ${data.companyName || '-'}\n` +
      `📧 ${data.email || '-'}\n` +
      `📱 ${data.phone || '-'}\n` +
      `📍 ${data.address || '-'}\n` +
      `Quelle: ${source}`;

    try {
      await sendTelegramMessage(text, { tokenEnv: 'TELEGRAM_DEMO_BOT_TOKEN', chatIdEnv: 'TELEGRAM_DEMO_CHAT_ID' });
      functions.logger.info(`Demo signup telegram sent for ${data.email || uid}`);
    } catch (err) {
      functions.logger.error('Failed to send demo signup telegram', err);
    }
  });

// ─── Feedback-Benachrichtigung (Telegram) ───
// 2nd Gen (Eventarc), weil die Firestore-DB in der eur3-Multiregion liegt —
// 1st Gen Firestore-Trigger unterstützen das nicht für neu angelegte Trigger.
export const onFeedbackCreated = onDocumentCreated(
  { document: 'feedback/{feedbackId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { feedbackId } = event.params;

    const text = `🗣️ Neues Feedback\n\n` +
      `Kategorie: ${data.category || 'Unbekannt'}\n` +
      `Von: ${data.userEmail || 'anonym'}\n` +
      `Plattform: ${data.platform || 'unbekannt'}\n\n` +
      `${data.message || ''}\n\n` +
      // Die echte App läuft auf app.earntrack.de, nicht auf der SITE_URL-Domain (die
      // an anderer Stelle für Marketing-/E-Mail-Links verwendet wird).
      `https://app.earntrack.de/analytics/feedback`;

    try {
      await sendTelegramMessage(text);
      functions.logger.info(`Telegram notification sent for feedback ${feedbackId}`);
    } catch (err) {
      functions.logger.error('Failed to send Telegram feedback notification', err);
    }

    if (CONTACT_EMAIL) {
      const inner = `<p style="font-size:14px;font-weight:600;color:#0d9488;margin:0 0 16px">Neue Kontaktanfrage / Feedback</p>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px">` +
        `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Kategorie</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.category || 'Unbekannt')}</td></tr>` +
        `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Von</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.userEmail || 'anonym')}</td></tr>` +
        `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Plattform</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(data.platform || 'unbekannt')}</td></tr>` +
        `<tr><td style="padding:8px;color:#64748b;vertical-align:top">Nachricht</td><td style="padding:8px;font-weight:600">${esc(data.message || '').replace(/\n/g, '<br/>')}</td></tr>` +
        `</table>`;
      const html = emailShell(inner);
      try {
        await sendEmail(CONTACT_EMAIL, '📬 Kontaktanfrage / Feedback – EarnTrack', html);
        functions.logger.info(`Contact email sent for feedback ${feedbackId}`);
      } catch (err) {
        functions.logger.error('Failed to send contact email', err);
      }
    }
  },
);

// ─── Usage Log (tägliche Nutzung tracken) ───
export const logUsage = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
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

// ─── Store Downloads Sync ───
// Tägliche Downloadzahlen von App Store Connect & Google Play für den Downloads-Tab in
// /analytics. Läuft bewusst inert (loggt nur "nicht konfiguriert"), solange die
// Store-API-Zugangsdaten fehlen — siehe docs/superpowers/specs/2026-08-06-analytics-redesign-design.md.
// ponytail: kein echter API-Call implementiert, keine Credentials vorhanden. Upgrade: die
// Sales-&-Trends-Report-Abfrage (App Store Connect) und die Reporting API (Google Play)
// hier einhängen, sobald der Nutzer die untenstehenden Secrets gesetzt hat.
// Apple veröffentlicht den Sales Report für einen Tag erst am Folgetag —
// "heute" abfragen liefert nie Daten, siehe developer.apple.com/help/app-store-connect/
// reference/sales-and-trends-reports-availability.
function isoYesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

async function writeStoreDownloads(platform: 'ios' | 'android', date: string, downloads: number): Promise<void> {
  try {
    await db.collection('store_downloads').doc(`${platform}_${date}`).set({ date, platform, downloads }, { merge: true })
  } catch (e) {
    functions.logger.error(`store_downloads write failed for ${platform}`, e)
  }
}

// JWS ES256 braucht die rohe r||s-Signatur (64 Byte), nicht die ASN.1-DER-Kodierung,
// die crypto.sign standardmäßig liefert — "ieee-p1363" schaltet genau das um.
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function generateAppStoreConnectToken(keyId: string, issuerId: string, privateKey: string): string {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${base64url(signature)}`
}

// Product Type Identifiers, die einen echten Erst-Download zählen (nicht Update,
// Re-Download oder In-App-Kauf) — siehe developer.apple.com/help/app-store-connect/
// reference/reporting/product-type-identifiers.
const IOS_DOWNLOAD_PRODUCT_TYPES = new Set(['1', '1-B', 'F1-B', '1E', '1EP', '1EU', '1F', '1T', 'F1'])

async function fetchIosDownloads(): Promise<number | null> {
  const keyId = process.env.APPSTORE_CONNECT_KEY_ID || safeFunctionsConfig().appstore_connect?.key_id
  const issuerId = process.env.APPSTORE_CONNECT_ISSUER_ID || safeFunctionsConfig().appstore_connect?.issuer_id
  const privateKey = process.env.APPSTORE_CONNECT_PRIVATE_KEY || safeFunctionsConfig().appstore_connect?.private_key
  const vendorNumber = process.env.APPSTORE_CONNECT_VENDOR_NUMBER || safeFunctionsConfig().appstore_connect?.vendor_number
  if (!keyId || !issuerId || !privateKey || !vendorNumber) {
    functions.logger.info('syncStoreDownloads: App Store Connect nicht konfiguriert, überspringe iOS')
    return null
  }

  const reportDate = isoYesterday()
  const token = generateAppStoreConnectToken(keyId, issuerId, privateKey)
  const url = `https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportSubType]=SUMMARY&filter[reportType]=SALES&filter[vendorNumber]=${vendorNumber}&filter[reportDate]=${reportDate}`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } })
  if (res.status === 404) {
    // Kein Report für den Tag (z. B. keine Verkäufe/Downloads) — 0 ist hier ein echter Wert, kein Fehler.
    functions.logger.info(`syncStoreDownloads: kein iOS-Report für ${reportDate} (404, vermutlich 0 Downloads)`)
    return 0
  }
  if (!res.ok) {
    throw new Error(`App Store Connect API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  }

  const gzipped = Buffer.from(await res.arrayBuffer())
  const tsv = zlib.gunzipSync(gzipped).toString('utf-8')
  const lines = tsv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return 0

  const header = lines[0].split('\t')
  const unitsIdx = header.indexOf('Units')
  const typeIdx = header.indexOf('Product Type Identifier')
  if (unitsIdx === -1 || typeIdx === -1) {
    throw new Error(`Unerwartetes Sales-Report-Format, Spalten: ${header.join(', ')}`)
  }

  let total = 0
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (!IOS_DOWNLOAD_PRODUCT_TYPES.has(cols[typeIdx])) continue
    total += parseInt(cols[unitsIdx], 10) || 0
  }
  return total
}

async function fetchAndroidDownloads(): Promise<number | null> {
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || safeFunctionsConfig().google_play?.service_account_json
  if (!serviceAccountJson) {
    functions.logger.info('syncStoreDownloads: Google Play nicht konfiguriert, überspringe Android')
    return null
  }
  functions.logger.warn('syncStoreDownloads: Google Play Zugangsdaten gesetzt, aber der Report-Abruf ist noch nicht implementiert')
  return null
}

export const syncStoreDownloads = functions.runWith({
  timeoutSeconds: 120,
  memory: '256MB',
  // GOOGLE_PLAY_SERVICE_ACCOUNT_JSON fehlt hier bewusst — Firebase verlangt, dass jedes
  // gebundene Secret schon existiert, und das ist noch nicht eingerichtet. Wieder
  // eintragen, sobald `firebase functions:secrets:set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
  // gelaufen ist; bis dahin bleibt fetchAndroidDownloads() korrekt "nicht konfiguriert".
  secrets: ['APPSTORE_CONNECT_KEY_ID', 'APPSTORE_CONNECT_ISSUER_ID', 'APPSTORE_CONNECT_PRIVATE_KEY', 'APPSTORE_CONNECT_VENDOR_NUMBER'],
}).region('europe-west1').pubsub.schedule('every 24 hours').onRun(async () => {
  // Store-Reports sind immer rückwirkend für den Vortag — "heute" gibt es nie Daten für.
  const date = isoYesterday()
  // Promise.allSettled (not Promise.all) — a rejected fetch for one platform must not
  // discard an already-resolved result for the other, and must not overwrite the old
  // value on the failing platform (see docs/superpowers/specs/2026-08-06-analytics-redesign-design.md).
  const [iosResult, androidResult] = await Promise.allSettled([fetchIosDownloads(), fetchAndroidDownloads()])

  if (iosResult.status === 'fulfilled') {
    if (iosResult.value !== null) await writeStoreDownloads('ios', date, iosResult.value)
  } else {
    functions.logger.error('syncStoreDownloads: iOS fetch failed', iosResult.reason)
  }

  if (androidResult.status === 'fulfilled') {
    if (androidResult.value !== null) await writeStoreDownloads('android', date, androidResult.value)
  } else {
    functions.logger.error('syncStoreDownloads: Android fetch failed', androidResult.reason)
  }
});

export const checkNotifications = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).region('europe-west1').pubsub.schedule('every 60 minutes').onRun(async () => {
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
        // Gate auf Stunde 8: das Cron läuft stündlich, ohne dieses Gate kam der Push
        // bis zu 24x/Tag, solange die Rechnung offen blieb.
        if (overdueInvoiceCount > 0 && now.getHours() === 8) {
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

export const sendTestEmail = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');
  const transporter = getSmtp();
  await transporter.sendMail({
    from: `"EarnTrack" <${functions.config().mail.email}>`,
    to: functions.config().mail.email,
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
export const sendVerificationEmail = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
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

// Erlaubte Ziele für Auth-E-Mail-Links (CWE-640). Ohne Allowlist könnte ein Angreifer eine
// beliebige continueUrl (eigene Phishing-Seite) in den Reset-Link einschleusen und so den
// oobCode abgreifen, bevor das Opfer den Link öffnet → Kontoübernahme. Fallback bei ungültiger
// URL ist der Default, kein Fehler – so bleibt die Funktion auch für alte Clients stabil.
const ALLOWED_CONTINUE_HOSTS = new Set(['app.earntrack.de', 'earntrack.de', 'www.earntrack.de', 'localhost']);
function safeContinueUrl(provided: unknown): string {
  const fallback = `${SITE_URL}/email-verified`;
  if (typeof provided !== 'string' || !provided) return fallback;
  try {
    const u = new URL(provided);
    if (!ALLOWED_CONTINUE_HOSTS.has(u.hostname)) return fallback;
    if (u.hostname !== 'localhost' && u.protocol !== 'https:') return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

// Passwort-zurücksetzen-Mail — Gegenstück zu sendVerificationEmail, aber ohne
// Auth-Pflicht (Nutzer hat das Passwort ja gerade vergessen). Gibt bewusst
// immer { success: true } zurück, auch wenn die Adresse nicht existiert, um
// keine Rückschlüsse auf vorhandene Konten zuzulassen (wie Firebase es selbst tut).
export const sendPasswordResetEmail = functions.region('us-central1', 'europe-west1').https.onCall(async (data) => {
  const email = data && typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) throw new functions.https.HttpsError('invalid-argument', 'E-Mail-Adresse erforderlich');

  // Rate-Limit: still { success: true } zurückgeben (keine Enumeration), aber keine Mail senden.
  if (!(await enforceEmailRateLimit('pwreset', email))) {
    return { success: true };
  }

  const continueUrl = safeContinueUrl(data && data.continueUrl);
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

/**
 * Schreibt In-App-Benachrichtigungen (Firestore `notifications`) für eine Liste
 * von Empfängern. Die Docs sind die Single Source of Truth für alle Badges in
 * der Mobile-App – jeder Push MUSS ein passendes Doc haben, sonst zeigt die App
 * eine Zahl ohne Nachricht (oder umgekehrt).
 */
async function writeNotificationDocs(
  uids: string[],
  payload: { type: string; title: string; body: string; assignmentId?: string; targetId?: string; estimateId?: string; customerId?: string },
): Promise<void> {
  if (uids.length === 0) return;
  const batch = db.batch();
  for (const uid of uids) {
    batch.set(db.collection('notifications').doc(), {
      recipientId: uid,
      ...payload,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Erzeugt serverseitig einen kryptographisch zufälligen Einladungscode (6 Zeichen aus
 * einem 32er-Alphabet = 30 Bit) und legt das Invite-Dokument an. Ersetzt die frühere
 * clientseitige Generierung via Math.random (CWE-338: vorhersagbare Codes) samt dem
 * getDoc-Existenzcheck, der ein Enumeration-Orakel für fremde Einladungen war.
 * Kollisionen werden transaktional ausgeschlossen.
 */
export const createInviteCode = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Nicht authentifiziert');
  }
  const uid = context.auth.uid;
  const assignmentId = String(data?.assignmentId || '').trim();
  if (!assignmentId) {
    throw new functions.https.HttpsError('invalid-argument', 'assignmentId fehlt');
  }

  // Rate-Limit gegen Missbrauch (Codes werden nicht im Sekundentakt erzeugt).
  const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
  const RATE_LIMIT_MAX = 20;
  const rateLimitRef = db.collection('rate_limits').doc(`inviteCreate_${uid}`);
  await db.runTransaction(async (tx) => {
    const rlSnap = await tx.get(rateLimitRef);
    const now = Date.now();
    const rl = rlSnap.exists ? rlSnap.data()! : null;
    if (rl && rl.windowStart + RATE_LIMIT_WINDOW_MS > now) {
      if (rl.count >= RATE_LIMIT_MAX) {
        throw new functions.https.HttpsError('resource-exhausted', 'Zu viele Versuche. Bitte warte 15 Minuten.');
      }
      tx.set(rateLimitRef, { count: rl.count + 1, windowStart: rl.windowStart });
    } else {
      tx.set(rateLimitRef, { count: 1, windowStart: now });
    }
  });

  // Permission spiegelt die alte Rules-Klausel: Mitglied der Firma des Assignments
  // (oder Ersteller) mit aktivem Schreibzugriff (canWriteData-Äquivalent).
  const userSnap = await db.collection('users').doc(uid).get();
  const callerCompany = userSnap.data()?.companyId;
  const assignmentSnap = await db.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Projekt existiert nicht');
  }
  const assignment = assignmentSnap.data()!;
  if (assignment.companyId !== callerCompany && assignment.createdBy !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Kein Zugriff auf dieses Projekt');
  }
  const companySnap = await db.collection('companies').doc(String(callerCompany)).get();
  const status = companySnap.exists ? companySnap.data()?.subscriptionStatus : null;
  const ALLOWED_STATUSES = ['active', 'trial', 'trialing', 'past_due', 'paused', 'cancelled'];
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new functions.https.HttpsError('permission-denied', 'Kein Schreibzugriff (Abo nicht aktiv)');
  }

  const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const INVITE_LENGTH = 6;
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const code = await db.runTransaction(async (tx) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Array.from({ length: INVITE_LENGTH }, () => INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)]).join('');
      const existing = await tx.get(db.collection('project_invites').doc(candidate));
      if (!existing.exists) {
        tx.set(db.collection('project_invites').doc(candidate), {
          assignmentId,
          createdBy: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
        });
        return candidate;
      }
    }
    throw new functions.https.HttpsError('aborted', 'Konnte keinen freien Code finden – bitte erneut versuchen');
  });

  functions.logger.log(`[createInviteCode] ${uid} created code for assignment ${assignmentId}`);
  return { code };
});

/**
 * Löst einen Einladungscode serverseitig ein. companyId/role auf users/{uid} dürfen
 * Clients laut Firestore-Rules nicht selbst setzen (Eskalationsschutz) – das muss daher
 * hier per Admin SDK passieren. Transaction verhindert Doppel-Einlösung bei Race Conditions.
 */
export const redeemInviteCode = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Nicht authentifiziert');
  }
  const uid = context.auth.uid;
  const code = String(data?.code || '').trim().toUpperCase();
  if (!code || code.length < 4) {
    throw new functions.https.HttpsError('invalid-argument', 'Ungültiger Code');
  }

  // Rate-Limit gegen Brute-Force von Einladungscodes (6 Zeichen, sonst ohne Sperre
  // durchprobierbar). Zählt jeden Versuch, nicht nur fehlgeschlagene – ein legitimer
  // Nutzer löst realistisch nie mehr als 1-2 Codes pro Sitzung ein.
  const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
  const RATE_LIMIT_MAX = 5;
  const rateLimitRef = db.collection('rate_limits').doc(`inviteRedeem_${uid}`);
  await db.runTransaction(async (tx) => {
    const rlSnap = await tx.get(rateLimitRef);
    const now = Date.now();
    const rl = rlSnap.exists ? rlSnap.data()! : null;
    if (rl && rl.windowStart + RATE_LIMIT_WINDOW_MS > now) {
      if (rl.count >= RATE_LIMIT_MAX) {
        throw new functions.https.HttpsError('resource-exhausted', 'Zu viele Versuche. Bitte warte 15 Minuten und versuche es erneut.');
      }
      tx.set(rateLimitRef, { count: rl.count + 1, windowStart: rl.windowStart });
    } else {
      tx.set(rateLimitRef, { count: 1, windowStart: now });
    }
  });

  const inviteRef = db.collection('project_invites').doc(code);

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Ungültiger oder bereits verwendeter Einladungscode');
    }
    const invite = inviteSnap.data()!;
    if (invite.usedBy) {
      throw new functions.https.HttpsError('failed-precondition', 'Dieser Code wurde bereits verwendet');
    }
    const expiresAt = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : (invite.expiresAt ? new Date(invite.expiresAt) : null);
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      throw new functions.https.HttpsError('failed-precondition', 'Dieser Code ist abgelaufen');
    }
    if (!invite.assignmentId) {
      throw new functions.https.HttpsError('failed-precondition', 'Dieser Code ist nicht mehr gültig');
    }

    const assignmentRef = db.collection('assignments').doc(invite.assignmentId);
    const assignmentSnap = await tx.get(assignmentRef);
    if (!assignmentSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Das zugehörige Projekt existiert nicht mehr');
    }
    const assignment = assignmentSnap.data()!;

    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : null;
    const displayName = (userData?.displayName) || context.auth?.token.email || 'Mitarbeiter';

    // #5 (CWE-269): Owner-Demotion verhindern. Ein Owner, der versehentlich (oder via
    // geteiltem Code) einen fremden Invite einlöst, würde sonst still auf role:'employee'
    // + fremde companyId umgebunden – irreversibel (Self-Restore scheitert an den Rules).
    // Gleiches gilt für bereits einer anderen Firma zugeordnete Konten (Cross-Tenant-Rebind).
    if (userData?.role === 'owner') {
      throw new functions.https.HttpsError('failed-precondition', 'Chef-Konten können keinem Einladungscode beitreten');
    }
    if (userData?.companyId && userData.companyId !== assignment.companyId) {
      throw new functions.https.HttpsError('failed-precondition', 'Dieses Konto ist bereits einem anderen Unternehmen zugeordnet');
    }

    tx.update(inviteRef, { usedBy: uid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.set(db.collection('project_members').doc(invite.assignmentId), {
      [uid]: {
        uid,
        displayName,
        email: context.auth?.token.email || '',
        role: 'employee',
        joinedAt: new Date().toISOString(),
      },
    }, { merge: true });
    // Bestehende Rolle nie überschreiben (Owner-Guard oben greift ohnehin) – nur setzen,
    // wenn das Konto noch keine Rolle hat.
    const userUpdates: Record<string, unknown> = {
      companyId: assignment.companyId,
      linkedToProjects: admin.firestore.FieldValue.arrayUnion(invite.assignmentId),
    };
    if (!userData?.role) {
      userUpdates.role = 'employee';
    }
    tx.set(userRef, userUpdates, { merge: true });

    return { assignmentId: invite.assignmentId as string, projectName: (assignment.projekt || assignment.kunde || 'Projekt') as string };
  });

  functions.logger.log(`[redeemInviteCode] ${uid} joined assignment ${result.assignmentId} via code ${code}`);
  return { success: true, ...result };
});

/**
 * Benachrichtigt neu hinzugefügte Projektmitglieder (Zuweisung durch den Chef
 * per InviteModal/Web oder Selbst-Beitritt per Einladungscode).
 */
export const onNewProjectMember = functions.region('europe-west1').firestore
  .document('project_members/{assignmentId}')
  .onWrite(async (change, context) => {
    const { assignmentId } = context.params;
    const beforeData = change.before.data() || {};
    const afterData = change.after.data() || {};

    const newUids = Object.keys(afterData).filter(uid => !beforeData[uid]);
    if (newUids.length === 0) return;

    const assignmentSnap = await db.collection('assignments').doc(assignmentId).get();
    const assignment = assignmentSnap.data();
    const projectName = assignment?.projekt || assignment?.kunde || 'Projekt';

    const title = '📋 Neue Projektzuweisung';
    const body = `Du wurdest dem Projekt "${projectName}" hinzugefügt.`;

    await writeNotificationDocs(newUids, { type: 'project_assigned', title, body, assignmentId });
    await sendPushToRecipients(
      newUids,
      title,
      body,
      token => ({ to: token, title, body, data: { assignmentId, type: 'project_assigned' } }),
      { assignmentId, type: 'project_assigned' },
    );

    functions.logger.info(`Push sent for new member(s) of ${assignmentId}: ${newUids.length}`);
  });

/**
 * Sendet Push-Benachrichtigungen (Expo) an alle Projektmitglieder,
 * wenn jemand auf eine Notiz antwortet – egal ob von Web-App oder Mobile-App.
 * Dadurch werden auch Benachrichtigungen zugestellt, wenn der Chef
 * über die Web-App antwortet.
 */
export const onNoteReply = functions.region('europe-west1').firestore
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

    await writeNotificationDocs(Array.from(recipientUids), {
      type: 'note_reply',
      title: '💬 Neue Antwort',
      body,
      assignmentId: noteData.assignmentId,
      targetId: reply.noteId,
    });

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
      { noteId: reply.noteId, assignmentId: noteData.assignmentId, type: 'note_reply', url: `/messenger?assignmentId=${noteData.assignmentId}&noteId=${reply.noteId}` },
    );

    functions.logger.info(`Push sent for reply ${context.params.replyId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * Sendet Push-Benachrichtigungen, wenn eine Notiz von der Web-App erstellt wird.
 */
export const onNoteCreated = functions.region('europe-west1').firestore
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

    await writeNotificationDocs(Array.from(recipientUids), {
      type: isPinned ? 'pinned_note' : 'note',
      title,
      body,
      assignmentId: note.assignmentId,
      targetId: context.params.noteId,
    });

    await sendPushToRecipients(
      Array.from(recipientUids),
      title,
      body,
      token => ({
        to: token,
        title,
        body,
        data: { assignmentId: note.assignmentId, noteId: context.params.noteId, type: isPinned ? 'pinned_note' : 'note' },
      }),
      { assignmentId: note.assignmentId, noteId: context.params.noteId, type: isPinned ? 'pinned_note' : 'note', url: `/messenger?assignmentId=${note.assignmentId}&noteId=${context.params.noteId}` },
    );

    functions.logger.info(`Push sent for note ${context.params.noteId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * Sendet Push-Benachrichtigungen an Projektbesitzer und Mitglieder,
 * wenn ein Mitarbeiter sich ein- oder ausstempelt.
 */
export const onClockEntry = functions.region('europe-west1').firestore
  .document('clock_entries/{entryId}')
  .onCreate(async (snap, context) => {
    const entry = snap.data();
    if (!entry.assignmentId || !entry.userId) return;
    // Genehmigungspflichtige Einstempelungen werden bereits von onClockEntryPending
    // gepusht ("möchte einstempeln") - ohne diese Guard bekäme der Chef zusätzlich
    // dieses "Eingestempelt", als wäre der Eintrag schon aktiv/genehmigt.
    if (!entry.clockOut && entry.status === 'pending_approval') return;

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
    await writeNotificationDocs(Array.from(recipientUids), {
      type: 'clock_entry',
      title,
      body,
      assignmentId: entry.assignmentId,
      targetId: context.params.entryId,
    });

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
      { assignmentId: entry.assignmentId, type: 'clock_entry', url: `/messenger?assignmentId=${entry.assignmentId}&tab=hours` },
    );

    functions.logger.info(`Push sent for clock entry ${context.params.entryId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * Sendet Push-Benachrichtigung bei Updates eines Stempel-Eintrags:
 * Ausstempeln (clockOut gesetzt), Pause gestartet, Pause beendet.
 * Ersetzt die früheren Client-seitigen Pause/Resume-Pushes, damit alle
 * Empfänger (Owner + Mitglieder, Expo + FCM) konsistent erreicht werden.
 */
export const onClockEntryUpdate = functions.region('europe-west1').firestore
  .document('clock_entries/{entryId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.assignmentId || !after?.userId) return;

    const clockedOutNow = !before?.clockOut && !!after.clockOut;
    const pausedNow = !clockedOutNow && !after.clockOut && !before?.isPaused && !!after.isPaused;
    const resumedNow = !clockedOutNow && !after.clockOut && !!before?.isPaused && !after.isPaused;
    if (!clockedOutNow && !pausedNow && !resumedNow) return;

    const [assignmentSnap, membersSnap] = await Promise.all([
      db.collection('assignments').doc(after.assignmentId).get(),
      db.collection('project_members').doc(after.assignmentId).get(),
    ]);
    if (!assignmentSnap.exists) return;

    const ownerId = assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId || null;
    const projectName = assignmentSnap.data()?.projekt || assignmentSnap.data()?.kunde || 'Projekt';
    const userName = after.userName || 'Mitarbeiter';

    let type: string, title: string, body: string;
    if (clockedOutNow) {
      const duration = after.totalMinutes || 0;
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      type = 'clock_out';
      title = '🏁 Mitarbeiter ausgestempelt';
      body = `${userName} hat den Einsatz beendet. Arbeitszeit: ${hours}h ${mins}min`;
    } else if (pausedNow) {
      type = 'clock_pause';
      title = '☕ Mitarbeiter in Pause';
      body = `${userName} macht Pause bei "${projectName}"`;
    } else {
      type = 'clock_resume';
      title = '▶️ Einsatz fortgesetzt';
      body = `${userName} macht weiter bei "${projectName}"`;
    }

    const recipientUids = new Set<string>();
    if (ownerId && ownerId !== after.userId) recipientUids.add(ownerId);
    if (membersSnap.exists) {
      Object.keys(membersSnap.data()!).forEach(mUid => {
        if (mUid !== after.userId) recipientUids.add(mUid);
      });
    }
    if (recipientUids.size === 0) return;

    // In-App Benachrichtigung
    await writeNotificationDocs(Array.from(recipientUids), {
      type,
      title,
      body,
      assignmentId: after.assignmentId,
      targetId: context.params.entryId,
    });

    // Expo + FCM Push
    await sendPushToRecipients(
      Array.from(recipientUids),
      title,
      body,
      token => ({
        to: token,
        title,
        body,
        data: { assignmentId: after.assignmentId, type },
      }),
      { assignmentId: after.assignmentId, type, url: `/messenger?assignmentId=${after.assignmentId}&tab=hours` },
    );

    functions.logger.info(`Push sent for ${type} ${context.params.entryId} to ${recipientUids.size} recipient(s)`);
  });

/**
 * When an employee requests clock-in (status: 'pending_approval'),
 * notify the project owner.
 */
export const onClockEntryPending = functions.region('europe-west1').firestore
  .document('clock_entries/{entryId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data?.companyId || data?.status !== 'pending_approval') return;

    const employeeName = data.employeeName || 'Mitarbeiter';
    const projectName = data.projectName || data.assignmentId || '';
    const title = `${employeeName} möchte einstempeln`;
    const body = projectName ? `Auftrag: ${projectName}` : 'Einstempelung anfordern';

    try {
      await writeNotificationDocs([data.companyId], {
        type: 'clock_approval_pending',
        title,
        body,
        targetId: context.params.entryId,
      });
      await sendPushToRecipients([data.companyId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'clock_approval_pending', clockEntryId: context.params.entryId },
      }));
    } catch (err) {
      functions.logger.error('[onClockEntryPending] Failed', err);
    }
  });

/**
 * When clock entry is approved (status → 'active'),
 * notify the employee.
 */
export const onClockEntryApproved = functions.region('europe-west1').firestore
  .document('clock_entries/{entryId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before?.status === after?.status) return;
    if (after?.status !== 'active') return;
    // Only notify if it was previously pending (not initial creation)
    if (before?.status !== 'pending_approval') return;

    const employeeId = after?.employeeId;
    if (!employeeId) return;

    const title = 'Einstempelung genehmigt';
    const body = 'Du kannst jetzt loslegen. Timer läuft.';

    try {
      await writeNotificationDocs([employeeId], {
        type: 'clock_approved',
        title,
        body,
        targetId: context.params.entryId,
      });
      await sendPushToRecipients([employeeId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'clock_approved', clockEntryId: context.params.entryId },
      }));
    } catch (err) {
      functions.logger.error('[onClockEntryApproved] Failed', err);
    }
  });

/**
 * When clock entry is rejected (status → 'rejected'),
 * notify the employee.
 */
export const onClockEntryRejected = functions.region('europe-west1').firestore
  .document('clock_entries/{entryId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before?.status === after?.status) return;
    if (after?.status !== 'rejected') return;

    const employeeId = after?.employeeId;
    if (!employeeId) return;

    const title = 'Einstempelung abgelehnt';
    const body = 'Deine Einstempelung wurde vom Chef abgelehnt.';

    try {
      await writeNotificationDocs([employeeId], {
        type: 'clock_rejected',
        title,
        body,
        targetId: context.params.entryId,
      });
      await sendPushToRecipients([employeeId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'clock_rejected', clockEntryId: context.params.entryId },
      }));
    } catch (err) {
      functions.logger.error('[onClockEntryRejected] Failed', err);
    }
  });

/**
 * Sendet Push-Benachrichtigungen, wenn ein Foto geteilt wird.
 * Ersetzt den früheren Client-seitigen Foto-Push (der nur den Owner
 * per Expo erreichte) – jetzt Owner + Mitglieder über Expo + FCM.
 */
export const onPhotoCreated = functions.region('europe-west1').firestore
  .document('project_photos/{photoId}')
  .onCreate(async (snap, context) => {
    const photo = snap.data();
    if (!photo.assignmentId || !photo.userId) return;

    const [assignmentSnap, membersSnap] = await Promise.all([
      db.collection('assignments').doc(photo.assignmentId).get(),
      db.collection('project_members').doc(photo.assignmentId).get(),
    ]);

    const ownerId = assignmentSnap.exists
      ? (assignmentSnap.data()?.createdBy || assignmentSnap.data()?.userId)
      : null;

    const recipientUids = new Set<string>();
    if (ownerId && ownerId !== photo.userId) recipientUids.add(ownerId);
    if (membersSnap.exists) {
      Object.keys(membersSnap.data()!).forEach(mUid => {
        if (mUid !== photo.userId) recipientUids.add(mUid);
      });
    }
    if (recipientUids.size === 0) return;

    const displayName = photo.userName || photo.userEmail || 'Mitarbeiter';
    const title = '📷 Neues Foto';
    const body = `${displayName} hat ein Foto geteilt`;

    await writeNotificationDocs(Array.from(recipientUids), {
      type: 'photo',
      title,
      body,
      assignmentId: photo.assignmentId,
      targetId: context.params.photoId,
    });

    await sendPushToRecipients(
      Array.from(recipientUids),
      title,
      body,
      token => ({
        to: token,
        title,
        body,
        data: { assignmentId: photo.assignmentId, type: 'photo' },
      }),
      { assignmentId: photo.assignmentId, type: 'photo', url: `/messenger?assignmentId=${photo.assignmentId}&tab=photos` },
    );

    functions.logger.info(`Push sent for photo ${context.params.photoId} to ${recipientUids.size} recipient(s)`);
  });

// ─── Push-Helper: Expo (Mobile) + FCM (Web) ───
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHUNK_SIZE = 100;

async function sendExpoPush(entries: { uid: string; token: string; badge?: number }[], buildMessage: (token: string) => Record<string, unknown>): Promise<void> {
  const stale: { uid: string; token: string }[] = [];
  for (let i = 0; i < entries.length; i += PUSH_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + PUSH_CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        // sound/badge zentral setzen: Sound für iOS-Hörbarkeit, Badge = ungelesene
        // notifications-Docs des Empfängers (App-Icon-Zahl passt so zur In-App-Zahl).
        body: JSON.stringify(chunk.map(e => ({
          sound: 'default',
          channelId: 'default',
          ...(e.badge != null ? { badge: e.badge } : {}),
          ...buildMessage(e.token),
        }))),
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
  const expoEntries: { uid: string; token: string; badge?: number }[] = [];
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

  // App-Icon-Badge pro Empfänger = Anzahl seiner ungelesenen In-App-Benachrichtigungen.
  // Muss NACH writeNotificationDocs laufen (Aufrufer halten diese Reihenfolge ein).
  await Promise.all(expoEntries.map(async (entry) => {
    try {
      const agg = await db.collection('notifications')
        .where('recipientId', '==', entry.uid)
        .where('read', '==', false)
        .count().get();
      entry.badge = agg.data().count;
    } catch { /* Badge optional – Push geht trotzdem raus */ }
  }));

  const sends: Promise<void>[] = [];
  if (expoEntries.length > 0) {
    sends.push(sendExpoPush(expoEntries, buildExpoMessage));
  }
  if (fcmEntries.length > 0) {
    sends.push(sendFcmPush(fcmEntries, title, body, fcmData));
  }
  await Promise.allSettled(sends);
}

/**
 * Ein Expo-Token = ein Gerät = genau EIN User. Loggt sich jemand auf demselben
 * Gerät in einen anderen Account ein (z.B. Chef testet Mitarbeiter-Login),
 * bleibt der Token sonst auch am alten User-Doc hängen — das Gerät bekommt dann
 * Pushes, die an den anderen Account adressiert sind (u.a. die eigenen Nachrichten).
 */
export const dedupePushToken = functions.region('europe-west1').firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const token = change.after.data()?.expoPushToken;
    if (!token || token === change.before.data()?.expoPushToken) return;
    const dupes = await db.collection('users').where('expoPushToken', '==', token).get();
    const batch = db.batch();
    let removed = 0;
    dupes.forEach(d => {
      if (d.id !== context.params.uid) {
        batch.update(d.ref, { expoPushToken: admin.firestore.FieldValue.delete() });
        removed++;
      }
    });
    if (removed > 0) {
      await batch.commit();
      functions.logger.info(`dedupePushToken: token von ${removed} anderen User(n) entfernt (jetzt bei ${context.params.uid})`);
    }
  });

/**
 * Löscht Benachrichtigungen, die älter als 30 Tage sind, damit die
 * notifications-Collection nicht unbegrenzt wächst (jedes Stempel-/Notiz-Event
 * erzeugt ein Doc pro Empfänger).
 */
export const cleanupOldNotifications = functions.region('europe-west1').pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let deleted = 0;
    while (true) {
      const snap = await db.collection('notifications')
        .where('createdAt', '<', cutoff)
        .limit(500)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 500) break;
    }
    if (deleted > 0) functions.logger.info(`cleanupOldNotifications: ${deleted} deleted`);
  });

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

export const cleanupExcessEmployees = functions.runWith({ timeoutSeconds: 540 }).region('europe-west1').pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // 0) Sicherheitsnetz für zum Periodenende gekündigte Abos.
    //
    // Normalerweise schaltet der `customer.subscription.deleted`-Webhook auf
    // 'cancelled' um. Bleibt der aus (Webhook-Ausfall, fehlender
    // payment_requests-Eintrag), hinge das Konto sonst dauerhaft auf 'active'
    // und der Kunde behielte den Zugang, ohne zu zahlen. Deshalb wird der
    // Übergang hier stündlich nachgeholt.
    // Gekapselt, damit ein fehlender Composite-Index (oder ein anderer
    // Abfragefehler) nicht die eigentliche Datenbereinigung weiter unten
    // mitreißt — die ist wichtiger als dieses Netz.
    try {
      const dueForEnd = await db.collection('companies')
        .where('cancelAtPeriodEnd', '==', true)
        .where('subscriptionEndsAt', '<=', now)
        .limit(50)
        .get();

      for (const doc of dueForEnd.docs) {
        if (doc.data().subscriptionStatus !== 'active') continue;
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await doc.ref.update({
          subscriptionStatus: 'cancelled',
          dataCleanupAt: admin.firestore.Timestamp.fromDate(sevenDaysFromNow),
          cancelAtPeriodEnd: admin.firestore.FieldValue.delete(),
          subscriptionEndsAt: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(e => functions.logger.warn(`Period-end fallback failed for ${doc.id}`, e));
        functions.logger.info(`Period-end fallback: company ${doc.id} set to cancelled`);
      }
    } catch (e) {
      functions.logger.error('Period-end fallback query failed (index missing?)', e);
    }

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
export const expireTrials = functions.region('europe-west1').pubsub.schedule('every 60 minutes').onRun(async () => {
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
export const changeEmployeePassword = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
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

// Der reguläre "Mitarbeiter hinzufügen"-Weg (ohne Login, App + Web) schreibt per
// addDoc() direkt in Firestore – die Rules können die Anzahl bestehender Mitarbeiter
// pro companyId nicht prüfen (kein count() in Security Rules), nur der Client tut das,
// und das ist umgehbar. Dieser Trigger ist die serverseitige Durchsetzung: Wird das
// Plan-Limit überschritten, wird der gerade angelegte Mitarbeiter sofort wieder gelöscht.
// (Der createEmployee-Callable unten prüft das Limit zusätzlich vorab für den Login-Weg.)
export const enforceEmployeeLimit = functions.region('europe-west1').firestore
  .document('employees/{employeeId}')
  .onCreate(async (snap, context) => {
    const employee = snap.data();
    const companyId = employee.companyId;
    if (!companyId) return;

    const companySnap = await db.collection('companies').doc(companyId).get();
    const plan: string = companySnap.exists ? (companySnap.data()?.subscriptionPlan || 'trial') : 'trial';
    const limit = plan === 'solo' ? 2 : plan === 'team' ? 5 : Infinity; // trial/business = unbegrenzt

    if (limit === Infinity) return;

    const countSnap = await db.collection('employees').where('companyId', '==', companyId).count().get();
    if (countSnap.data().count > limit) {
      await snap.ref.delete();
      functions.logger.warn(`[enforceEmployeeLimit] Deleted employee ${context.params.employeeId} for company ${companyId} – exceeds ${plan} limit (${limit})`);
    }
  });

const EMPLOYEE_EMAIL_DOMAIN = 'earntrack.de';

// Legt einen Mitarbeiter-Account serverseitig via Admin SDK an. Ersetzt den ungesicherten
// Client-Direktaufruf an die Identity-Toolkit-REST-API (accounts:signUp). Erzwingt Owner-Auth,
// E-Mail-Domain, Passwort-Policy und das Employee-Limit des Abo-Plans serverseitig.
export const createEmployee = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Nicht authentifiziert');
  }
  const ownerUid = context.auth.uid;

  // Erzwinge Owner-Rolle (CWE-862): ohne Check könnte jeder angemeldete User Mitarbeiter
  // anlegen und sich per assignmentId via Admin-SDK in fremde Projekt-Teams eintragen.
  const callerSnap = await db.collection('users').doc(ownerUid).get();
  const caller = callerSnap.data();
  if (!callerSnap.exists || caller?.role !== 'owner' || caller?.companyId !== ownerUid) {
    throw new functions.https.HttpsError('permission-denied', 'Nur der Firmeninhaber darf Mitarbeiter anlegen');
  }

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
// Beide Kandidaten zulassen, bis die finale iOS-Bundle-ID in App Store Connect feststeht
// (app.json enthält aktuell noch com.anonymous.EarnTrack).
const IOS_BUNDLE_IDS = new Set(['com.anonymous.EarnTrack', 'com.earntrack.app']);

// Apple Root CA - G3 (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer, DER→PEM).
// Vertrauensanker für alle StoreKit-2-JWS-Signaturen (Transaktionen + Server Notifications V2).
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;
let _appleRootCa: crypto.X509Certificate | null = null;
function getAppleRootCa(): crypto.X509Certificate {
  if (!_appleRootCa) _appleRootCa = new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM);
  return _appleRootCa;
}

// Verifiziert ein Apple-JWS (StoreKit 2 Transaktion / App Store Server Notification V2):
// x5c-Zertifikatskette bis zur Apple Root CA G3 + ES256-Signatur. Gibt das dekodierte
// Payload zurück oder null, wenn irgendetwas nicht stimmt.
function decodeAppleJws(jws: string): any | null {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const x5c: string[] = Array.isArray(header.x5c) ? header.x5c : [];
    if (x5c.length === 0) return null;
    const certs = x5c.map((c) => new crypto.X509Certificate(Buffer.from(c, 'base64')));
    const now = Date.now();
    for (const cert of certs) {
      if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) return null;
    }
    // Kette prüfen: jedes Zertifikat muss vom nächsten signiert sein …
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) return null;
    }
    // … und die Kette muss in der Apple Root CA G3 enden (exakt oder von ihr signiert).
    const root = getAppleRootCa();
    const last = certs[certs.length - 1];
    if (!last.raw.equals(root.raw) && !last.verify(root.publicKey)) return null;

    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(parts[2], 'base64url')
    );
    if (!ok) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (e) {
    functions.logger.warn('[decodeAppleJws] failed:', e);
    return null;
  }
}

interface AppleVerifyResult {
  valid: boolean;
  // Maschinenlesbarer Ablehnungsgrund für den Client ('expired' | 'revoked' | 'pending'),
  // damit der Restore-Button eine ehrliche Meldung zeigen kann statt "wird gleich aktiviert".
  reason?: string;
  productId?: string;
  expiresAt?: number;
  originalTransactionId?: string;
  environment?: string;
}

async function verifyAppleReceipt(receiptData: string, sharedSecret: string): Promise<AppleVerifyResult> {
  // Neuer Pfad: expo-iap liefert als purchaseToken das StoreKit-2-JWS der Transaktion
  // (KEIN Base64-App-Receipt – das alte verifyReceipt-Endpoint würde 21002 liefern).
  if (receiptData.split('.').length === 3) {
    const tx = decodeAppleJws(receiptData);
    if (!tx) return { valid: false };
    if (tx.bundleId && !IOS_BUNDLE_IDS.has(tx.bundleId)) {
      functions.logger.warn('[verifyReceipt] JWS bundleId mismatch:', tx.bundleId);
      return { valid: false };
    }
    if (tx.revocationDate) return { valid: false, reason: 'revoked' };
    const exp = Number(tx.expiresDate || 0);
    if (!exp || exp <= Date.now()) return { valid: false, reason: 'expired' };
    return {
      valid: true,
      productId: tx.productId,
      expiresAt: exp,
      originalTransactionId: String(tx.originalTransactionId || tx.transactionId || ''),
      environment: tx.environment,
    };
  }

  // Legacy-Pfad: Base64-App-Receipt → Apple verifyReceipt (braucht Shared Secret).
  if (!sharedSecret) {
    functions.logger.error('[verifyReceipt] APPSTORE_SHARED_SECRET not configured (legacy receipt)');
    return { valid: false };
  }
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
  let best: { productId: string; exp: number; otid?: string } | null = null;
  for (const it of infos) {
    const exp = parseInt(it.expires_date_ms || '0', 10);
    if (exp > Date.now() && (!best || exp > best.exp)) best = { productId: it.product_id, exp, otid: it.original_transaction_id };
  }
  return best
    ? { valid: true, productId: best.productId, expiresAt: best.exp, originalTransactionId: best.otid }
    : { valid: false, reason: 'expired' };
}

async function verifyGoogleSubscription(purchaseToken: string, productId: string): Promise<{ valid: boolean; reason?: string; productId?: string; expiresAt?: number; autoRenewing?: boolean }> {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    functions.logger.warn('[verifyReceipt] Google Play API error', { status: res.status });
    // 400/404 = ungültiger Token/Produkt (permanent); 5xx/Netzwerk = retrybar (Client darf pollen).
    return { valid: false, reason: res.status === 400 || res.status === 404 ? 'invalid' : 'error' };
  }
  const json = await res.json() as any;
  const exp = parseInt(json.expiryTimeMillis || '0', 10);
  // paymentState: 0 = pending (noch nicht bezahlt) → nicht aktivieren
  if (json.paymentState === 0) return { valid: false, reason: 'pending' };
  if (exp <= Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, productId, expiresAt: exp, autoRenewing: json.autoRenewing === true };
}

export const verifyAppStoreReceipt = functions.region('us-central1', 'europe-west1').https.onCall(async (data, context) => {
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

  let result: AppleVerifyResult & { autoRenewing?: boolean };
  try {
    if (platform === 'ios') {
      // Shared Secret wird nur noch für Legacy-Base64-Receipts gebraucht;
      // StoreKit-2-JWS wird lokal per Zertifikatskette verifiziert.
      const secret = process.env.APPSTORE_SHARED_SECRET || functions.config().appstore?.shared_secret || '';
      result = await verifyAppleReceipt(receiptData, secret);
    } else if (platform === 'android') {
      result = await verifyGoogleSubscription(receiptData, productId);
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Unbekannte Plattform');
    }
  } catch (e: any) {
    if (e instanceof functions.https.HttpsError) throw e;
    functions.logger.error('[verifyReceipt] validation failed:', e);
    return { valid: false, reason: 'error' };
  }

  if (!result.valid) {
    functions.logger.log(`[verifyReceipt] invalid receipt for company ${companyId} (${result.reason || 'invalid'})`);
    return { valid: false, reason: result.reason || 'invalid' };
  }

  // Ein Kauf darf nur an EINE Company gebunden sein: verhindert, dass dasselbe Store-Abo per
  // "Käufe wiederherstellen" auf mehreren EarnTrack-Accounts aktiviert wird, und hält das
  // ASSN-Mapping (originalTransactionId → Company) eindeutig.
  const bindingField = platform === 'ios' ? 'appleOriginalTransactionId' : 'iapPurchaseToken';
  const bindingValue = platform === 'ios' ? (result.originalTransactionId || '') : receiptData;
  if (bindingValue) {
    const bound = await db.collection('companies').where(bindingField, '==', bindingValue).limit(2).get();
    const other = bound.docs.find((d) => d.id !== companyId);
    if (other) {
      functions.logger.warn(`[verifyReceipt] Kauf bereits an Company ${other.id} gebunden – abgelehnt für ${companyId}`);
      return { valid: false, reason: 'already-linked' };
    }
  }

  const finalPlan = IAP_PLAN_FROM_PRODUCT[result.productId || productId] || IAP_PLAN_FROM_PRODUCT[productId];
  // Lifecycle-Felder: appleOriginalTransactionId erlaubt dem Server-Notification-Webhook das
  // Mapping Transaktion→Company; der Android-Token erlaubt periodische Re-Validierung
  // (Google-Tokens bleiben über Renewals hinweg gültig und abfragbar).
  const lifecycleFields = platform === 'ios'
    ? {
        iapPlatform: 'ios',
        appleOriginalTransactionId: result.originalTransactionId || null,
        appleEnvironment: result.environment || null,
      }
    : {
        iapPlatform: 'android',
        iapPurchaseToken: receiptData,
        iapProductId: result.productId || productId,
      };
  // Doppelabrechnung erkennen: Der Store-Kauf ist bereits erfolgt und kann von
  // hier aus nicht mehr verhindert werden — den Kunden auszusperren wäre falsch.
  // Stattdessen wird der Konflikt markiert und gemeldet, damit eine Seite
  // manuell erstattet/gekündigt werden kann.
  await flagDualSubscriptionIfAny(companyId, 'iap');

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
    ...lifecycleFields,
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
export const onInventoryLowStock = functions.region('europe-west1').firestore
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

/**
 * Sendet einen Push an den Firmen-Owner, wenn Bestand gebucht wird (Zugang/Entnahme).
 * Ersetzt den früheren Client-seitigen Push (notifyUser in useInventory.js) – der
 * erreichte nur Expo, schrieb kein In-App-Notification-Doc und schlug still fehl,
 * wenn die App des Mitarbeiters nach dem Firestore-Write schon geschlossen war.
 * Kein Self-Notify: bucht der Owner selbst, ist das keine Meldung wert.
 * 2nd Gen (Eventarc), gleicher Grund wie bei onFeedbackCreated: die Firestore-DB
 * liegt in der eur3-Multiregion, 1st-Gen-Trigger unterstützen das nicht für neu
 * angelegte Trigger.
 */
export const onInventoryMovementCreated = onDocumentCreated(
  { document: 'inventory_movements/{movementId}', region: 'europe-west1' },
  async (event) => {
    const movement = event.data?.data();
    if (!movement?.companyId || !movement.itemId) return;

    const ownerId = movement.companyId;
    if (movement.userId === ownerId) return;

    const delta = Number(movement.delta) || 0;
    if (delta === 0) return;

    const actorName = movement.userName || 'Mitarbeiter';
    const verb = delta < 0 ? 'entnommen' : 'hinzugefügt';
    const unit = movement.unit || 'Stk';
    const itemName = movement.itemName || 'Artikel';
    const suffix = movement.assignmentLabel ? ` für ${movement.assignmentLabel}` : '';
    const title = '📦 Lagerbewegung';
    const body = `${actorName}: ${Math.abs(delta)} ${unit} ${itemName} ${verb}${suffix}`;

    try {
      await writeNotificationDocs([ownerId], { type: 'inventory_movement', title, body, assignmentId: movement.assignmentId });
      await sendPushToRecipients([ownerId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'inventory_movement', itemId: movement.itemId },
      }));
      functions.logger.info(`Inventory-movement push sent for ${event.params.movementId} to ${ownerId}`);
    } catch (err) {
      functions.logger.error(`[onInventoryMovementCreated] Push failed for movement ${event.params.movementId}`, err);
    }
  },
);

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
export const onAssignmentLowMargin = functions.region('europe-west1').firestore
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

// ─── ProfitScore Push Notification Helpers ──────────────────────────────────

/**
 * Berechnet die Marge eines Kostenvoranschlags aus dem Estimate-Objekt.
 * Identisch zur Logik in calculations.ts calculateEstimateProfit().
 */
function calculateEstimateMargin(estimate: any, overheadPercent: number) {
  const positionen = Array.isArray(estimate.positionen) ? estimate.positionen : [];
  const materialien = Array.isArray(estimate.materialienList) ? estimate.materialienList : [];
  const sonstige = Array.isArray(estimate.sonstigeKosten) ? estimate.sonstigeKosten : [];

  const totalPositionen = positionen.reduce((s: number, p: any) =>
    s + (parseFloat(String(p.einzelpreis || '0').replace(',', '.')) || 0) *
        (parseFloat(String(p.menge || '0').replace(',', '.')) || 0), 0);
  const totalMaterial = materialien.reduce((s: number, m: any) =>
    s + (parseFloat(String(m.preis || '0').replace(',', '.')) || 0) *
        (parseFloat(String(m.menge || '0').replace(',', '.')) || 0), 0);
  const totalSonstige = sonstige.reduce((s: number, k: any) =>
    s + (parseFloat(String(k.betrag || '0').replace(',', '.')) || 0), 0);

  const gesamt = totalPositionen + totalMaterial + totalSonstige;
  const margeNum = parseFloat(String(estimate.gewinnmarge || '0').replace(',', '.')) || 0;
  const endPrice = Math.round(gesamt * (1 + margeNum / 100) * 100) / 100;
  const overheadCost = endPrice * (overheadPercent / 100);
  const profit = endPrice - gesamt - overheadCost;
  const profitMargin = endPrice > 0 ? (profit / endPrice) * 100 : 0;

  return { gesamt, endPrice, profit, profitMargin, directCost: gesamt };
}

/** Marge → Note (identisch zu smartPricing.js getGrade) */
function getGradeFromMargin(margin: number): string {
  if (margin > 50) return 'A+';
  if (margin >= 40) return 'A';
  if (margin >= 25) return 'B';
  if (margin >= 10) return 'C';
  if (margin >= 0) return 'D';
  return 'F';
}

/** Liest Notification-Preference eines Owners aus Firestore */
async function getOwnerNotificationPref(ownerId: string, key: string): Promise<boolean> {
  const db = admin.firestore();
  const snap = await db.collection('users').doc(ownerId).get();
  const notif = snap.data()?.notifications;
  if (!notif) return true; // Default: alles an
  return notif[key] !== false;
}

/** Prüft ob ein Throttling-Timestamp noch aktiv ist */
async function isAlertThrottled(companyId: string, key: string): Promise<boolean> {
  const db = admin.firestore();
  const snap = await db.collection('companies').doc(companyId).get();
  if (!snap.exists) return false;
  const ts = snap.data()?.pushThrottling?.[key];
  if (!ts) return false;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return ts.toDate() > thirtyDaysAgo;
}

/** Setzt Throttling-Timestamp */
async function setAlertThrottled(companyId: string, key: string): Promise<void> {
  const db = admin.firestore();
  await db.collection('companies').doc(companyId).set(
    { [`pushThrottling.${key}`]: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/** Ziel-Preis für 20% Marge (identisch zu calculations.ts priceForTargetMargin) */
function priceForTargetMargin(directCost: number, overheadPercent: number): number | null {
  const q = overheadPercent / 100;
  const denom = 1 - 0.2 - q;
  if (directCost <= 0 || denom <= 0) return null;
  return directCost / denom;
}

/** Formatiert Euro-Betrag */
function fmtEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * ProfitScore-Push beim Erstellen eines Kostenvoranschlags.
 * Feuert bei jedem neuen Estimate mit Score < C (25% Marge).
 * Kein Throttling – jedes Angebot ist wichtig.
 */
export const onEstimateCreated = functions.region('europe-west1').firestore
  .document('estimates/{estimateId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data?.companyId) return;

    const db = admin.firestore();
    const settingsSnap = await db.collection('companies').doc(data.companyId)
      .collection('settings').doc('invoice').get();
    const overheadPercent = parseFloat(settingsSnap.data()?.overheadPercent || '0') || 0;

    const margin = calculateEstimateMargin(data, overheadPercent);
    if (margin.profitMargin >= 25) return;

    const prefOk = await getOwnerNotificationPref(data.companyId, 'profitScoreAlert');
    if (!prefOk) return;

    const grade = getGradeFromMargin(margin.profitMargin);
    const target = priceForTargetMargin(margin.directCost, overheadPercent);
    const diff = target != null ? target - margin.endPrice : 0;

    const title = `ProfitScore ${grade}`;
    const body = target != null
      ? `Für 20% Marge wären ${fmtEuro(target)} € nötig. +${fmtEuro(diff)} €`
      : `Marge nur ${margin.profitMargin.toFixed(0)}% – Gemeinkosten-Quote prüfen.`;

    try {
      await writeNotificationDocs([data.companyId], {
        type: 'profit_score_alert',
        title,
        body,
        estimateId: context.params.estimateId,
      });
      await sendPushToRecipients([data.companyId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'profit_score_alert', estimateId: context.params.estimateId },
      }));
      functions.logger.info(`ProfitScore push sent for estimate ${context.params.estimateId}`);
    } catch (err) {
      functions.logger.error(`[onEstimateCreated] Push failed for ${context.params.estimateId}`, err);
    }
  });

/**
 * Marge-Alert wenn Einsatz abgeschlossen und Marge < 20%.
 * Erweitert den bestehenden onAssignmentLowMargin (10% Schwelle)
 * um eine niedrigere Schwelle (20%) für frühere Warnung.
 */
export const onAssignmentMarginAlert = functions.region('europe-west1').firestore
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
    const materialCost = materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.costPrice ?? m.unitPrice) || 0), 0);

    const revenue = parseGermanNumber(after.umsatz) + materialSum;
    const cost = hours * rate + materialCost;
    if (revenue <= 0) return;
    const margin = ((revenue - cost) / revenue) * 100;
    if (margin >= 20) return;

    const prefOk = await getOwnerNotificationPref(after.companyId, 'marginAlert');
    if (!prefOk) return;

    const kunde = after.kunde || after.projekt || 'Auftrag';
    const profit = revenue - cost;
    const title = `[!] Marge nur ${margin.toFixed(1)}%`;
    const body = `${kunde}: ${fmtEuro(profit)} € Gewinn bei ${fmtEuro(revenue)} € Umsatz`;

    try {
      await writeNotificationDocs([after.companyId], {
        type: 'margin_alert',
        title,
        body,
        assignmentId: context.params.assignmentId,
      });
      await sendPushToRecipients([after.companyId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'margin_alert', assignmentId: context.params.assignmentId },
      }));
      functions.logger.info(`Margin alert push sent for assignment ${context.params.assignmentId}`);
    } catch (err) {
      functions.logger.error(`[onAssignmentMarginAlert] Push failed for ${context.params.assignmentId}`, err);
    }
  });

/**
 * Kunden-Muster-Erkennung: Warnung wenn ein Kunde ≥3x mit <20% Marge
 * in den letzten 90 Tagen auftritt. Throttled 1x pro 30 Tage pro Kunde.
 */
export const onAssignmentCustomerPattern = functions.region('europe-west1').firestore
  .document('assignments/{assignmentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.companyId || !after?.kunde) return;
    if (before?.status === 'Abgeschlossen' || after.status !== 'Abgeschlossen') return;

    const throttled = await isAlertThrottled(after.companyId, `customerPattern_${after.kunde}`);
    if (throttled) return;

    const db = admin.firestore();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const snap = await db.collection('assignments')
      .where('companyId', '==', after.companyId)
      .where('kunde', '==', after.kunde)
      .where('status', '==', 'Abgeschlossen')
      .where('datum', '>=', ninetyDaysAgo.toLocaleDateString('de-DE'))
      .get();

    if (snap.size < 3) return;

    let lowMarginCount = 0;
    snap.forEach(doc => {
      const a = doc.data();
      const hours = parseGermanNumber(a.stunden);
      const rate = parseGermanNumber(a.stundenlohn);
      const mat = Array.isArray(a.materialien) ? a.materialien : [];
      const matSum = mat.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
      const matCost = mat.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.costPrice ?? m.unitPrice) || 0), 0);
      const rev = parseGermanNumber(a.umsatz) + matSum;
      const cst = hours * rate + matCost;
      if (rev > 0) {
        const margin = ((rev - cst) / rev) * 100;
        if (margin < 20) lowMarginCount++;
      }
    });

    if (lowMarginCount < 3) return;

    const prefOk = await getOwnerNotificationPref(after.companyId, 'customerPattern');
    if (!prefOk) return;

    const title = `[i] Kunde "${after.kunde}" – Muster erkannt`;
    const body = `${lowMarginCount} der letzten Einsätze unter 20% Marge. Konditionen prüfen?`;

    try {
      await writeNotificationDocs([after.companyId], {
        type: 'customer_pattern',
        title,
        body,
        customerId: after.kunde,
      });
      await sendPushToRecipients([after.companyId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'customer_pattern', customerId: after.kunde },
      }));
      await setAlertThrottled(after.companyId, `customerPattern_${after.kunde}`);
      functions.logger.info(`Customer pattern push sent for ${after.kunde}`);
    } catch (err) {
      functions.logger.error(`[onAssignmentCustomerPattern] Push failed for ${after.kunde}`, err);
    }
  });

/**
 * Mitarbeiter-Kosten-Alert: Warnung wenn MA >30% über dem Durchschnitt.
 * Throttled 1x pro 30 Tage pro Mitarbeiter.
 */
export const onAssignmentEmployeeCostAlert = functions.region('europe-west1').firestore
  .document('assignments/{assignmentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.companyId) return;
    if (before?.status === 'Abgeschlossen' || after.status !== 'Abgeschlossen') return;

    const employeeNames = Array.isArray(after.mitarbeiter) ? after.mitarbeiter : [];
    if (employeeNames.length === 0) return;

    const throttled = await isAlertThrottled(after.companyId, `employeeCost_${employeeNames[0]}`);
    if (throttled) return;

    const db = admin.firestore();

    const empSnap = await db.collection('employees')
      .where('companyId', '==', after.companyId)
      .get();

    const rates: number[] = [];
    empSnap.forEach(doc => {
      const r = parseGermanNumber(doc.data().stundenlohn);
      if (r > 0) rates.push(r);
    });
    if (rates.length < 2) return;

    const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;
    const empRate = parseGermanNumber(after.stundenlohn);
    if (empRate <= avgRate * 1.3) return;

    const prefOk = await getOwnerNotificationPref(after.companyId, 'employeeCostAlert');
    if (!prefOk) return;

    const empName = employeeNames[0] || 'Mitarbeiter';
    const diff = ((empRate - avgRate) / avgRate * 100).toFixed(0);
    const title = `[i] ${empName} – Überdurchschnittlich teuer`;
    const body = `Ø ${fmtEuro(empRate)} €/h · Durchschnitt: ${fmtEuro(avgRate)} €/h (+${diff}%)`;

    try {
      await writeNotificationDocs([after.companyId], {
        type: 'employee_cost_alert',
        title,
        body,
        assignmentId: context.params.assignmentId,
      });
      await sendPushToRecipients([after.companyId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'employee_cost_alert', employeeName: empName },
      }));
      await setAlertThrottled(after.companyId, `employeeCost_${empName}`);
      functions.logger.info(`Employee cost alert sent for ${empName}`);
    } catch (err) {
      functions.logger.error(`[onAssignmentEmployeeCostAlert] Push failed for ${empName}`, err);
    }
  });

/**
 * Wöchentliches Recap – Sonntag 19:00.
 * Sendet eine Zusammenfassung der Woche an alle aktiven Owner.
 */
export const weeklyRecap = functions.region('europe-west1').pubsub
  .schedule('0 19 * * 0') // Sonntag 19:00
  .timeZone('Europe/Berlin')
  .onRun(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateStr = sevenDaysAgo.toLocaleDateString('de-DE');

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const prefOk = await getOwnerNotificationPref(companyId, 'weeklyRecap');
      if (!prefOk) continue;

      const assignSnap = await db.collection('assignments')
        .where('companyId', '==', companyId)
        .where('datum', '>=', dateStr)
        .get();

      if (assignSnap.size === 0) continue;

      let totalRevenue = 0, totalCost = 0;
      assignSnap.forEach(doc => {
        const a = doc.data();
        const hours = parseGermanNumber(a.stunden);
        const rate = parseGermanNumber(a.stundenlohn);
        const mat = Array.isArray(a.materialien) ? a.materialien : [];
        const matSum = mat.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
        const matCost = mat.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.costPrice ?? m.unitPrice) || 0), 0);
        totalRevenue += parseGermanNumber(a.umsatz) + matSum;
        totalCost += hours * rate + matCost;
      });

      const totalProfit = totalRevenue - totalCost;
      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      const grade = getGradeFromMargin(avgMargin);

      const title = `Deine Woche – ${grade} Ø`;
      const body = `${fmtEuro(totalRevenue)} Umsatz · ${fmtEuro(totalProfit)} Gewinn · ${assignSnap.size} Einsätze`;

      try {
        await writeNotificationDocs([companyId], {
          type: 'weekly_recap',
          title,
          body,
        });
        await sendPushToRecipients([companyId], title, body, token => ({
          to: token,
          title,
          body,
          data: { type: 'weekly_recap' },
        }));
        functions.logger.info(`Weekly recap sent to ${companyId}`);
      } catch (err) {
        functions.logger.error(`[weeklyRecap] Push failed for ${companyId}`, err);
      }
    }
  });

// ─── App Store Server Notifications V2 ─────────────────────────────────────
// Apple pusht Abo-Lifecycle-Events (Renewal, Kündigung, Ablauf, Refund) als signiertes JWS.
// Ohne diesen Webhook würde ein im App Store gekündigtes Abo in Firestore ewig 'active' bleiben.
// Konfiguration: App Store Connect → App-Informationen → App Store Server Notifications V2 URL
// (Production UND Sandbox) auf diese Function zeigen lassen.
export const appStoreNotifications = functions.region('us-central1', 'europe-west1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
  const signedPayload = req.body?.signedPayload;
  if (typeof signedPayload !== 'string') { res.status(400).send('Bad Request'); return; }

  const payload = decodeAppleJws(signedPayload);
  if (!payload) { res.status(401).send('Invalid signature'); return; }

  const type: string = payload.notificationType || '';
  const subtype: string = payload.subtype || '';
  const data = payload.data || {};
  if (data.bundleId && !IOS_BUNDLE_IDS.has(data.bundleId)) {
    functions.logger.warn('[ASSN] bundleId mismatch:', data.bundleId);
    res.status(200).send('OK');
    return;
  }
  const tx = data.signedTransactionInfo ? decodeAppleJws(data.signedTransactionInfo) : null;
  const renewal = data.signedRenewalInfo ? decodeAppleJws(data.signedRenewalInfo) : null;
  const originalTransactionId = String(tx?.originalTransactionId || renewal?.originalTransactionId || '');

  // TEST-Notifications u.ä. haben keine Transaktion – mit 200 bestätigen, sonst retried Apple endlos.
  if (!originalTransactionId) {
    functions.logger.log(`[ASSN] ${type}${subtype ? ':' + subtype : ''} ohne Transaktion – ignoriert`);
    res.status(200).send('OK');
    return;
  }

  const snap = await db.collection('companies')
    .where('appleOriginalTransactionId', '==', originalTransactionId)
    .limit(1).get();
  if (snap.empty) {
    functions.logger.warn(`[ASSN] Keine Company für originalTransactionId ${originalTransactionId} (${type})`);
    res.status(200).send('OK');
    return;
  }

  const productId: string | undefined = tx?.productId || renewal?.autoRenewProductId;
  const plan = productId ? IAP_PLAN_FROM_PRODUCT[productId] : undefined;
  const expiresAt = Number(tx?.expiresDate || 0);
  const update: Record<string, unknown> = {
    lastAppleNotification: subtype ? `${type}:${subtype}` : type,
    lastAppleNotificationAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  switch (type) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
      update.subscriptionStatus = 'active';
      if (plan) update.subscriptionPlan = plan;
      if (expiresAt) update.nextBillingDate = admin.firestore.Timestamp.fromMillis(expiresAt);
      break;
    case 'DID_CHANGE_RENEWAL_STATUS':
      // Auto-Renew aus = 'cancelled' (Zugriff bleibt bis Periodenende, siehe ACTIVE_STATUSES im Client).
      update.subscriptionStatus = subtype === 'AUTO_RENEW_ENABLED' ? 'active' : 'cancelled';
      break;
    case 'DID_CHANGE_RENEWAL_PREF':
      // Upgrade wirkt sofort (neue Transaktion), Downgrade erst zum Periodenende (macht DID_RENEW).
      if (subtype === 'UPGRADE' && plan) {
        update.subscriptionStatus = 'active';
        update.subscriptionPlan = plan;
        if (expiresAt) update.nextBillingDate = admin.firestore.Timestamp.fromMillis(expiresAt);
      }
      break;
    case 'DID_FAIL_TO_RENEW':
      // Mit Grace-Period behält der User Zugriff ('past_due' ist im Client ein aktiver Status),
      // ohne Grace-Period endet der Zugriff sofort.
      update.subscriptionStatus = subtype === 'GRACE_PERIOD' ? 'past_due' : 'expired';
      break;
    case 'GRACE_PERIOD_EXPIRED':
    case 'EXPIRED':
    case 'REFUND':
    case 'REVOKE':
      update.subscriptionStatus = 'expired';
      break;
    case 'RENEWAL_EXTENDED':
      if (expiresAt) update.nextBillingDate = admin.firestore.Timestamp.fromMillis(expiresAt);
      break;
    default:
      // PRICE_INCREASE, CONSUMPTION_REQUEST, TEST, … → nur protokollieren
      break;
  }

  await snap.docs[0].ref.set(update, { merge: true });
  functions.logger.log(`[ASSN] ${type}${subtype ? ':' + subtype : ''} → company ${snap.docs[0].id}`, { status: update.subscriptionStatus, plan });
  res.status(200).send('OK');
});

// ─── IAP-Abo-Lifecycle (Scheduled) ─────────────────────────────────────────
// Android: Google-Purchase-Tokens bleiben über Renewals gültig → überfällige Abos werden hier
// re-validiert (Renewal → nextBillingDate verlängern, sonst nach 3 Tagen Kulanz 'expired').
// iOS: primär macht das der ASSN-Webhook; hier nur ein Backstop, falls Notifications (noch)
// nicht konfiguriert sind oder verloren gingen.
const ANDROID_EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
// ponytail: 16 Tage = Apples maximale Billing-Grace-Period; verkürzen, sobald ASSN stabil läuft.
const IOS_BACKSTOP_GRACE_MS = 16 * 24 * 60 * 60 * 1000;

export const checkIapSubscriptions = functions.runWith({ timeoutSeconds: 300 }).region('europe-west1').pubsub
  .schedule('every 6 hours').onRun(async () => {
    const now = Date.now();
    // Firestore erlaubt nur einen 'in'-Filter pro Query → pro Plattform eine eigene Abfrage.
    const snapshots = await Promise.all(['ios', 'android'].map(p =>
      db.collection('companies')
        .where('iapPlatform', '==', p)
        .where('subscriptionStatus', 'in', ['active', 'cancelled', 'past_due'])
        .limit(500).get()
    ));
    const docs = snapshots.flatMap(s => s.docs);

    let renewed = 0; let expired = 0;
    for (const docSnap of docs) {
      const data = docSnap.data();
      const nextBilling = data.nextBillingDate?.toMillis?.() ?? (data.nextBillingDate ? Date.parse(data.nextBillingDate) : 0);
      if (!nextBilling || nextBilling > now) continue;

      if (data.iapPlatform === 'android' && data.iapPurchaseToken && data.iapProductId) {
        try {
          const result = await verifyGoogleSubscription(data.iapPurchaseToken, data.iapProductId);
          if (result.valid && result.expiresAt && result.expiresAt > now) {
            await docSnap.ref.set({
              subscriptionStatus: result.autoRenewing ? 'active' : 'cancelled',
              nextBillingDate: admin.firestore.Timestamp.fromMillis(result.expiresAt),
            }, { merge: true });
            renewed++;
          } else if (now > nextBilling + ANDROID_EXPIRY_GRACE_MS) {
            await docSnap.ref.set({ subscriptionStatus: 'expired' }, { merge: true });
            expired++;
          }
        } catch (e) {
          functions.logger.warn(`[IAP-Lifecycle] Google-Recheck für ${docSnap.id} fehlgeschlagen:`, e);
        }
      } else if (data.iapPlatform === 'ios' && now > nextBilling + IOS_BACKSTOP_GRACE_MS) {
        await docSnap.ref.set({ subscriptionStatus: 'expired' }, { merge: true });
        expired++;
      }
    }
    functions.logger.log(`[IAP-Lifecycle] ${docs.length} geprüft, ${renewed} verlängert, ${expired} abgelaufen`);
  });

// ─── Export Helpers for Testing ─────────────────────────────────────────────
export { calculateEstimateMargin, getGradeFromMargin, getOwnerNotificationPref, isAlertThrottled, setAlertThrottled, priceForTargetMargin, fmtEuro, parseGermanNumber };
