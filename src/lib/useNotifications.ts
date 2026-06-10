'use client';

import { useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendEmailNotifications } from '@/lib/emailNotifications';
import type { Assignment } from '@/lib/types';

const CHECK_INTERVAL = 60000;
const NOTIFIED_KEYS = 'et_notified';

function getNotified(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEYS) || '[]'));
  } catch { return new Set(); }
}

function markNotified(key: string) {
  try {
    const set = getNotified();
    set.add(key);
    localStorage.setItem(NOTIFIED_KEYS, JSON.stringify([...set]));
  } catch (e) { console.warn('markNotified failed', e); }
}

export function useNotifications(user: any, assignments: Assignment[]) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const check = async () => {
      if (cancelled || !user) return;

      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists() || cancelled) return;
      const settings = snap.data().notifications;
      if (!settings) return;

      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      const dueInvoices: { projekt: string; dueDate: string }[] = [];
      const upcomingAssignments: { projekt: string; kunde: string; datum: string }[] = [];

      for (const a of assignmentsRef.current) {
        if (!a.projekt) continue;

        // Appointment reminders (today/tomorrow)
        if ((settings.browserReminders || settings.emailReports) && a.datum) {
          const [d, m, y] = a.datum.split('.');
          if (d && m && y) {
            const aDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
            const diffDays = Math.ceil((aDate.getTime() - now.getTime()) / 86400000);
            if (diffDays === 0 || diffDays === 1) {
              const key = `reminder_${a.id}_${today}`;
              if (!getNotified().has(key)) {
                if (settings.browserReminders && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                  new Notification(diffDays === 0 ? 'Termin heute' : 'Termin morgen', { body: `"${a.projekt}" ist ${diffDays === 0 ? 'heute' : 'morgen'} fällig`, icon: '/logo.png?v=2' });
                }
                if (settings.emailReports) {
                  upcomingAssignments.push({ projekt: a.projekt, kunde: a.kunde || '', datum: a.datum });
                }
                markNotified(key);
              }
            }
          }
        }

        // Invoice reminders
        if ((settings.browserInvoices || settings.emailInvoices) && a.invoiceDueDate && a.invoiceStatus !== 'bezahlt') {
          const [d, m, y] = a.invoiceDueDate.split('.');
          if (d && m && y) {
            const dueDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
            if (diffDays <= 3) {
              const key = `invoice_${a.id}_${today}`;
              if (!getNotified().has(key)) {
                if (settings.browserInvoices && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                  new Notification(diffDays <= 0 ? 'Rechnung überfällig' : 'Rechnung bald fällig', { body: `"${a.projekt}" – fällig am ${a.invoiceDueDate}`, icon: '/logo.png?v=2' });
                }
                if (settings.emailInvoices) {
                  dueInvoices.push({ projekt: a.projekt, dueDate: a.invoiceDueDate });
                }
                markNotified(key);
              }
            }
          }
        }
      }

      if ((settings.emailInvoices || settings.emailReports) && user.email) {
        await sendEmailNotifications(user.email, dueInvoices, upcomingAssignments);
      }
    };

    check();
    intervalRef.current = setInterval(check, CHECK_INTERVAL);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user]);
}
