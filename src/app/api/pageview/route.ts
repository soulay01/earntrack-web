import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import crypto from 'crypto'

const ALLOWED_ORIGINS = (process.env.ALLOWED_CORS_ORIGINS || 'https://earntrack.de,https://app.earntrack.de').split(',')

function getAllowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin')
  if (!origin) return null
  try {
    const host = new URL(origin).host
    return ALLOWED_ORIGINS.some(o => {
      const allowedHost = new URL(o.trim()).host
      return host === allowedHost
    }) ? origin : null
  } catch {
    return null
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || 'https://earntrack.de',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// Einfache In-Memory-Rate-Limiting (lebt pro Serverless-Instanz, aber besser als nichts)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 60

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_REQUESTS_PER_WINDOW
}

export async function OPTIONS(req: NextRequest) {
  const origin = getAllowedOrigin(req)
  return NextResponse.json({}, { headers: corsHeaders(origin) })
}

export async function POST(req: NextRequest) {
  const origin = getAllowedOrigin(req)
  const headers = corsHeaders(origin)

  try {
    const { path, referrer } = await req.json().catch(() => ({ path: '/', referrer: '' }))

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || ''
    const ua = req.headers.get('user-agent') || ''

    // Rate-Limit pro IP
    if (ip && !checkRateLimit(ip)) {
      console.warn('Rate limit exceeded for IP:', ip.slice(0, 8))
      return NextResponse.json({ ok: true }, { status: 200, headers }) // 429 wäre zu offen – lieber stumm droppen
    }

    const dateStr = new Date().toISOString().split('T')[0]
    const ipHashSalt = process.env.PAGEVIEW_SALT
    if (!ipHashSalt) {
      // Kein Salt konfiguriert → IP nicht hashen (DSGVO-konformer als bekannter Default-Salt)
      return NextResponse.json({ ok: true }, { status: 200, headers })
    }

    const pageview = {
      path: path || '/',
      referrer: referrer || '',
      ua: ua.slice(0, 500),
      ipHash: ip ? crypto.createHash('sha256').update(ip + ipHashSalt).digest('hex').slice(0, 16) : '',
      timestamp: FieldValue.serverTimestamp(),
      date: dateStr,
    }

    await admin.db.collection('page_views').add(pageview)

    return NextResponse.json({ ok: true }, { headers })
  } catch (e: any) {
    console.error('Pageview error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers })
  }
}
