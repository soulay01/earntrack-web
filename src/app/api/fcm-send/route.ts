import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

interface FcmSendBody {
  uids: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  silent?: boolean;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`fcm-send:${ip}`, { windowMs: 60_000, max: 20 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let callerUid: string;
    try {
      callerUid = (await admin.auth.verifyIdToken(authHeader.slice(7))).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body: FcmSendBody = await request.json();
    const { uids, title, body: messageBody, data, silent } = body;

    // Eingaben an der Vertrauensgrenze validieren (verhindert Payload-Abuse)
    if (!Array.isArray(uids) || uids.length === 0 || !uids.every(u => typeof u === 'string' && u.length > 0)) {
      return NextResponse.json({ error: 'No valid uids provided' }, { status: 400 });
    }
    // Legitime Sends gehen an wenige Projekt-Mitglieder – harte Obergrenze gegen Massen-Push-Missbrauch
    if (uids.length > 100) {
      return NextResponse.json({ error: 'Too many uids' }, { status: 400 });
    }
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'No title provided' }, { status: 400 });
    }
    if (title.length > 200 || (messageBody != null && (typeof messageBody !== 'string' || messageBody.length > 1000))) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 400 });
    }

    // Zielautorisierung: der Client darf keine rohen Device-Tokens mehr vorgeben (die serverseitig
    // nie geprüft wurden – jeder eingeloggte User hätte damit beliebige Geräte anpingen können).
    // Stattdessen löst der Server die uids selbst auf und pusht nur an Nutzer der EIGENEN Firma.
    const callerDoc = await admin.db.collection('users').doc(callerUid).get();
    const callerCompanyId = callerDoc.data()?.companyId || callerUid;

    const userDocs = await Promise.all(uids.map(uid => admin.db.collection('users').doc(uid).get()));
    const tokens = userDocs
      .filter(d => d.exists && d.data()?.companyId === callerCompanyId && typeof d.data()?.fcmToken === 'string')
      .map(d => d.data()!.fcmToken as string);

    if (tokens.length === 0) {
      return NextResponse.json({ success: false, successCount: 0, failureCount: 0, total: 0 });
    }

    const { getMessaging } = await import('@/lib/firebase-admin');

    const messaging = getMessaging();

    const message = {
      tokens,
      data: {
        ...(data || {}),
        title,
        body: messageBody || '',
        silent: silent ? 'true' : 'false',
        sound: silent ? 'false' : 'default',
      },
      webpush: {
        fcmOptions: {
          link: data?.url || '/',
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);

    const successCount = response.successCount;
    const failureCount = response.failureCount;

    // Log any errors
    if (failureCount > 0) {
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          console.warn(`FCM send failed for token ${idx}:`, resp.error?.code || resp.error?.message);
        }
      });
    }

    return NextResponse.json({
      success: successCount > 0,
      successCount,
      failureCount,
      total: tokens.length,
    });
  } catch (error: any) {
    console.error('FCM send error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send FCM notification' },
      { status: 500 }
    );
  }
}
