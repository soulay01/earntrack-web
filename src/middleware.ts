import { NextRequest, NextResponse } from 'next/server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)
const COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET

// In production muss ADMIN_COOKIE_SECRET gesetzt sein, sonst ist der Admin-Auth-Schutz deaktiviert
if (!COOKIE_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️ ADMIN_COOKIE_SECRET nicht gesetzt – Analytics-Middleware-Schutz ist deaktiviert!')
}

// Hilfsfunktion: generiert eine unlock-URL (nicht exportiert, da die Middleware Edge-kompatibel sein muss)
function createBlockResponse(pathname: string, req: NextRequest) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Admin auth not configured' }, { status: 401 });
  }
  const login = new URL('/login', req.url);
  login.searchParams.set('error', 'admin_auth_not_configured');
  login.searchParams.set('redirect', pathname);
  return NextResponse.redirect(login);
}

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

  // Ohne ADMIN_COOKIE_SECRET ist kein Session-Schutz möglich.
  // In Production: Zugriff blockieren (sonst liegen Analytics-Daten offen).
  // In Development: durchlassen (lokale Entwicklung, kein Productiveinsatz).
  if (!COOKIE_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return createBlockResponse(pathname, req);
    }
    return NextResponse.next();
  }

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
