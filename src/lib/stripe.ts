import Stripe from 'stripe';

const isTestMode = () => process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === 'true';

export function getStripe(): Stripe {
  const key = isTestMode()
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      `Stripe ${isTestMode() ? 'test' : 'live'} secret key not configured`
    );
  }
  return new Stripe(key, {
    apiVersion: '2026-04-22.dahlia',
  });
}

export function isStripeTestMode(): boolean {
  return isTestMode();
}

export function getStripePriceId(planId: string): string {
  const prefix = isTestMode() ? 'NEXT_PUBLIC_STRIPE_TEST_PRICE_' : 'NEXT_PUBLIC_STRIPE_PRICE_';
  return process.env[`${prefix}${planId.toUpperCase()}`] || '';
}
