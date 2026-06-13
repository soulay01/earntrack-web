import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)
const CLEANUP_LOCK_SECONDS = 300 // 5 Minuten cooldown für erneute Ausführung

export async function POST(req: NextRequest) {
  try {
    // Auth check: nur Admins oder der Company-Inhaber selbst darf Cleanup auslösen
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = await admin.auth.verifyIdToken(authHeader)
    const uid = decoded.uid
    const db = admin.db

    // Inhaber-Check: den Company-Eintrag des Users laden
    const userDoc = await db.collection('users').doc(uid).get()
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const userData = userDoc.data()!
    const companyId = userData.companyId || uid

    // Admin darf jede Company cleanupen
    const isAdmin = ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || '')
    const targetCompanyId = isAdmin
      ? (await req.json().catch(() => ({ companyId: null }))).companyId || companyId
      : companyId

    const companyRef = db.collection('companies').doc(targetCompanyId)
    const companySnap = await companyRef.get()
    if (!companySnap.exists) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const company = companySnap.data()!

    // Prüfen ob excessCleanupAt gesetzt und abgelaufen ist
    const cleanupAt = company.excessCleanupAt?.toDate
      ? company.excessCleanupAt.toDate()
      : company.excessCleanupAt ? new Date(company.excessCleanupAt) : null

    if (!cleanupAt || cleanupAt.getTime() > Date.now()) {
      return NextResponse.json({ message: 'Cleanup noch nicht fällig', daysLeft: cleanupAt ? Math.ceil((cleanupAt.getTime() - Date.now()) / 86400000) : 0 })
    }

    // Prüfen ob bereits ein Cleanup-Lock aktiv ist (verhindert parallele Läufe)
    // Lock gilt nach CLEANUP_LOCK_SECONDS * 2 automatisch als abgelaufen (Absturz-Sicherung)
    const lockTimestamp = company.excessCleanupLock?.toDate
      ? company.excessCleanupLock.toDate().getTime()
      : company.excessCleanupLock
        ? company.excessCleanupLock
        : 0
    const lockAge = Date.now() - lockTimestamp
    if (lockTimestamp > 0 && lockAge < CLEANUP_LOCK_SECONDS * 1000) {
      return NextResponse.json({ message: 'Cleanup läuft bereits' })
    }

    // Cleanup-Lock setzen (Datum statt Timestamp für Absturz-Sicherheit)
    await companyRef.update({
      excessCleanupLock: FieldValue.serverTimestamp(),
    })

    // Überschüssige Mitarbeiter löschen (neueste zuerst)
    const dataTypes = company.excessDataTypes || ['employees']
    const planLimit = company.excessCount || 0
    let deletedCount = 0
    const errors: string[] = []

    if (dataTypes.includes('employees')) {
      const employeesSnap = await db.collection('employees')
        .where('companyId', '==', targetCompanyId)
        .get()

      const allEmployees = employeesSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a, b) => {
          // Nach createdAt sortieren (älteste zuerst)
          const aTime = a.createdAt?.toDate?.()?.getTime() || a.createdAt || 0
          const bTime = b.createdAt?.toDate?.()?.getTime() || b.createdAt || 0
          return aTime - bTime
        })
      const planEmployeeLimit = company.subscriptionPlan === 'solo' ? 2
        : company.subscriptionPlan === 'team' ? 5
        : company.subscriptionPlan === 'business' ? Infinity
        : company.subscriptionPlan === 'trial' ? Infinity
        : 2

      if (planEmployeeLimit === Infinity) {
        // Unbegrenzt → keinen Cleanup nötig
        await companyRef.update({
          excessCleanupAt: null,
          excessDataTypes: null,
          excessCount: null,
          excessOldPlan: null,
          excessCleanupLock: null,
          excessCleanupRanAt: FieldValue.serverTimestamp(),
        })
        return NextResponse.json({ message: 'Kein Cleanup nötig (unbegrenzter Plan)' })
      }

      const excessCount = allEmployees.length - planEmployeeLimit
      if (excessCount <= 0) {
        // Keine überschüssigen Mitarbeiter mehr
        await companyRef.update({
          excessCleanupAt: null,
          excessDataTypes: null,
          excessCount: null,
          excessOldPlan: null,
          excessCleanupLock: null,
          excessCleanupRanAt: FieldValue.serverTimestamp(),
        })
        return NextResponse.json({ message: 'Keine überschüssigen Mitarbeiter mehr', deletedCount: 0 })
      }

      // Die neuesten excessCount Mitarbeiter löschen (als Batch)
      const toDelete = allEmployees.slice(-excessCount) // neueste zuerst
      const BATCH_LIMIT = 500
      for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
        const batch = db.batch()
        const chunk = toDelete.slice(i, i + BATCH_LIMIT)
        for (const emp of chunk) {
          batch.delete(db.collection('employees').doc(emp.id))
        }
        await batch.commit()
        deletedCount += chunk.length
      }
    }

    // Cleanup-Lock entfernen + markieren als ausgeführt
    await companyRef.update({
      excessCleanupAt: null,
      excessDataTypes: null,
      excessCount: null,
      excessOldPlan: null,
      excessCleanupLock: null,
      excessCleanupRanAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e: any) {
    console.error('Cleanup-excess error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
