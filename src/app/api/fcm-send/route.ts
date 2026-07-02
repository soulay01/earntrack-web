import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

interface FcmSendBody {
  tokens: string[];
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
    try {
      await admin.auth.verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body: FcmSendBody = await request.json();
    const { tokens, title, body: messageBody, data, silent } = body;

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'No tokens provided' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: 'No title provided' }, { status: 400 });
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
