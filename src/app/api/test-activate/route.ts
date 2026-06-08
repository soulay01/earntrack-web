import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

    if (getApps().length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : undefined;
      initializeApp(
        serviceAccount
          ? { credential: cert(serviceAccount) }
          : { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }
      );
    }

    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    // Verify owner role
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body.reset ? 'expired' : 'active';

    await db.collection('companies').doc(uid).set({
      subscriptionStatus: status,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Test activate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
