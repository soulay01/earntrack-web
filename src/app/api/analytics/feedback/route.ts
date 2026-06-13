import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)

function toObj(snap: any) {
  return snap.docs.map((d: any) => {
    const data = d.data()
    const obj: any = { id: d.id }
    for (const key of Object.keys(data)) {
      const val = data[key]
      if (val && typeof val === 'object' && val.toDate) {
        obj[key] = val.toDate().toISOString()
      } else if (val && typeof val === 'object' && val.seconds) {
        obj[key] = new Date(val.seconds * 1000).toISOString()
      } else {
        obj[key] = val
      }
    }
    return obj
  })
}

function parseSearchParams(url: string) {
  const u = new URL(url)
  return {
    status: u.searchParams.get('status') || '',
    platform: u.searchParams.get('platform') || '',
    category: u.searchParams.get('category') || '',
    search: u.searchParams.get('search') || '',
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await admin.auth.verifyIdToken(authHeader)
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { status, platform, category, search } = parseSearchParams(req.url)
    const db = admin.db

    let snap
    if (status) {
      snap = await db.collection('feedback')
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
    } else {
      snap = await db.collection('feedback')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
    }

    let feedback = toObj(snap)

    // Client-side filters for combos where compound indexes don't exist
    if (platform) feedback = feedback.filter((f: any) => f.platform === platform)
    if (category) feedback = feedback.filter((f: any) => f.category === category)
    if (search) {
      const q = search.toLowerCase()
      feedback = feedback.filter((f: any) =>
        (f.userEmail || '').toLowerCase().includes(q) ||
        (f.message || '').toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ feedback })
  } catch (e: any) {
    console.error('Feedback API GET error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await admin.auth.verifyIdToken(authHeader)
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { id, status: newStatus } = body

    if (!id || !newStatus) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    const validStatuses = ['new', 'read', 'resolved']
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }

    const db = admin.db
    await db.collection('feedback').doc(id).update({ status: newStatus })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Feedback API PATCH error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
