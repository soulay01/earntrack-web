import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getPriceIds } from '@/lib/plans';

const ALLOWED_ORIGINS = (process.env.ALLOWED_CORS_ORIGINS || 'https://earntrack.de,https://app.earntrack.de').split(',');

function getOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  try {
    const host = new URL(origin).host;
    return ALLOWED_ORIGINS.some(o => {
      const allowedHost = new URL(o.trim()).host;
      return host === allowedHost;
    }) ? origin : null;
  } catch {
    return null;
  }
}

export async function OPTIONS(req: Request) {
  const origin = getOrigin(req);
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin || 'https://earntrack.de',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(req: Request) {
  const origin = getOrigin(req) || 'https://earntrack.de';
  try {
    const { priceId, planId, planName, email } = await req.json();

    if (!priceId && !planId) {
      return NextResponse.json({ error: 'Kein Plan ausgewählt' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Ungültige E-Mail-Adresse' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } });
    }
    const validPlans = ['solo', 'team', 'business'];
    if (planId && (!validPlans.includes(planId) || (getPriceIds()[planId] !== undefined && getPriceIds()[planId] !== priceId))) {
      return NextResponse.json({ error: 'Ungültige Preis-ID für diesen Plan' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } });
    }

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      client_reference_id: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { plan: planId || planName || 'unknown' },
      success_url: `${origin}/auth/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/subscription?canceled=true`,
      locale: 'de',
    });

    return NextResponse.json({ url: session.url, checkoutUrl: session.url, sessionId: session.id }, { headers: { 'Access-Control-Allow-Origin': origin } });
  } catch (err: any) {
    console.error('Public checkout error:', err);
    return NextResponse.json({ error: 'Ein Fehler ist aufgetreten' }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } });
  }
}
