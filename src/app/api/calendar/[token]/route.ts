import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

// Öffentlicher, unauthentifizierter ICS-Feed zum Abonnieren in Apple Kalender / Google Kalender.
// Der Token ersetzt die Anmeldung (wie bei jedem Kalender-Abo-Link) – daher Admin-SDK statt
// Firestore-Regeln, und der Token darf niemals aus einer Fehlermeldung erraten werden können.

function escapeIcsText(s: string): string {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function parseGermanDate(datum: string): Date | null {
  const m = String(datum || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(datum);
  return isNaN(d.getTime()) ? null : d;
}

function toIcsDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function toIcsTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return new NextResponse('Not found', { status: 404 });
  }

  const db = admin.db;
  const companySnap = await db.collection('companies').where('calendarToken', '==', token).limit(1).get();
  if (companySnap.empty) {
    return new NextResponse('Not found', { status: 404 });
  }
  const companyDoc = companySnap.docs[0];
  const companyId = companyDoc.id;
  const companyName = companyDoc.data().companyName || companyDoc.data().name || 'EarnTrack';

  const assignmentsSnap = await db.collection('assignments')
    .where('companyId', '==', companyId)
    .limit(1000)
    .get();

  const now = toIcsTimestamp(new Date());
  const events: string[] = [];

  for (const doc of assignmentsSnap.docs) {
    const a = doc.data();
    const start = parseGermanDate(a.datum);
    if (!start) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + 1); // Ganztägiger Termin: DTEND ist exklusiv (RFC 5545)

    const mitarbeiter = Array.isArray(a.mitarbeiter) ? a.mitarbeiter.join(', ') : (a.mitarbeiter || '');
    const summary = [a.kunde, a.projekt].filter(Boolean).join(' — ') || 'Termin';
    const descriptionParts = [
      a.status ? `Status: ${a.status}` : '',
      mitarbeiter ? `Mitarbeiter: ${mitarbeiter}` : '',
    ].filter(Boolean);

    events.push([
      'BEGIN:VEVENT',
      `UID:${doc.id}@earntrack.de`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcsDate(start)}`,
      `DTEND;VALUE=DATE:${toIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      descriptionParts.length ? `DESCRIPTION:${escapeIcsText(descriptionParts.join('\\n'))}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n'));
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EarnTrack//Kalender-Abo//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:EarnTrack – ${escapeIcsText(companyName)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="earntrack.ics"',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
