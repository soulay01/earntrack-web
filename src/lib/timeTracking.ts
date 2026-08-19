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
  status?: string;
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

export interface EmployeeMatchable {
  id: string;
  authUid?: string;
  email?: string;
  name?: string;
}

// Mapped authUid/email/name -> employee.id, damit clock_entries (die je nach App-Version
// userId, userEmail oder userName tragen) auf den richtigen Mitarbeiter matchen.
export const buildEmployeeIdMap = (employees: EmployeeMatchable[]): Record<string, string> => {
  const idMap: Record<string, string> = {};
  for (const e of employees) {
    if (e.authUid) idMap[e.authUid] = e.id;
    if (e.email) idMap[e.email] = e.id;
    if (e.name) idMap[e.name] = e.id;
  }
  return idMap;
};

export const matchClockEntryToEmployee = (
  entry: { userId?: string; userEmail?: string; userName?: string },
  idMap: Record<string, string>
): string | null => {
  return idMap[entry.userId || ''] || idMap[entry.userEmail || ''] || idMap[entry.userName || ''] || null;
};

export interface RawClockEntry {
  userId?: string;
  userEmail?: string;
  userName?: string;
  assignmentId?: string;
  clockIn: Date;
  clockOut: Date | null;
  breakMinutes: number;
}

export interface StundenzettelRow {
  datum: string;
  projekt: string;
  beginn: string;
  ende: string;
  pause: string;
  stunden: number;
  lohn: number;
}

// Läuft ein Eintrag noch (kein clockOut), kann keine Dauer berechnet werden - wird ausgeklammert.
export const buildStundenzettelRows = (
  entries: RawClockEntry[],
  employeeId: string,
  idMap: Record<string, string>,
  assignmentsById: Record<string, string>,
  stundenlohn: number = 0
): StundenzettelRow[] => {
  return entries
    .filter(e => e.clockOut && matchClockEntryToEmployee(e, idMap) === employeeId)
    .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime())
    .map(e => {
      const minutes = Math.max(0, Math.round((e.clockOut!.getTime() - e.clockIn.getTime()) / 60000) - e.breakMinutes);
      const stunden = minutes / 60;
      return {
        datum: e.clockIn.toLocaleDateString('de-DE'),
        projekt: assignmentsById[e.assignmentId || ''] || '-',
        beginn: e.clockIn.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        ende: e.clockOut!.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        pause: e.breakMinutes > 0 ? `${e.breakMinutes} min` : '-',
        stunden,
        lohn: stunden * stundenlohn,
      };
    });
};
