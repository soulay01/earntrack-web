import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'
import crypto from 'crypto'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)
const COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET

export async function POST(req: NextRequest) {
  if (!COOKIE_SECRET) return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  try {
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const { idToken } = body
    if (!idToken) return NextResponse.json({ error: 'No token' }, { status: 400 })

    const decoded = await admin.auth.verifyIdToken(idToken)
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = JSON.stringify({ uid: decoded.uid, email: decoded.email, exp: Date.now() + 3600000 })
    const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('hex')
    const token = Buffer.from(payload).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.' + sig

    const res = NextResponse.json({ ok: true })
    res.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unauthorized' }, { status: 401 })
  }
}
