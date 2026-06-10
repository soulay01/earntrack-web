import emailjs from '@emailjs/browser';

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = 'template_fxy5kkj';
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

if (!SERVICE_ID || !PUBLIC_KEY) {
  console.warn('EmailJS nicht konfiguriert (NEXT_PUBLIC_EMAILJS_SERVICE_ID / PUBLIC_KEY fehlen)');
} else {
  emailjs.init(PUBLIC_KEY);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

const SENT_LOG_KEY = 'et_email_sent';

function getSent(): Set<string> {
  try { if (typeof window === 'undefined') return new Set(); return new Set(JSON.parse(localStorage.getItem(SENT_LOG_KEY) || '[]')); }
  catch (e) { console.warn('getSent localStorage failed', e); return new Set(); }
}

function markSent(key: string) {
  try {
    const set = getSent();
    set.add(key);
    localStorage.setItem(SENT_LOG_KEY, JSON.stringify([...set]));
  } catch (e) { console.warn('markSent localStorage failed', e); }
}

export async function sendEmailNotifications(
  userEmail: string,
  dueInvoices: { projekt: string; dueDate: string }[],
  upcomingAssignments: { projekt: string; kunde: string; datum: string }[],
) {
  const today = fmtDate(new Date());

  if (!SERVICE_ID || !PUBLIC_KEY) return;

  for (const inv of dueInvoices) {
    const key = `email_invoice_${inv.projekt}_${today}`;
    if (getSent().has(key)) continue;
    const msg = `Die Rechnung für <b>${inv.projekt}</b> ist seit dem <b>${inv.dueDate}</b> fällig.<br><br>Bitte in EarnTrack prüfen und den Zahlungseingang verbuchen.`;
    try {
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
        to_email: userEmail,
        subject: `📄 Rechnungserinnerung: ${inv.projekt}`,
        message: msg,
      });
      markSent(key);
    }     catch (e) { console.warn('EmailJS invoice notification failed', e); }
  }

  for (const a of upcomingAssignments) {
    const key = `email_reminder_${a.projekt}_${today}`;
    if (getSent().has(key)) continue;
    const kunde = a.kunde ? ` (<b>${a.kunde}</b>)` : '';
    const msg = `Der Termin <b>${a.projekt}</b>${kunde} ist am <b>${a.datum}</b>.<br><br>Stelle sicher, dass alle Vorbereitungen abgeschlossen sind.`;
    try {
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
        to_email: userEmail,
        subject: `⏰ Terminerinnerung: ${a.projekt}`,
        message: msg,
      });
      markSent(key);
    }     catch (e) { console.warn('EmailJS reminder notification failed', e); }
  }
}
