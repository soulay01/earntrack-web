import { NextRequest, NextResponse } from 'next/server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)
const COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET

async function verifySession(token: string): Promise<boolean> {
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return false
    const payloadB64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const payload = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(payload)
    if (!ADMIN_EMAILS.includes((data.email || '').toLowerCase())) return false
    if (Date.now() > data.exp) return false

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(COOKIE_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const expectedBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
    const expected = Array.from(new Uint8Array(expectedBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
    return sig === expected
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Nur prüfen wenn COOKIE_SECRET konfiguriert ist – sonst verlassen wir uns auf
  // Firebase Auth + ADMIN_EMAILS in den API Routes (stärkere Absicherung)
  if (!COOKIE_SECRET) return NextResponse.next()

  if (pathname.startsWith('/analytics') || pathname.startsWith('/api/analytics')) {
    const session = req.cookies.get('admin_session')?.value
    if (!session || !(await verifySession(session))) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const login = new URL('/login', req.url)
      login.searchParams.set('redirect', pathname)
      return NextResponse.redirect(login)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/analytics/:path*', '/api/analytics/:path*'],
}
