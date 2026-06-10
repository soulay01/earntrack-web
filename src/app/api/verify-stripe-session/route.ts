import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import admin from '@/lib/firebase-admin'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) {
      return NextResponse.json({ verified: false, error: 'Unauthorized' }, { status: 401 })
    }

    let uid: string
    try {
      const decoded = await admin.auth.verifyIdToken(authHeader)
      uid = decoded.uid
    } catch {
      return NextResponse.json({ verified: false, error: 'Invalid token' }, { status: 401 })
    }

    const { session_id } = await req.json()
    if (!session_id) {
      return NextResponse.json({ verified: false, error: 'Missing session_id' }, { status: 400 })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(session_id)

    // Verify the session belongs to this user
    if (session.metadata?.uid && session.metadata.uid !== uid) {
      return NextResponse.json({ verified: false, error: 'Verification failed' }, { status: 403 })
    }

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({ verified: false, error: 'Session not paid' })
    }

    return NextResponse.json({ verified: true })
  } catch (err: any) {
    console.error('Session verification error:', err)
    return NextResponse.json({ verified: false, error: 'Verification failed' }, { status: 500 })
  }
}
