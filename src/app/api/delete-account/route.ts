import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'
import { getStorage } from 'firebase-admin/storage'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await admin.auth.verifyIdToken(authHeader)
    const uid = decoded.uid

    const userDocSnap = await admin.db.collection('users').doc(uid).get()
    if (!userDocSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userData = userDocSnap.data()!
    const companyId = userData.companyId || uid

    // Only owners can delete the account
    if (userData.role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const companyDocSnap = await admin.db.collection('companies').doc(companyId).get()
    const companyData = companyDocSnap.data()

    // Get all assignment IDs before deleting assignments
    const assignmentsSnap = await admin.db.collection('assignments')
      .where('companyId', '==', companyId)
      .get()
    const assignmentIds = assignmentsSnap.docs.map(d => d.id)

    // Collect all note IDs for reply cleanup
    const allNoteIds: string[] = []
    for (let i = 0; i < assignmentIds.length; i += 10) {
      const chunk = assignmentIds.slice(i, i + 10)
      const notesSnap = await admin.db.collection('project_notes')
        .where('assignmentId', 'in', chunk)
        .get()
      notesSnap.docs.forEach(d => allNoteIds.push(d.id))
    }

    // Delete project_members (doc key = assignmentId)
    for (const aId of assignmentIds) {
      await admin.db.collection('project_members').doc(aId).delete().catch(e => console.warn('project_members delete failed', e))
    }

    // Delete project_photos + storage files
    for (let i = 0; i < assignmentIds.length; i += 10) {
      const chunk = assignmentIds.slice(i, i + 10)
      const snap = await admin.db.collection('project_photos').where('assignmentId', 'in', chunk).get()
      // Try to delete storage files (non-blocking)
      try {
        const bucket = getStorage().bucket()
        for (const d of snap.docs) {
          const storagePath = d.data().storagePath as string | undefined
          if (storagePath) bucket.file(storagePath).delete().catch((e: unknown) => console.warn('photo storage delete failed', e))
        }
      } catch (e) { console.warn('photo deletion error', e) }
      // Delete Firestore docs
      const batch = admin.db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }

    // Delete assignment-linked collections (project_notes, notifications, project_invites)
    for (let i = 0; i < assignmentIds.length; i += 10) {
      const chunk = assignmentIds.slice(i, i + 10)
      for (const col of ['project_notes', 'notifications', 'project_invites'] as const) {
        const snap = await admin.db.collection(col).where('assignmentId', 'in', chunk).get()
        const batch = admin.db.batch()
        snap.docs.forEach(d => batch.delete(d.ref))
        await batch.commit()
      }
    }

    // Delete project_note_replies by noteId
    for (let i = 0; i < allNoteIds.length; i += 10) {
      const chunk = allNoteIds.slice(i, i + 10)
      const snap = await admin.db.collection('project_note_replies').where('noteId', 'in', chunk).get()
      const batch = admin.db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }

    // Delete companyId-based collections
    const collections = ['employees', 'customers', 'invoices', 'estimates', 'clock_entries', 'payment_requests'] as const
    for (const col of collections) {
      const snap = await admin.db.collection(col).where('companyId', '==', companyId).get()
      const batch = admin.db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }

    // Delete usage_log for this user
    const usageSnap = await admin.db.collection('usage_log').where('uid', '==', uid).get()
    const usageBatch = admin.db.batch()
    usageSnap.docs.forEach(d => usageBatch.delete(d.ref))
    await usageBatch.commit()

    // Delete demo_signup if exists
    try {
      await admin.db.collection('demo_signups').doc(uid).delete()
    } catch {}

    // Delete user photos from Storage
    try {
      const bucket = getStorage().bucket()
      const prefixes = [`project_photos/${uid}/`, `employee_photos/${uid}/`, `logos/${uid}/`]
      for (const prefix of prefixes) {
        try {
          const [files] = await bucket.getFiles({ prefix })
          for (const file of files) await file.delete().catch((e: unknown) => console.warn('file delete failed', e))
        } catch (e) { console.warn('storage prefix delete error', e) }
      }
    } catch (e) { console.warn('storage delete error', e) }

    // Cancel Stripe subscription if active (hard-fail only for unexpected errors)
    const stripeCustomerId = companyData?.stripeCustomerId
    const stripeSubscriptionId = companyData?.stripeSubscriptionId
    if (stripeSubscriptionId) {
      try {
        const stripe = getStripe()
        await stripe.subscriptions.cancel(stripeSubscriptionId)
      } catch (e: any) {
        // 404 = already canceled at Stripe → safe to continue
        if (e?.code === 'resource_missing') {
          console.warn('Stripe subscription already canceled (stale ID)')
        } else {
          console.error('Stripe cancel failed — aborting account deletion to prevent orphan billing:', e)
          return NextResponse.json({ error: 'Konto konnte nicht gelöscht werden – Stripe-Fehler. Bitte kontaktiere den Support.' }, { status: 500 })
        }
      }
    } else if (stripeCustomerId) {
      try {
        const stripe = getStripe()
        const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 1 })
        if (subs.data.length > 0) {
          await stripe.subscriptions.cancel(subs.data[0].id)
        }
      } catch (e: any) {
        if (e?.code !== 'resource_missing') {
          console.error('Stripe cancel by customer failed — aborting:', e)
          return NextResponse.json({ error: 'Konto konnte nicht gelöscht werden – Stripe-Fehler.' }, { status: 500 })
        }
      }
    }

    // Delete Firebase Auth user last — Firestore deletes are run first to maximize cleanup
    await admin.auth.deleteUser(uid)

    // Delete user doc, company doc, referrer doc
    await admin.db.collection('users').doc(uid).delete().catch(e => console.warn('user doc delete failed', e))
    await admin.db.collection('companies').doc(companyId).delete().catch(e => console.warn('company doc delete failed', e))
    await admin.db.collection('user_referrers').doc(uid).delete().catch(e => console.warn('referrer doc delete failed', e))
    // Clean up settings subcollection
    try {
      const settingsSnap = await admin.db.collection('companies').doc(companyId).collection('settings').get()
      const settingsBatch = admin.db.batch()
      settingsSnap.docs.forEach(d => settingsBatch.delete(d.ref))
      await settingsBatch.commit()
    } catch (e) { console.warn('settings cleanup error', e) }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Delete account error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
