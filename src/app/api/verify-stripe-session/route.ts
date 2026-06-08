import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const { session_id } = await req.json()
    if (!session_id) {
      return NextResponse.json({ verified: false, error: 'Missing session_id' }, { status: 400 })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(session_id)

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({ verified: false, error: 'Session not paid' })
    }

    return NextResponse.json({ verified: true })
  } catch (err: any) {
    console.error('Session verification error:', err)
    return NextResponse.json({ verified: false, error: 'Verification failed' }, { status: 500 })
  }
}
