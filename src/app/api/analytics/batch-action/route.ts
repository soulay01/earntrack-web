import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await admin.auth.verifyIdToken(authHeader)
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { uids, action } = await req.json()
    if (!Array.isArray(uids) || uids.length === 0) {
      return NextResponse.json({ error: 'No uids provided' }, { status: 400 })
    }

    const db = admin.db
    let success = 0
    let errors: string[] = []

    if (action === 'grantPro') {
      for (const uid of uids) {
        try {
          const userDoc = await db.collection('users').doc(uid).get()
          if (!userDoc.exists) { errors.push(`${uid}: user not found`); continue }
          const userData = userDoc.data()
          const companyId = userData?.companyId || uid

          const now = new Date().toISOString()
          const companyRef = db.collection('companies').doc(companyId)
          const companyDoc = await companyRef.get()
          if (companyDoc.exists) {
            await companyRef.update({
              subscriptionPlan: 'solo',
              subscriptionStatus: 'active',
              updatedAt: now,
            })
          } else {
            await companyRef.set({
              name: userData?.displayName || 'Unbekannt',
              subscriptionPlan: 'solo',
              subscriptionStatus: 'active',
              createdAt: now,
              updatedAt: now,
            })
          }
          success++
        } catch (e: any) {
          errors.push(`${uid}: ${e.message}`)
        }
      }
    } else if (action === 'removePro') {
      for (const uid of uids) {
        try {
          const userDoc = await db.collection('users').doc(uid).get()
          if (!userDoc.exists) { errors.push(`${uid}: user not found`); continue }
          const userData = userDoc.data()
          const companyId = userData?.companyId || uid

          const companyRef = db.collection('companies').doc(companyId)
          const companyDoc = await companyRef.get()
          if (companyDoc.exists) {
            await companyRef.update({
              subscriptionPlan: 'trial',
              subscriptionStatus: 'trial',
              updatedAt: new Date().toISOString(),
            })
          }
          success++
        } catch (e: any) {
          errors.push(`${uid}: ${e.message}`)
        }
      }
    } else if (action === 'endDemo') {
      for (const uid of uids) {
        try {
          const userDoc = await db.collection('users').doc(uid).get()
          if (!userDoc.exists) { errors.push(`${uid}: user not found`); continue }
          const userData = userDoc.data()
          const companyId = userData?.companyId || uid
          const companyRef = db.collection('companies').doc(companyId)
          const companyDoc = await companyRef.get()
          if (companyDoc.exists) {
            await companyRef.update({
              subscriptionStatus: 'expired',
              updatedAt: new Date().toISOString(),
            })
          }
          success++
        } catch (e: any) {
          errors.push(`${uid}: ${e.message}`)
        }
      }
    } else if (action === 'delete') {
      for (const uid of uids) {
        try {
          const userDoc = await db.collection('users').doc(uid).get()
          const userData = userDoc.data()
          const companyId = userData?.companyId || uid

          await Promise.allSettled([
            admin.auth.deleteUser(uid).catch(() => {}),
            db.collection('users').doc(uid).delete(),
            db.collection('companies').doc(companyId).delete().catch(() => {}),
          ])
          success++
        } catch (e: any) {
          errors.push(`${uid}: ${e.message}`)
        }
      }
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ success, errors: errors.length > 0 ? errors : undefined })
  } catch (e: any) {
    console.error('Batch action error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
