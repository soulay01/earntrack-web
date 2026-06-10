import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

// Server-side only — NOT prefixed with NEXT_PUBLIC_, never reaches client bundle
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ isAdmin: false }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = await admin.auth.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();

    if (!email || !ADMIN_EMAILS.includes(email)) {
      return NextResponse.json({ isAdmin: false }, { status: 403 });
    }

    return NextResponse.json({ isAdmin: true, email });
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }
}
