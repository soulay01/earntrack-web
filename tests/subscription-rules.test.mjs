// Prüft die Entscheidungsregeln, an denen Zugang und Doppelabrechnung hängen.
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/subscription-rules.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import {
  hasIapMarkers,
  blocksStripeCheckoutDueToIap,
  hasDualSubscription,
  isFullRefund,
} from '../src/lib/subscriptionRules.ts';

test('isFullRefund: Teilerstattung beendet das Abo nicht', () => {
  assert.strictEqual(isFullRefund(500, 4999), false);
  assert.strictEqual(isFullRefund(4998, 4999), false);
});

test('isFullRefund: Vollerstattung (auch mehr) zählt als voll', () => {
  assert.strictEqual(isFullRefund(4999, 4999), true);
  assert.strictEqual(isFullRefund(5000, 4999), true);
});

test('isFullRefund: fehlende oder unsinnige Beträge kündigen nicht', () => {
  assert.strictEqual(isFullRefund(undefined, undefined), false);
  assert.strictEqual(isFullRefund(0, 0), false);
  assert.strictEqual(isFullRefund(100, null), false);
});

test('blocksStripeCheckoutDueToIap: aktives Store-Abo blockiert den Web-Kauf', () => {
  assert.strictEqual(
    blocksStripeCheckoutDueToIap({ subscriptionStatus: 'active', iapPlatform: 'ios' }),
    true,
  );
});

test('blocksStripeCheckoutDueToIap: abgelaufenes Store-Abo blockiert nicht', () => {
  // Die IAP-Felder bleiben nach Ablauf stehen — wer danach über die Web-App
  // zahlen will, darf davon nicht ausgesperrt werden.
  assert.strictEqual(
    blocksStripeCheckoutDueToIap({ subscriptionStatus: 'expired', iapPlatform: 'ios' }),
    false,
  );
});

test('blocksStripeCheckoutDueToIap: Stripe-Kunde mit alten Store-Markern darf wechseln', () => {
  assert.strictEqual(
    blocksStripeCheckoutDueToIap({
      subscriptionStatus: 'active',
      iapPlatform: 'ios',
      stripeSubscriptionId: 'sub_123',
    }),
    false,
  );
});

test('hasDualSubscription: Store-Kauf bei laufendem Stripe-Abo ist ein Konflikt', () => {
  assert.strictEqual(
    hasDualSubscription({ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' }, 'iap'),
    true,
  );
});

test('hasDualSubscription: Web-Kauf bei laufendem Store-Abo ist ein Konflikt', () => {
  assert.strictEqual(
    hasDualSubscription({ subscriptionStatus: 'active', revenuecatProductId: 'p_1' }, 'stripe'),
    true,
  );
});

test('hasDualSubscription: nur ein Kanal ist kein Konflikt', () => {
  assert.strictEqual(
    hasDualSubscription({ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' }, 'stripe'),
    false,
  );
  assert.strictEqual(
    hasDualSubscription({ subscriptionStatus: 'cancelled', stripeSubscriptionId: 'sub_1' }, 'iap'),
    false,
  );
});

test('hasIapMarkers erkennt alle drei Herkunftsfelder', () => {
  assert.strictEqual(hasIapMarkers({ iapPlatform: 'android' }), true);
  assert.strictEqual(hasIapMarkers({ appleOriginalTransactionId: '1000' }), true);
  assert.strictEqual(hasIapMarkers({ revenuecatProductId: 'p' }), true);
  assert.strictEqual(hasIapMarkers({}), false);
});
