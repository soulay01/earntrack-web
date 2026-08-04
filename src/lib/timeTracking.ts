// Reine Ableitungen aus clock_entries-Dokumenten (Schema: clockIn/pauseClock/resumeClock/clockOut) -
// keine Firebase-Abhängigkeit, wiederverwendbar fürs Live-Team-Board und die Tages-Timeline im Dashboard.

export interface ClockEntry {
  id: string;
  assignmentId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  clockInMs: number;
  clockOutMs?: number;
  isPaused?: boolean;
  breakStartMs?: number;
  totalBreakMs?: number;
}

export type EntryStatus =
  | { state: 'done'; sinceMs: number; elapsedWorkMs: number; elapsedPauseMs: number }
  | { state: 'pause'; sinceMs: number; elapsedWorkMs: number; elapsedPauseMs: number }
  | { state: 'working'; sinceMs: number; elapsedWorkMs: number; elapsedPauseMs: number };

// Status + verstrichene Arbeits-/Pausenzeit eines einzelnen Eintrags zum Zeitpunkt nowMs.
export const deriveEntryStatus = (entry: ClockEntry, nowMs: number = Date.now()): EntryStatus => {
  const clockInMs = entry.clockInMs || nowMs;
  const totalBreakMs = entry.totalBreakMs || 0;

  if (entry.clockOutMs) {
    return {
      state: 'done',
      sinceMs: entry.clockOutMs,
      elapsedWorkMs: Math.max(0, entry.clockOutMs - clockInMs - totalBreakMs),
      elapsedPauseMs: 0,
    };
  }
  if (entry.isPaused) {
    const pauseStart = entry.breakStartMs || nowMs;
    return {
      state: 'pause',
      sinceMs: pauseStart,
      elapsedWorkMs: Math.max(0, pauseStart - clockInMs - totalBreakMs),
      elapsedPauseMs: Math.max(0, nowMs - pauseStart),
    };
  }
  return {
    state: 'working',
    sinceMs: clockInMs,
    elapsedWorkMs: Math.max(0, nowMs - clockInMs - totalBreakMs),
    elapsedPauseMs: 0,
  };
};

export const formatDuration = (ms: number): string => {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

export const formatTime = (ms: number | null | undefined): string => {
  if (!ms) return '–';
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

export const LONG_PAUSE_MS = 45 * 60000;
