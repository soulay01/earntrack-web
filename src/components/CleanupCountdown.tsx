'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PLAN_LABELS, EXCESS_CLEANUP_DAYS } from '@/lib/plans';

type CleanupMode = 'cancelled' | 'excess';

export default function CleanupCountdown({
  dataCleanupAt,
  mode = 'cancelled',
  excessDataTypes,
  excessCount,
  excessOldPlan,
  currentPlan,
}: {
  dataCleanupAt: any;
  mode?: CleanupMode;
  excessDataTypes?: string[];
  excessCount?: number;
  excessOldPlan?: string;
  currentPlan?: string;
}) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!dataCleanupAt) return;
    const cleanupDate = dataCleanupAt?.toDate ? dataCleanupAt.toDate() : new Date(dataCleanupAt);

    function tick() {
      const now = Date.now();
      const diff = cleanupDate.getTime() - now;
      if (diff <= 0) { setTimeLeft('0 Tage'); return; }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (days > 0) setTimeLeft(`${days} Tag${days !== 1 ? 'e' : ''} ${hours}h`);
      else setTimeLeft(`${hours} Stunde${hours !== 1 ? 'n' : ''}`);
    }

    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [dataCleanupAt]);

  if (!timeLeft || !dataCleanupAt) return null;

  if (mode === 'excess') {
    const dataType = excessDataTypes?.includes('employees') ? 'Mitarbeiter' : 'Daten';
    const planName = currentPlan ? PLAN_LABELS[currentPlan] || currentPlan : 'neuen';

    return (
      <div className="border-b border-amber-500/25 bg-gradient-to-r from-amber-950 via-amber-900/60 to-amber-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 flex-wrap">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-amber-200">
              Dein <strong className="text-amber-50">{planName}</strong>-Plan hat ein geringeres {dataType}-Limit als du aktuell hast.{' '}
              In <span className="font-bold text-amber-50">{timeLeft}</span> werden automatisch die{' '}
              {excessCount ? <strong className="text-amber-50">{excessCount}</strong> : ''}{' '}
              zuletzt angelegten {dataType} gelöscht.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/export"
              className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20 active:scale-[0.97]"
            >
              Daten sichern
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-red-500/25 bg-gradient-to-r from-red-950 via-red-900/60 to-red-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 flex-wrap">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-200">
            Abo gekündigt – in <span className="font-bold text-red-50">{timeLeft}</span> werden alle Daten unwiderruflich gelöscht
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/subscription"
            className="shrink-0 rounded-lg border border-[#10D6A3]/30 bg-[#10D6A3]/10 px-3 py-1.5 text-xs font-bold text-[#10D6A3] transition hover:bg-[#10D6A3]/20 active:scale-[0.97]"
          >
            Zurück zu Pro
          </Link>
          <Link
            href="/settings/export"
            className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 active:scale-[0.97]"
          >
            Daten sichern
          </Link>
        </div>
      </div>
    </div>
  );
}
