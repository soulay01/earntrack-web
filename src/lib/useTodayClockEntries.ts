'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ClockEntry } from '@/lib/timeTracking';

const startOfTodayMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

const toMs = (ts: unknown): number | null => {
  if (!ts) return null;
  const anyTs = ts as { toMillis?: () => number; seconds?: number };
  if (typeof anyTs.toMillis === 'function') return anyTs.toMillis();
  if (typeof anyTs.seconds === 'number') return anyTs.seconds * 1000;
  const d = new Date(ts as string | number | Date);
  return isNaN(d.getTime()) ? null : d.getTime();
};

// Live-Ansicht aller Stempeluhr-Einträge (clock_entries) des heutigen Tages, firmenweit.
// Namen werden wie in der App aus users/{uid}.displayName aufgelöst und pro Hook-Instanz gecacht.
export function useTodayClockEntries(companyId: string | null) {
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const nameCache = useRef(new Map<string, string>());

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    if (!companyId) { setEntries([]); setLoading(false); return; }

    unsubscribe = onSnapshot(
      query(collection(db, 'clock_entries'), where('companyId', '==', companyId)),
      async (snap) => {
        if (!mounted) return;
        const todayStart = startOfTodayMs();
        const raw: ClockEntry[] = [];
        snap.forEach(d => {
          const data = d.data();
          const clockInMs = toMs(data.clockIn);
          if (!clockInMs || clockInMs < todayStart) return;
          raw.push({
            id: d.id,
            assignmentId: data.assignmentId,
            userId: data.userId,
            userEmail: data.userEmail || '',
            clockInMs,
            clockOutMs: toMs(data.clockOut) ?? undefined,
            isPaused: !!data.isPaused,
            breakStartMs: toMs(data.breakStart) ?? undefined,
            totalBreakMs: data.totalBreakMs || (data.totalBreakMinutes || 0) * 60000,
          });
        });

        const missingUids = [...new Set(raw.map(e => e.userId))].filter(
          (uid): uid is string => !!uid && !nameCache.current.has(uid),
        );
        if (missingUids.length > 0) {
          await Promise.allSettled(missingUids.map(async (uid) => {
            try {
              const uSnap = await getDoc(doc(db, 'users', uid));
              nameCache.current.set(uid, uSnap.exists() ? (uSnap.data().displayName || uSnap.data().email || '') : '');
            } catch (e) {
              nameCache.current.set(uid, '');
            }
          }));
        }
        if (!mounted) return;

        setEntries(
          raw
            .map(e => ({ ...e, userName: nameCache.current.get(e.userId || '') || e.userEmail || '?' }))
            .sort((a, b) => a.clockInMs - b.clockInMs),
        );
        setLoading(false);
      },
      () => { if (mounted) { setEntries([]); setLoading(false); } },
    );

    return () => { mounted = false; if (unsubscribe) unsubscribe(); };
  }, [companyId]);

  return { entries, loading };
}
