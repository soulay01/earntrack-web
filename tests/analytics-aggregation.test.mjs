// Prüft die reinen Aggregationsfunktionen hinter dem Analytics-Redesign
// (activity_events -> Zuletzt-aktiv-Liste, Plattform-Split, Downloads-Zeitraumvergleich).
// Ausführen: npm run test:analytics

import assert from 'node:assert';
import { test } from 'node:test';
import {
  buildRecentActivity,
  buildPlatformBreakdown,
  buildPlatformTrend,
  lastPlatformByUid,
  buildDownloadsSummary,
} from '../src/lib/analyticsAggregation.ts';

const users = [
  { uid: 'u1', email: 'a@b.de', name: 'Anna', companyName: 'Anna GmbH' },
  { uid: 'u2', email: 'c@d.de', name: 'Carl', companyName: 'Carl KG' },
];

test('buildRecentActivity: joint gegen User, neueste zuerst, limitiert', () => {
  const events = [
    { uid: 'u1', action: 'login', platform: 'web', createdAt: '2026-08-01T10:00:00.000Z' },
    { uid: 'u2', action: 'invoice_created', platform: 'ios', createdAt: '2026-08-02T10:00:00.000Z' },
  ];
  const result = buildRecentActivity(events, users, 10);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].uid, 'u2');
  assert.strictEqual(result[0].name, 'Carl');
  assert.strictEqual(result[0].companyName, 'Carl KG');
  assert.strictEqual(result[1].uid, 'u1');
});

test('buildRecentActivity: unbekannter User fällt auf Platzhalter zurück', () => {
  const events = [{ uid: 'ghost', action: 'login', platform: 'web', createdAt: '2026-08-01T10:00:00.000Z' }];
  const result = buildRecentActivity(events, users, 10);
  assert.strictEqual(result[0].name, '-');
  assert.strictEqual(result[0].email, '-');
  assert.strictEqual(result[0].companyName, '-');
});

test('buildRecentActivity: respektiert das Limit', () => {
  const events = Array.from({ length: 5 }, (_, i) => ({
    uid: 'u1', action: 'login', platform: 'web', createdAt: `2026-08-0${i + 1}T10:00:00.000Z`,
  }));
  const result = buildRecentActivity(events, users, 2);
  assert.strictEqual(result.length, 2);
});

test('buildPlatformBreakdown: zählt je Plattform, unbekannte Werte zählen als web', () => {
  const events = [
    { uid: 'u1', action: 'a', platform: 'web', createdAt: '2026-08-01T10:00:00.000Z' },
    { uid: 'u1', action: 'a', platform: 'ios', createdAt: '2026-08-01T10:00:00.000Z' },
    { uid: 'u1', action: 'a', platform: 'ios', createdAt: '2026-08-01T10:00:00.000Z' },
    { uid: 'u1', action: 'a', platform: 'android', createdAt: '2026-08-01T10:00:00.000Z' },
    { uid: 'u1', action: 'a', platform: 'other', createdAt: '2026-08-01T10:00:00.000Z' },
  ];
  const result = buildPlatformBreakdown(events);
  assert.deepStrictEqual(result, { web: 2, ios: 2, android: 1 });
});

test('buildPlatformTrend: liefert genau `days` Punkte, aufsteigend, mit 0 bei fehlenden Tagen', () => {
  const events = [
    { uid: 'u1', action: 'a', platform: 'web', createdAt: '2026-08-06T10:00:00.000Z' },
  ];
  const result = buildPlatformTrend(events, 3, '2026-08-06');
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[2].web, 1);
  assert.strictEqual(result[0].web, 0);
  assert.strictEqual(result[0].ios, 0);
});

test('lastPlatformByUid: nimmt die Plattform des jeweils neuesten Events', () => {
  const events = [
    { uid: 'u1', action: 'a', platform: 'web', createdAt: '2026-08-01T10:00:00.000Z' },
    { uid: 'u1', action: 'a', platform: 'ios', createdAt: '2026-08-03T10:00:00.000Z' },
    { uid: 'u1', action: 'a', platform: 'android', createdAt: '2026-08-02T10:00:00.000Z' },
  ];
  assert.strictEqual(lastPlatformByUid(events).u1, 'ios');
});

test('buildDownloadsSummary: leere Collection ist "nicht konfiguriert", keine Fake-Werte', () => {
  const result = buildDownloadsSummary([], 7, '2026-08-06');
  assert.strictEqual(result.configured, false);
  assert.strictEqual(result.totalCurrent, 0);
  assert.strictEqual(result.chartData.length, 7);
  assert.strictEqual(result.allTime.total, 0);
});

test('buildDownloadsSummary: summiert je Plattform im aktuellen Zeitraum', () => {
  const docs = [
    { date: '2026-08-05', platform: 'ios', downloads: 10 },
    { date: '2026-08-06', platform: 'ios', downloads: 5 },
    { date: '2026-08-06', platform: 'android', downloads: 8 },
    { date: '2026-07-20', platform: 'ios', downloads: 999 }, // außerhalb des Zeitraums
  ];
  const result = buildDownloadsSummary(docs, 7, '2026-08-06');
  assert.strictEqual(result.configured, true);
  assert.strictEqual(result.ios, 15);
  assert.strictEqual(result.android, 8);
  assert.strictEqual(result.totalCurrent, 23);
});

test('buildDownloadsSummary: allTime summiert über den gesamten Bestand, unabhängig vom Zeitraum-Fenster', () => {
  const docs = [
    { date: '2026-08-05', platform: 'ios', downloads: 10 },
    { date: '2026-08-06', platform: 'ios', downloads: 5 },
    { date: '2026-08-06', platform: 'android', downloads: 8 },
    { date: '2026-07-20', platform: 'ios', downloads: 999 }, // liegt außerhalb des 7-Tage-Fensters
    { date: '2024-01-01', platform: 'android', downloads: 42 }, // weit in der Vergangenheit
  ];
  const result = buildDownloadsSummary(docs, 7, '2026-08-06');
  // totalCurrent ignoriert die alten Einträge (Fenster-Logik unverändert) ...
  assert.strictEqual(result.totalCurrent, 23);
  // ... aber allTime zählt wirklich alles, egal wie alt.
  assert.strictEqual(result.allTime.total, 10 + 5 + 8 + 999 + 42);
  assert.strictEqual(result.allTime.ios, 10 + 5 + 999);
  assert.strictEqual(result.allTime.android, 8 + 42);
});

test('buildDownloadsSummary: Vorperiode ohne Daten ergibt deltaPct null statt Division durch 0', () => {
  const docs = [{ date: '2026-08-06', platform: 'ios', downloads: 5 }];
  const result = buildDownloadsSummary(docs, 7, '2026-08-06');
  assert.strictEqual(result.totalPrevious, 0);
  assert.strictEqual(result.deltaPct, null);
});

test('buildDownloadsSummary: berechnet deltaPct korrekt ggü. der Vorperiode', () => {
  const docs = [
    { date: '2026-08-06', platform: 'ios', downloads: 20 }, // aktuelle Periode (Tag 0 von 7)
    { date: '2026-07-29', platform: 'ios', downloads: 10 }, // Vorperiode
  ];
  const result = buildDownloadsSummary(docs, 7, '2026-08-06');
  assert.strictEqual(result.totalPrevious, 10);
  assert.strictEqual(result.deltaPct, 100);
});
