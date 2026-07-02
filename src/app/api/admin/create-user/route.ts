import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

async function verifyOwner(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!authHeader) return null;
    const decoded = await admin.auth.verifyIdToken(authHeader);
    const userDoc = await admin.db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'owner') return null;
    return decoded.uid;
  } catch (e) { console.error('verifyOwner error:', e); return null; }
}

export async function POST(req: NextRequest) {
  try {
    const ownerUid = await verifyOwner(req);
    if (!ownerUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { email, password, displayName, companyId, role, linkedToProjects } = body;
    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let userUid: string;
    let isExisting = false;
    try {
      const user = await admin.auth.createUser({ email, password, displayName, emailVerified: true });
      userUid = user.uid;
    } catch (e: any) {
      if (e.code === 'auth/email-already-exists') {
        const existing = await admin.auth.getUserByEmail(email);
        userUid = existing.uid;
        isExisting = true;
      } else {
        throw e;
      }
    }

    const ownerUserDoc = await admin.db.collection('users').doc(ownerUid).get();
    const safeCompanyId = ownerUserDoc.data()?.companyId || ownerUid;
    const safeRole = ['employee', 'manager'].includes(role) ? role : 'employee';

    await admin.db.collection('users').doc(userUid).set({
      email,
      displayName,
      companyId: safeCompanyId,
      role: safeRole,
      createdAt: new Date(),
      ...(linkedToProjects ? { linkedToProjects } : {}),
    }, { merge: true });

    return NextResponse.json({ uid: userUid, email, isExisting });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await verifyOwner(req);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { uid: targetUid, email } = body;
    if (!targetUid && !email) return NextResponse.json({ error: 'Missing uid or email' }, { status: 400 });

    if (targetUid) {
      await admin.auth.deleteUser(targetUid);
      await admin.db.collection('users').doc(targetUid).delete().catch(() => {});
    } else {
      const userRecord = await admin.auth.getUserByEmail(email);
      await admin.auth.deleteUser(userRecord.uid);
      await admin.db.collection('users').doc(userRecord.uid).delete().catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.code === 'auth/user-not-found') {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
