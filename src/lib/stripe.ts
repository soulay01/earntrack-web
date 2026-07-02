import Stripe from 'stripe';

// STRIPE_TEST_MODE ist server-only (kein NEXT_PUBLIC_-Prefix).
// Wert darf niemals im Client-Bundle landen — steuert welcher Secret-Key verwendet wird.
const isTestMode = () => process.env.STRIPE_TEST_MODE === 'true';

export function getStripe(): Stripe {
  const key = isTestMode()
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      `Stripe ${isTestMode() ? 'test' : 'live'} secret key not configured`
    );
  }
  // Validierung: Key-Präfix muss zum Mode passen
  if (isTestMode() && !key.startsWith('sk_test_')) {
    throw new Error('STRIPE_TEST_MODE=true but STRIPE_TEST_SECRET_KEY does not start with sk_test_');
  }
  if (!isTestMode() && !key.startsWith('sk_live_')) {
    throw new Error('STRIPE_TEST_MODE is not set but STRIPE_SECRET_KEY does not start with sk_live_');
  }
  return new Stripe(key, {
    apiVersion: '2025-02-24.acacia' as any,
  });
}

export function isStripeTestMode(): boolean {
  return isTestMode();
}

export function getStripePriceId(planId: string): string {
  const prefix = isTestMode() ? 'NEXT_PUBLIC_STRIPE_TEST_PRICE_' : 'NEXT_PUBLIC_STRIPE_PRICE_';
  return process.env[`${prefix}${planId.toUpperCase()}`] || '';
}
