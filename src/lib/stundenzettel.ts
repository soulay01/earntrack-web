import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';
import type { RawClockEntry, StundenzettelRow } from '@/lib/timeTracking';

export type { RawClockEntry, StundenzettelRow } from '@/lib/timeTracking';
export { buildStundenzettelRows } from '@/lib/timeTracking';

// from/to muss der Aufrufer bereits auf Tagesanfang/-ende setzen (z.B. 00:00 / 23:59:59).
export async function fetchClockEntriesInRange(companyId: string, from: Date, to: Date): Promise<RawClockEntry[]> {
  const snap = await getDocs(query(
    collection(db, 'clock_entries'),
    where('companyId', '==', companyId),
    where('clockIn', '>=', from),
    where('clockIn', '<=', to)
  ));
  return snap.docs.map(d => {
    const data: any = d.data();
    const clockIn = data.clockIn?.toDate ? data.clockIn.toDate() : new Date(data.clockIn);
    const clockOut = data.clockOut?.toDate ? data.clockOut.toDate() : data.clockOut ? new Date(data.clockOut) : null;
    const breakMinutes = Math.round((data.totalBreakMs ?? (data.totalBreakMinutes || 0) * 60000) / 60000);
    return { userId: data.userId, userEmail: data.userEmail, userName: data.userName, assignmentId: data.assignmentId, clockIn, clockOut, breakMinutes };
  });
}

export function generateStundenzettelPDF(params: {
  companyName: string;
  employeeName: string;
  rows: StundenzettelRow[];
  from: Date;
  to: Date;
}): jsPDF {
  const { companyName, employeeName, rows, from, to } = params;
  const fmt = (d: Date) => d.toLocaleDateString('de-DE');
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('Stundenzettel', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(companyName, 14, 25);
  doc.text(`Mitarbeiter: ${employeeName}`, 14, 31);
  doc.text(`Zeitraum: ${fmt(from)} – ${fmt(to)}`, 14, 37);

  const totalHours = rows.reduce((sum, r) => sum + r.stunden, 0);
  const totalLohn = rows.reduce((sum, r) => sum + r.lohn, 0);

  autoTable(doc, {
    startY: 44,
    head: [['Datum', 'Projekt', 'Beginn', 'Ende', 'Pause', 'Stunden', 'Lohn']],
    body: rows.map(r => [r.datum, r.projekt, r.beginn, r.ende, r.pause, r.stunden.toFixed(2), formatCurrency(r.lohn)]),
    foot: [['', '', '', '', 'Gesamt', `${totalHours.toFixed(2)} h`, formatCurrency(totalLohn)]],
    headStyles: { fillColor: [13, 148, 136] },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    styles: { fontSize: 9 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 24;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.line(14, finalY, 84, finalY);
  doc.line(126, finalY, 196, finalY);
  doc.text('Datum, Unterschrift Mitarbeiter', 14, finalY + 5);
  doc.text('Datum, Unterschrift Arbeitgeber', 126, finalY + 5);

  return doc;
}

export function stundenzettelFileName(employeeName: string, from: Date, to: Date): string {
  const slug = (d: Date) => d.toISOString().split('T')[0];
  return `Stundenzettel_${employeeName.replace(/[^a-zA-Z0-9]+/g, '_')}_${slug(from)}_${slug(to)}.pdf`;
}
