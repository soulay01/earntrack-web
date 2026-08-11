// Unit-Tests für die Stundenzettel-Logik (src/lib/timeTracking.ts).
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/stundenzettel.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { buildEmployeeIdMap, matchClockEntryToEmployee, buildStundenzettelRows } from '../src/lib/timeTracking.ts';

const employees = [
  { id: 'emp1', authUid: 'uid-1', email: 'anna@example.com', name: 'Anna Muster' },
  { id: 'emp2', email: 'ben@example.com', name: 'Ben Beispiel' },
];

test('buildEmployeeIdMap mapped authUid, email und name auf employee.id', () => {
  const idMap = buildEmployeeIdMap(employees);
  assert.strictEqual(idMap['uid-1'], 'emp1');
  assert.strictEqual(idMap['anna@example.com'], 'emp1');
  assert.strictEqual(idMap['Anna Muster'], 'emp1');
  assert.strictEqual(idMap['ben@example.com'], 'emp2');
});

test('matchClockEntryToEmployee matched über userId, dann userEmail, dann userName', () => {
  const idMap = buildEmployeeIdMap(employees);
  assert.strictEqual(matchClockEntryToEmployee({ userId: 'uid-1' }, idMap), 'emp1');
  assert.strictEqual(matchClockEntryToEmployee({ userEmail: 'ben@example.com' }, idMap), 'emp2');
  assert.strictEqual(matchClockEntryToEmployee({ userName: 'Anna Muster' }, idMap), 'emp1');
  assert.strictEqual(matchClockEntryToEmployee({ userId: 'unbekannt' }, idMap), null);
});

test('buildStundenzettelRows zieht die Pause von der Dauer ab', () => {
  const idMap = buildEmployeeIdMap(employees);
  const entries = [{
    userId: 'uid-1',
    assignmentId: 'a1',
    clockIn: new Date('2026-08-01T08:00:00'),
    clockOut: new Date('2026-08-01T17:00:00'),
    breakMinutes: 30,
  }];
  const rows = buildStundenzettelRows(entries, 'emp1', idMap, { a1: 'Badsanierung' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].projekt, 'Badsanierung');
  assert.strictEqual(rows[0].stunden, 8.5, '9h Spanne minus 30min Pause = 8.5h');
});

test('buildStundenzettelRows klammert noch laufende Einträge (kein clockOut) aus', () => {
  const idMap = buildEmployeeIdMap(employees);
  const entries = [{
    userId: 'uid-1',
    assignmentId: 'a1',
    clockIn: new Date('2026-08-01T08:00:00'),
    clockOut: null,
    breakMinutes: 0,
  }];
  const rows = buildStundenzettelRows(entries, 'emp1', idMap, { a1: 'Badsanierung' });
  assert.strictEqual(rows.length, 0);
});

test('buildStundenzettelRows filtert auf den angefragten Mitarbeiter, auch bei mehreren im Zeitraum', () => {
  const idMap = buildEmployeeIdMap(employees);
  const entries = [
    { userId: 'uid-1', assignmentId: 'a1', clockIn: new Date('2026-08-01T08:00:00'), clockOut: new Date('2026-08-01T12:00:00'), breakMinutes: 0 },
    { userEmail: 'ben@example.com', assignmentId: 'a1', clockIn: new Date('2026-08-01T08:00:00'), clockOut: new Date('2026-08-01T16:00:00'), breakMinutes: 0 },
  ];
  const rowsAnna = buildStundenzettelRows(entries, 'emp1', idMap, { a1: 'Badsanierung' });
  const rowsBen = buildStundenzettelRows(entries, 'emp2', idMap, { a1: 'Badsanierung' });
  assert.strictEqual(rowsAnna.length, 1);
  assert.strictEqual(rowsAnna[0].stunden, 4);
  assert.strictEqual(rowsBen.length, 1);
  assert.strictEqual(rowsBen[0].stunden, 8);
});

test('buildStundenzettelRows berechnet den Lohn aus Stunden × Stundenlohn', () => {
  const idMap = buildEmployeeIdMap(employees);
  const entries = [{
    userId: 'uid-1',
    assignmentId: 'a1',
    clockIn: new Date('2026-08-01T08:00:00'),
    clockOut: new Date('2026-08-01T16:00:00'),
    breakMinutes: 0,
  }];
  const rows = buildStundenzettelRows(entries, 'emp1', idMap, { a1: 'Badsanierung' }, 20);
  assert.strictEqual(rows[0].stunden, 8);
  assert.strictEqual(rows[0].lohn, 160, '8h × 20€/h = 160€');
});

test('buildStundenzettelRows: ohne Stundenlohn-Angabe ist der Lohn 0', () => {
  const idMap = buildEmployeeIdMap(employees);
  const entries = [{
    userId: 'uid-1',
    assignmentId: 'a1',
    clockIn: new Date('2026-08-01T08:00:00'),
    clockOut: new Date('2026-08-01T16:00:00'),
    breakMinutes: 0,
  }];
  const rows = buildStundenzettelRows(entries, 'emp1', idMap, { a1: 'Badsanierung' });
  assert.strictEqual(rows[0].lohn, 0);
});

test('buildStundenzettelRows fällt bei unbekanntem Projekt auf "-" zurück', () => {
  const idMap = buildEmployeeIdMap(employees);
  const entries = [{
    userId: 'uid-1',
    assignmentId: 'unbekannt',
    clockIn: new Date('2026-08-01T08:00:00'),
    clockOut: new Date('2026-08-01T09:00:00'),
    breakMinutes: 0,
  }];
  const rows = buildStundenzettelRows(entries, 'emp1', idMap, {});
  assert.strictEqual(rows[0].projekt, '-');
});
