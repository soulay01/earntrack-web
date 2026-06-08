import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import crypto from 'crypto'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const { path, referrer } = await req.json().catch(() => ({ path: '/', referrer: '' }))

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || ''
    const ua = req.headers.get('user-agent') || ''

    const dateStr = new Date().toISOString().split('T')[0]

    const pageview = {
      path: path || '/',
      referrer: referrer || '',
      ua: ua.slice(0, 500),
      ipHash: ip ? crypto.createHash('sha256').update(ip + 'earntrack-pv').digest('hex').slice(0, 16) : '',
      timestamp: FieldValue.serverTimestamp(),
      date: dateStr,
    }

    await admin.db.collection('page_views').add(pageview)

    return NextResponse.json({ ok: true }, { headers: corsHeaders })
  } catch (e: any) {
    console.error('Pageview error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders })
  }
}
