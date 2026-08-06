# Analytics-Redesign (Aktivität & Downloads) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the shared EarnTrack admin analytics page (web + mobile) so "who used the app recently" is prominent and organized, add a platform (Web/iOS/Android) activity view built on the existing but unused `activity_events` Firestore collection, and add a Downloads section with its own time-range filter that is ready to receive App Store / Play Store numbers once store API credentials exist.

**Architecture:** One shared Next.js API route (`/api/analytics/data`) already powers both the web page and the React Native screen. We extend that route with two new pure, unit-tested aggregation modules (`src/lib/analyticsAggregation.ts`), extend the response shape, then rebuild the web tabs and the mobile tabs on top of the same response. A new `store_downloads` Firestore collection (server-write-only) backs the Downloads tab; a scheduled Cloud Function scaffold is added but intentionally does not call the real Apple/Google APIs yet (no credentials exist) — it logs "not configured" instead of writing fake data.

**Tech Stack:** Next.js App Router (TypeScript), Firebase Admin SDK, Firestore, Firebase Cloud Functions (`firebase-functions` v1 style, matching existing `checkNotifications`), Recharts, React Native / Expo, `react-native-chart-kit`, Node's built-in `node:test` runner (existing project convention, see `tests/subscription-rules.test.mjs`).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-06-analytics-redesign-design.md` — every task below implements a section of it.
- Never write synthetic/fake data for downloads. If `store_downloads` is empty, the API must return `configured: false` and the UI must show an explicit empty state — never a 0-value chart that looks like a real measurement.
- Firestore reads in the API route stay time-range- and count-bounded (no full collection scans), matching the existing `usage_log`/`page_views` query pattern in the same file.
- New pure aggregation logic goes in `src/lib/*.ts` and gets `node:test` unit tests, matching the existing `src/lib/subscriptionRules.ts` / `tests/subscription-rules.test.mjs` pattern — this is the only place in this feature with automated tests; presentational component tasks are verified by typecheck + manual visual check, matching this codebase's existing convention (no component test files exist today for this page).
- All new user-facing strings are German, matching every existing string on this page.
- Follow the existing visual language exactly: web uses the hex palette already used in `src/app/analytics/page.tsx` (`#0D9488` teal accent, `#E2E8F0` borders, `#64748B` muted text, `#0F172A` headings); mobile reuses the `isDark` theming pattern already used in `screens/adminAnalytics/*.js`.

---

## Task 1: Pure aggregation library + unit tests

**Files:**
- Create: `earntrack-web/src/lib/analyticsAggregation.ts`
- Test: `earntrack-web/tests/analytics-aggregation.test.mjs`
- Modify: `earntrack-web/package.json` (add `test:analytics` script)

**Interfaces:**
- Produces: `Platform = 'web' | 'ios' | 'android'`; `ActivityEventInput { uid: string; action: string; platform: Platform; createdAt: string }`; `UserLite { uid: string; email: string; name: string; companyName: string }`; `RecentActivityEntry { uid: string; email: string; name: string; companyName: string; action: string; platform: Platform; at: string }`; `PlatformBreakdown { web: number; ios: number; android: number }`; `PlatformTrendPoint { date: string; web: number; ios: number; android: number }`; `StoreDownloadDoc { date: string; platform: 'ios' | 'android'; downloads: number }`; `DownloadsChartPoint { date: string; ios: number; android: number }`; `DownloadsSummary { configured: boolean; totalCurrent: number; totalPrevious: number; deltaPct: number | null; ios: number; android: number; chartData: DownloadsChartPoint[] }`; functions `buildRecentActivity`, `buildPlatformBreakdown`, `buildPlatformTrend`, `lastPlatformByUid`, `buildDownloadsSummary` — exact signatures below. These are consumed by Task 2 and Task 3.

- [ ] **Step 1: Write the failing tests**

Create `earntrack-web/tests/analytics-aggregation.test.mjs`:

```javascript
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
  const result = buildPlatformTrend(events, 3);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd earntrack-web && node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/analytics-aggregation.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/analyticsAggregation.ts'`

- [ ] **Step 3: Write the implementation**

Create `earntrack-web/src/lib/analyticsAggregation.ts`:

```typescript
export type Platform = 'web' | 'ios' | 'android'

export interface ActivityEventInput {
  uid: string
  action: string
  platform: Platform
  createdAt: string
}

export interface UserLite {
  uid: string
  email: string
  name: string
  companyName: string
}

export interface RecentActivityEntry {
  uid: string
  email: string
  name: string
  companyName: string
  action: string
  platform: Platform
  at: string
}

function normalizePlatform(platform: unknown): Platform {
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

function sortByCreatedAtDesc(events: ActivityEventInput[]): ActivityEventInput[] {
  return [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function buildRecentActivity(
  events: ActivityEventInput[],
  users: UserLite[],
  limitCount: number,
): RecentActivityEntry[] {
  const byUid = new Map(users.map(u => [u.uid, u]))
  return sortByCreatedAtDesc(events)
    .slice(0, limitCount)
    .map(e => {
      const u = byUid.get(e.uid)
      return {
        uid: e.uid,
        email: u?.email || '-',
        name: u?.name || '-',
        companyName: u?.companyName || '-',
        action: e.action,
        platform: normalizePlatform(e.platform),
        at: e.createdAt,
      }
    })
}

export interface PlatformBreakdown {
  web: number
  ios: number
  android: number
}

export function buildPlatformBreakdown(events: ActivityEventInput[]): PlatformBreakdown {
  const result: PlatformBreakdown = { web: 0, ios: 0, android: 0 }
  events.forEach(e => { result[normalizePlatform(e.platform)]++ })
  return result
}

export interface PlatformTrendPoint {
  date: string
  web: number
  ios: number
  android: number
}

function isoDaysAgo(fromIso: string, n: number): string {
  const d = new Date(`${fromIso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

export function buildPlatformTrend(events: ActivityEventInput[], days: number): PlatformTrendPoint[] {
  const today = new Date().toISOString().split('T')[0]
  const byDate: Record<string, PlatformBreakdown> = {}
  events.forEach(e => {
    const date = e.createdAt.slice(0, 10)
    if (!byDate[date]) byDate[date] = { web: 0, ios: 0, android: 0 }
    byDate[date][normalizePlatform(e.platform)]++
  })
  const trend: PlatformTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDaysAgo(today, i)
    const counts = byDate[date] || { web: 0, ios: 0, android: 0 }
    trend.push({ date, ...counts })
  }
  return trend
}

export function lastPlatformByUid(events: ActivityEventInput[]): Record<string, Platform> {
  const latest: Record<string, ActivityEventInput> = {}
  events.forEach(e => {
    const current = latest[e.uid]
    if (!current || e.createdAt > current.createdAt) latest[e.uid] = e
  })
  const result: Record<string, Platform> = {}
  Object.entries(latest).forEach(([uid, e]) => { result[uid] = normalizePlatform(e.platform) })
  return result
}

export interface StoreDownloadDoc {
  date: string
  platform: 'ios' | 'android'
  downloads: number
}

export interface DownloadsChartPoint {
  date: string
  ios: number
  android: number
}

export interface DownloadsSummary {
  configured: boolean
  totalCurrent: number
  totalPrevious: number
  deltaPct: number | null
  ios: number
  android: number
  chartData: DownloadsChartPoint[]
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

export function buildDownloadsSummary(
  docs: StoreDownloadDoc[],
  timeRangeDays: number,
  todayIso: string,
): DownloadsSummary {
  const configured = docs.length > 0
  const currentStart = isoDaysAgo(todayIso, timeRangeDays - 1)
  const previousEnd = isoDaysAgo(currentStart, 1)
  const previousStart = isoDaysAgo(currentStart, timeRangeDays)

  const currentDocs = docs.filter(d => inRange(d.date, currentStart, todayIso))
  const previousDocs = docs.filter(d => inRange(d.date, previousStart, previousEnd))

  const sum = (list: StoreDownloadDoc[]) => list.reduce((s, d) => s + d.downloads, 0)
  const sumPlatform = (list: StoreDownloadDoc[], platform: 'ios' | 'android') =>
    sum(list.filter(d => d.platform === platform))

  const totalCurrent = sum(currentDocs)
  const totalPrevious = sum(previousDocs)
  const deltaPct = totalPrevious === 0 ? null : Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100)

  const chartMap: Record<string, DownloadsChartPoint> = {}
  currentDocs.forEach(d => {
    if (!chartMap[d.date]) chartMap[d.date] = { date: d.date, ios: 0, android: 0 }
    chartMap[d.date][d.platform] += d.downloads
  })
  const chartData: DownloadsChartPoint[] = []
  for (let i = timeRangeDays - 1; i >= 0; i--) {
    const date = isoDaysAgo(todayIso, i)
    chartData.push(chartMap[date] || { date, ios: 0, android: 0 })
  }

  return {
    configured,
    totalCurrent,
    totalPrevious,
    deltaPct,
    ios: sumPlatform(currentDocs, 'ios'),
    android: sumPlatform(currentDocs, 'android'),
    chartData,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd earntrack-web && node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/analytics-aggregation.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Add the npm script**

In `earntrack-web/package.json`, add to `"scripts"` (alongside the existing `test:sync`/`test:datev` entries):

```json
"test:analytics": "node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/analytics-aggregation.test.mjs",
```

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add src/lib/analyticsAggregation.ts tests/analytics-aggregation.test.mjs package.json
git commit -m "feat: add analytics aggregation lib for activity + downloads"
```

---

## Task 2: Wire `activity_events` into the analytics API route

**Files:**
- Modify: `earntrack-web/src/app/api/analytics/data/route.ts`

**Interfaces:**
- Consumes: `buildRecentActivity`, `buildPlatformBreakdown`, `buildPlatformTrend`, `lastPlatformByUid`, `ActivityEventInput`, `UserLite` from Task 1 (`@/lib/analyticsAggregation`).
- Produces: response fields `recentActivity: RecentActivityEntry[]`, `platformBreakdown: PlatformBreakdown`, `platformTrend: PlatformTrendPoint[]`, and each entry in the existing `users` array gains `lastPlatform: Platform | null`. Consumed by Task 8 (web Aktivität tab) and Task 12 (mobile Aktivität tab).

- [ ] **Step 1: Add the import**

In `earntrack-web/src/app/api/analytics/data/route.ts`, after the existing imports:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'
import { calculateRevenue } from '@/lib/calculations'
import {
  buildRecentActivity,
  buildPlatformBreakdown,
  buildPlatformTrend,
  lastPlatformByUid,
  type ActivityEventInput,
  type UserLite,
} from '@/lib/analyticsAggregation'
```

- [ ] **Step 2: Add the `activity_events` query**

Find this block (the `Promise.all` that fetches all collections):

```typescript
    const [
      usersSnap, companiesSnap, demosSnap, usageSnap,
      invoicesSnap, assignmentsSnap, employeesSnap,
      customersSnap, clockEntriesSnap, paymentRequestsSnap, estimatesSnap,
      pageViewsSnap,
    ] = await Promise.all([
      // Alle User & Companies (nicht per timeRange gefiltert) — sonst verschwinden
      // Nutzer/Firmen älter als das Zeitfenster komplett aus der Nutzer-Tabelle.
      db.collection('users').get(),
      db.collection('companies').get(),
      db.collection('demo_signups').where('createdAt', '>=', startDate).get(),
      db.collection('usage_log').where('date', '>=', start).get(),
      db.collection('invoices').where('createdAt', '>=', startDate).get(),
      db.collection('assignments').where('createdAt', '>=', startDate).get(),
      db.collection('employees').where('createdAt', '>=', startDate).get(),
      db.collection('customers').where('createdAt', '>=', startDate).get(),
      db.collection('clock_entries').where('clockIn', '>=', startDate).get(),
      db.collection('payment_requests').where('createdAt', '>=', startDate).get(),
      db.collection('estimates').where('createdAt', '>=', startDate).get(),
      db.collection('page_views').where('date', '>=', start).get(),
    ])
```

Replace with:

```typescript
    const [
      usersSnap, companiesSnap, demosSnap, usageSnap,
      invoicesSnap, assignmentsSnap, employeesSnap,
      customersSnap, clockEntriesSnap, paymentRequestsSnap, estimatesSnap,
      pageViewsSnap, activityEventsSnap,
    ] = await Promise.all([
      // Alle User & Companies (nicht per timeRange gefiltert) — sonst verschwinden
      // Nutzer/Firmen älter als das Zeitfenster komplett aus der Nutzer-Tabelle.
      db.collection('users').get(),
      db.collection('companies').get(),
      db.collection('demo_signups').where('createdAt', '>=', startDate).get(),
      db.collection('usage_log').where('date', '>=', start).get(),
      db.collection('invoices').where('createdAt', '>=', startDate).get(),
      db.collection('assignments').where('createdAt', '>=', startDate).get(),
      db.collection('employees').where('createdAt', '>=', startDate).get(),
      db.collection('customers').where('createdAt', '>=', startDate).get(),
      db.collection('clock_entries').where('clockIn', '>=', startDate).get(),
      db.collection('payment_requests').where('createdAt', '>=', startDate).get(),
      db.collection('estimates').where('createdAt', '>=', startDate).get(),
      db.collection('page_views').where('date', '>=', start).get(),
      db.collection('activity_events').where('createdAt', '>=', startDate).orderBy('createdAt', 'desc').limit(500).get(),
    ])
```

- [ ] **Step 3: Build the recent-activity, platform-breakdown and platform-trend fields**

Find this block (right after `dedupedUsers`/`earntrackUsers` are computed, before `// ─── User KPIs ───`):

```typescript
    const earntrackUsers = allDeduped.filter((u: any) => u.email.toLowerCase().endsWith('@earntrack.de'))
    const earntrackEmails = new Set(earntrackUsers.map((u: any) => u.email.toLowerCase().trim()))
    const dedupedUsers = allDeduped.filter((u: any) => !earntrackEmails.has(u.email.toLowerCase().trim()))
```

Add directly after it:

```typescript
    // ─── Aktivität (aus activity_events, bisher ungenutzt) ───
    const activityEvents = toObj(activityEventsSnap) as unknown as ActivityEventInput[]
    const activityUserLites: UserLite[] = dedupedUsers.map((u: any) => {
      const uid = u.id || u.uid
      const company = companies.find((c: any) => c.id === u.companyId || c.id === uid)
      return { uid, email: u.email || '-', name: u.displayName || '-', companyName: company?.name || '-' }
    })
    const recentActivity = buildRecentActivity(activityEvents, activityUserLites, 50)
    const platformBreakdown = buildPlatformBreakdown(activityEvents)
    const platformTrend = buildPlatformTrend(activityEvents, timeRange)
    const lastPlatformMap = lastPlatformByUid(activityEvents)
```

Note: `companies` is defined a few lines above this point already (`const companies = toObj(companiesSnap)`), so it's in scope.

- [ ] **Step 4: Add `lastPlatform` to each user in the response, and add the three new top-level fields**

Find this block near the end of the route:

```typescript
      dauData,
      featureData,
      growthData,
      users: dedupedUsers.map((u: any) => {
        const uid = u.id || u.uid
        const company = companies.find((c: any) => c.id === u.companyId || c.id === uid)
        const usage = usageMap[uid]
        return {
          uid,
          email: u.email || '-',
          name: u.displayName || '-',
          emailVerified: u.emailVerified === true,
          lastActive: usage?.lastActive || null,
          totalActions: usage?.totalActions || 0,
          subscriptionStatus: company?.subscriptionStatus || 'trial',
          subscriptionPlan: company?.subscriptionPlan || '-',
          companyName: company?.name || '-',
          companyId: u.companyId || uid,
          employeesCount: empCountMap[u.companyId || uid] || 0,
          assignmentsCount: asgCountMap[u.companyId || uid] || 0,
          customersCount: custCountMap[u.companyId || uid] || 0,
          createdAt: u.createdAt || null,
          role: u.role || 'employee',
        }
      }),
```

Replace with:

```typescript
      dauData,
      featureData,
      growthData,
      recentActivity,
      platformBreakdown,
      platformTrend,
      users: dedupedUsers.map((u: any) => {
        const uid = u.id || u.uid
        const company = companies.find((c: any) => c.id === u.companyId || c.id === uid)
        const usage = usageMap[uid]
        return {
          uid,
          email: u.email || '-',
          name: u.displayName || '-',
          emailVerified: u.emailVerified === true,
          lastActive: usage?.lastActive || null,
          lastPlatform: lastPlatformMap[uid] || null,
          totalActions: usage?.totalActions || 0,
          subscriptionStatus: company?.subscriptionStatus || 'trial',
          subscriptionPlan: company?.subscriptionPlan || '-',
          companyName: company?.name || '-',
          companyId: u.companyId || uid,
          employeesCount: empCountMap[u.companyId || uid] || 0,
          assignmentsCount: asgCountMap[u.companyId || uid] || 0,
          customersCount: custCountMap[u.companyId || uid] || 0,
          createdAt: u.createdAt || null,
          role: u.role || 'employee',
        }
      }),
```

- [ ] **Step 5: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no new errors from `route.ts` or `analyticsAggregation.ts`.

- [ ] **Step 6: Manual verification**

Run: `cd earntrack-web && npm run dev`, sign in as an admin, open `/analytics`, open browser devtools Network tab, find the `POST /api/analytics/data` request, confirm the JSON response now contains `recentActivity` (array), `platformBreakdown` (`{web,ios,android}`), `platformTrend` (array), and that `users[0]` has a `lastPlatform` key. Existing tabs must still render unchanged (this task adds fields, doesn't remove any).

- [ ] **Step 7: Commit**

```bash
cd earntrack-web
git add src/app/api/analytics/data/route.ts
git commit -m "feat: expose recent activity and platform breakdown from analytics API"
```

---

## Task 3: Downloads read-path in the analytics API route

**Files:**
- Modify: `earntrack-web/src/app/api/analytics/data/route.ts`

**Interfaces:**
- Consumes: `buildDownloadsSummary`, `StoreDownloadDoc` from Task 1; the `activity_events` wiring from Task 2 (this task's queries live in the same `Promise.all`, so Task 2 must land first).
- Produces: `kpis.downloads: DownloadsSummary`, `charts.downloadsData: DownloadsChartPoint[]`. Accepts optional request field `downloadsTimeRange` (defaults to `timeRange`). Consumed by Task 9 (web Downloads tab) and Task 13 (mobile Downloads tab).

- [ ] **Step 1: Extend the import**

In `earntrack-web/src/app/api/analytics/data/route.ts`, extend the import added in Task 2:

```typescript
import {
  buildRecentActivity,
  buildPlatformBreakdown,
  buildPlatformTrend,
  lastPlatformByUid,
  buildDownloadsSummary,
  type ActivityEventInput,
  type UserLite,
  type StoreDownloadDoc,
} from '@/lib/analyticsAggregation'
```

- [ ] **Step 2: Read `downloadsTimeRange` from the request body**

Find:

```typescript
    const body = await req.json().catch(() => ({}))
    const timeRange = typeof body.timeRange === 'number' && body.timeRange > 0 ? Math.floor(body.timeRange) : 30
    const startDate = new Date(Date.now() - timeRange * 86400000)
    const start = daysAgo(timeRange)
    const db = admin.db
```

Replace with:

```typescript
    const body = await req.json().catch(() => ({}))
    const timeRange = typeof body.timeRange === 'number' && body.timeRange > 0 ? Math.floor(body.timeRange) : 30
    const downloadsTimeRange = typeof body.downloadsTimeRange === 'number' && body.downloadsTimeRange > 0
      ? Math.floor(body.downloadsTimeRange)
      : timeRange
    const startDate = new Date(Date.now() - timeRange * 86400000)
    const start = daysAgo(timeRange)
    // Downloads brauchen die aktuelle UND die direkt davorliegende Periode für den Vergleich.
    const downloadsStart = daysAgo(downloadsTimeRange * 2)
    const db = admin.db
```

- [ ] **Step 3: Add the `store_downloads` query**

Extend the `Promise.all` array signature from Task 2 once more:

```typescript
    const [
      usersSnap, companiesSnap, demosSnap, usageSnap,
      invoicesSnap, assignmentsSnap, employeesSnap,
      customersSnap, clockEntriesSnap, paymentRequestsSnap, estimatesSnap,
      pageViewsSnap, activityEventsSnap,
    ] = await Promise.all([
```

Replace the destructuring line and add the new query at the end of the array:

```typescript
    const [
      usersSnap, companiesSnap, demosSnap, usageSnap,
      invoicesSnap, assignmentsSnap, employeesSnap,
      customersSnap, clockEntriesSnap, paymentRequestsSnap, estimatesSnap,
      pageViewsSnap, activityEventsSnap, storeDownloadsSnap,
    ] = await Promise.all([
      // Alle User & Companies (nicht per timeRange gefiltert) — sonst verschwinden
      // Nutzer/Firmen älter als das Zeitfenster komplett aus der Nutzer-Tabelle.
      db.collection('users').get(),
      db.collection('companies').get(),
      db.collection('demo_signups').where('createdAt', '>=', startDate).get(),
      db.collection('usage_log').where('date', '>=', start).get(),
      db.collection('invoices').where('createdAt', '>=', startDate).get(),
      db.collection('assignments').where('createdAt', '>=', startDate).get(),
      db.collection('employees').where('createdAt', '>=', startDate).get(),
      db.collection('customers').where('createdAt', '>=', startDate).get(),
      db.collection('clock_entries').where('clockIn', '>=', startDate).get(),
      db.collection('payment_requests').where('createdAt', '>=', startDate).get(),
      db.collection('estimates').where('createdAt', '>=', startDate).get(),
      db.collection('page_views').where('date', '>=', start).get(),
      db.collection('activity_events').where('createdAt', '>=', startDate).orderBy('createdAt', 'desc').limit(500).get(),
      db.collection('store_downloads').where('date', '>=', downloadsStart).get(),
    ])
```

- [ ] **Step 4: Build the downloads summary**

Directly after the activity block added in Task 2 (`const lastPlatformMap = lastPlatformByUid(activityEvents)`), add:

```typescript
    // ─── Downloads (store_downloads, leer bis Store-API-Zugangsdaten vorhanden sind) ───
    const storeDownloads = toObj(storeDownloadsSnap) as unknown as StoreDownloadDoc[]
    const downloads = buildDownloadsSummary(storeDownloads, downloadsTimeRange, today)
```

Note: `today` (= `daysAgo(0)`) is already defined earlier in the route for the usage KPIs, so it's in scope.

- [ ] **Step 5: Add `downloads` to the response**

Find the `kpis: { pageViews: ..., ... }` object's opening and its `charts: { revenueData, ... }` object, and add one field to each. In the `kpis` object, add right after `pageViewsChartData,`:

```typescript
        pageViews: { total: totalPageViews, today: pageViewsToday, thisWeek: pageViewsThisWeek, avgPerDay: avgViewsPerDay },
        pageViewsChartData,
        downloads,
        topPages,
```

In the `charts` object, add `downloadsData: downloads.chartData,`:

```typescript
      charts: {
        revenueData,
        invoiceStatusData,
        planData,
        subscriptionStatusData,
        topCompaniesData,
        roleData,
        downloadsData: downloads.chartData,
      },
```

- [ ] **Step 6: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no new errors.

- [ ] **Step 7: Manual verification**

Run `npm run dev`, hit `POST /api/analytics/data` (via the running page), confirm `kpis.downloads.configured === false` (the collection doesn't exist yet) and `kpis.downloads.chartData.length === timeRange`.

- [ ] **Step 8: Commit**

```bash
cd earntrack-web
git add src/app/api/analytics/data/route.ts
git commit -m "feat: add downloads read-path to analytics API"
```

---

## Task 4: `store_downloads` Firestore rule + scheduled Cloud Function scaffold

**Files:**
- Modify: `earntrack-web/firestore.rules`
- Modify: `earntrack-web/functions/src/index.ts`

**Interfaces:**
- Produces: Firestore collection `store_downloads` (server-write-only via Admin SDK), which Task 3 reads. Scheduled function `syncStoreDownloads` (europe-west1, every 24 hours) — intentionally a no-op logger until `APPSTORE_CONNECT_KEY_ID` / `APPSTORE_CONNECT_ISSUER_ID` / `APPSTORE_CONNECT_PRIVATE_KEY` / `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` are configured (out of scope per the design spec — the real Apple/Google API calls are a separate follow-up once the user has those credentials).

- [ ] **Step 1: Add the Firestore rule**

In `earntrack-web/firestore.rules`, find:

```
    // ─── Page views (server-side only via admin SDK) ───
    match /page_views/{doc} {
      allow read, write: if false;
    }
```

Add directly after it:

```
    // ─── Page views (server-side only via admin SDK) ───
    match /page_views/{doc} {
      allow read, write: if false;
    }

    // ─── Store downloads (server-side only via admin SDK, tägliche syncStoreDownloads-Function) ───
    match /store_downloads/{doc} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Add the scheduled function scaffold**

In `earntrack-web/functions/src/index.ts`, find:

```typescript
export const checkNotifications = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).region('europe-west1').pubsub.schedule('every 60 minutes').onRun(async () => {
```

Insert directly before it:

```typescript
// ─── Store Downloads Sync ───
// Tägliche Downloadzahlen von App Store Connect & Google Play für den Downloads-Tab in
// /analytics. Läuft bewusst inert (loggt nur "nicht konfiguriert"), solange die
// Store-API-Zugangsdaten fehlen — siehe docs/superpowers/specs/2026-08-06-analytics-redesign-design.md.
// ponytail: kein echter API-Call implementiert, keine Credentials vorhanden. Upgrade: die
// Sales-&-Trends-Report-Abfrage (App Store Connect) und die Reporting API (Google Play)
// hier einhängen, sobald der Nutzer die untenstehenden Secrets gesetzt hat.
function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}

async function writeStoreDownloads(platform: 'ios' | 'android', date: string, downloads: number): Promise<void> {
  await db.collection('store_downloads').doc(`${platform}_${date}`).set({ date, platform, downloads }, { merge: true })
}

async function fetchIosDownloads(): Promise<number | null> {
  const keyId = process.env.APPSTORE_CONNECT_KEY_ID || safeFunctionsConfig().appstore_connect?.key_id
  const issuerId = process.env.APPSTORE_CONNECT_ISSUER_ID || safeFunctionsConfig().appstore_connect?.issuer_id
  const privateKey = process.env.APPSTORE_CONNECT_PRIVATE_KEY || safeFunctionsConfig().appstore_connect?.private_key
  if (!keyId || !issuerId || !privateKey) {
    functions.logger.info('syncStoreDownloads: App Store Connect nicht konfiguriert, überspringe iOS')
    return null
  }
  functions.logger.warn('syncStoreDownloads: App Store Connect Zugangsdaten gesetzt, aber der Report-Abruf ist noch nicht implementiert')
  return null
}

async function fetchAndroidDownloads(): Promise<number | null> {
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || safeFunctionsConfig().google_play?.service_account_json
  if (!serviceAccountJson) {
    functions.logger.info('syncStoreDownloads: Google Play nicht konfiguriert, überspringe Android')
    return null
  }
  functions.logger.warn('syncStoreDownloads: Google Play Zugangsdaten gesetzt, aber der Report-Abruf ist noch nicht implementiert')
  return null
}

export const syncStoreDownloads = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).region('europe-west1').pubsub.schedule('every 24 hours').onRun(async () => {
  const date = isoToday()
  const [iosDownloads, androidDownloads] = await Promise.all([fetchIosDownloads(), fetchAndroidDownloads()])
  if (iosDownloads !== null) await writeStoreDownloads('ios', date, iosDownloads)
  if (androidDownloads !== null) await writeStoreDownloads('android', date, androidDownloads)
});

export const checkNotifications = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).region('europe-west1').pubsub.schedule('every 60 minutes').onRun(async () => {
```

- [ ] **Step 3: Typecheck the functions package**

Run: `cd earntrack-web/functions && npx tsc --noEmit --pretty false`
Expected: no new errors. `db`, `functions`, `safeFunctionsConfig` are already defined at module scope in this file (used by `checkNotifications` and others), so no new imports are needed.

- [ ] **Step 4: Commit**

```bash
cd earntrack-web
git add firestore.rules functions/src/index.ts
git commit -m "feat: scaffold store_downloads collection and daily sync function"
```

---

## Task 5: Extract shared formatters and UI primitives out of `page.tsx`

`page.tsx` is 956 lines (repo convention caps at ~800) and every new tab component needs `Section`, `ChartCard`, `TTip`, `TH`, the chart color palettes, and the date/action-label formatters that currently live only inside `page.tsx`. This task moves them out with zero behavior change, so later tasks can import them.

**Files:**
- Create: `earntrack-web/src/app/analytics/format.ts`
- Create: `earntrack-web/src/app/analytics/ui.tsx`
- Modify: `earntrack-web/src/app/analytics/page.tsx`

**Interfaces:**
- Produces: `format.ts` exports `fmt`, `fmtDate`, `eur`, `fmtK`, `relTime`, `actionLabel`, `actionColor`, `PLATFORM_LABELS: Record<Platform,string>`, `PLATFORM_COLORS: Record<Platform,string>`. `ui.tsx` exports `Section`, `ChartCard`, `TTip`, `Legend`, `TH`, `C` (categorical color array), `PC` (pie color array). Consumed by Task 6, 7, 8, 9.

- [ ] **Step 1: Create `format.ts`**

Create `earntrack-web/src/app/analytics/format.ts`:

```typescript
import type { Platform } from '@/lib/analyticsAggregation'

export function fmt(d: string | undefined | null): string {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  const diff = Date.now() - date.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Gerade eben'
  if (m < 60) return `Vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `Vor ${h} Std.`
  const days = Math.floor(h / 24)
  if (days < 30) return `Vor ${days} Tagen`
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDate(d: string | undefined | null): string {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function fmtK(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toLocaleString()
}

export function relTime(ms: number): string {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'Gerade eben'
  if (s < 60) return `Vor ${s} Sek.`
  const m = Math.floor(s / 60)
  if (m < 60) return `Vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `Vor ${h} Std.`
  return `Vor ${Math.floor(h / 24)} Tagen`
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Angemeldet',
  dashboard_view: 'App geöffnet',
  assignment_created: 'Termin erstellt',
  assignment_updated: 'Termin bearbeitet',
  assignment_deleted: 'Termin gelöscht',
  assignment_status_changed: 'Termin-Status geändert',
  employee_created: 'Mitarbeiter angelegt',
  employee_updated: 'Mitarbeiter bearbeitet',
  employee_deleted: 'Mitarbeiter gelöscht',
  customer_created: 'Kunde angelegt',
  customer_updated: 'Kunde bearbeitet',
  customer_deleted: 'Kunde gelöscht',
  invoice_created: 'Rechnung erstellt',
  invoice_status_changed: 'Rechnungsstatus geändert',
  estimate_created: 'Kostenvoranschlag erstellt',
  estimate_updated: 'Kostenvoranschlag bearbeitet',
  estimate_deleted: 'Kostenvoranschlag gelöscht',
  clock_in: 'Eingestempelt',
  clock_out: 'Ausgestempelt',
  clock_entry_created: 'Zeiteintrag erfasst',
  clock_entry_updated: 'Zeiteintrag korrigiert',
}

const ACTION_COLORS: Record<string, string> = {
  created: 'text-[#0D9488]',
  updated: 'text-blue-600',
  deleted: 'text-red-600',
  changed: 'text-amber-600',
  in: 'text-[#0D9488]',
  out: 'text-slate-600',
  view: 'text-slate-500',
  login: 'text-[#0D9488]',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action
}

export function actionColor(action: string): string {
  const suffix = action.split('_').pop() || ''
  return ACTION_COLORS[suffix] || 'text-[#334155]'
}

export const PLATFORM_LABELS: Record<Platform, string> = { web: 'Web', ios: 'iOS', android: 'Android' }

export const PLATFORM_COLORS: Record<Platform, string> = {
  web: 'bg-[#0D9488]/15 text-[#0D9488]',
  ios: 'bg-[#8B5CF6]/15 text-[#8B5CF6]',
  android: 'bg-amber-500/15 text-amber-600',
}
```

- [ ] **Step 2: Create `ui.tsx`**

Create `earntrack-web/src/app/analytics/ui.tsx`:

```tsx
'use client'

import { eur } from './format'

export const C = ['#0F766E','#0D9488','#14B8A6','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444','#14B8A6','#F97316','#6366F1','#84CC16']
export const PC = ['#0F766E','#F59E0B','#EF4444','#64748B','#8B5CF6','#EC4899']

export function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[#0F172A]">{title}</h2>
        <p className="text-xs text-[#64748B] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-6 hover:border-[#E2E8F0]/80 transition-colors">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>
          <p className="text-[10px] text-[#64748B] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex justify-center">{children}</div>
    </div>
  )
}

export function Legend({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {data.map((d, i) => (
        <span key={d.name} className="inline-flex items-center gap-1.5 text-[10px] text-[#64748B]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PC[i % PC.length] }} />
          {d.name} <strong className="text-[#334155]">{Math.round((d.value / total) * 100)}%</strong>
        </span>
      ))}
    </div>
  )
}

export function TTip({ active, payload, label, labelKey = 'label', valueKey = 'users', unit = '', isEur }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/95 backdrop-blur-md px-4 py-3 text-sm shadow-2xl">
      <p className="font-bold text-[#0F172A]">{payload[0]?.payload?.[labelKey] || label}</p>
      <p className="mt-1 font-bold text-[#0D9488]">{isEur ? eur(val) : val} {unit}</p>
    </div>
  )
}

export function TH({ label, field, current, dir, onClick }: { label: string; field: string; current: string; dir: string; onClick: (f: string) => void }) {
  const active = current === field
  return (
    <td className="px-4 py-4 cursor-pointer select-none" onClick={() => onClick(field)}>
      <span className="flex items-center gap-1">
        {label}
        {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </td>
  )
}
```

- [ ] **Step 3: Update `page.tsx` to import instead of define**

In `earntrack-web/src/app/analytics/page.tsx`, remove the local `fmt`, `fmtDate`, `eur`, `fmtK` function definitions (currently lines 19-49) and the local `Section`, `ChartCard`, `Legend`, `TTip`, `TH` function definitions (currently lines 678-768), and the `ACTION_LABELS`, `ACTION_COLORS`, `actionLabel`, `actionColor` definitions (currently lines 825-867). Also remove the local `C`/`PC` color array constants (currently lines 16-17).

Replace the top imports:

```typescript
import { X, Check } from 'lucide-react'
import LiveFeed from './LiveFeed'
const C = ['#0F766E','#0D9488','#14B8A6','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444','#14B8A6','#F97316','#6366F1','#84CC16']
const PC = ['#0F766E','#F59E0B','#EF4444','#64748B','#8B5CF6','#EC4899']
```

with:

```typescript
import { X, Check } from 'lucide-react'
import LiveFeed from './LiveFeed'
import { fmt, fmtDate, eur, fmtK, actionLabel, actionColor } from './format'
import { C, PC, Section, ChartCard, Legend, TTip, TH } from './ui'
```

Delete the now-duplicated `function fmt(...)`, `function fmtDate(...)`, `function eur(...)`, `function fmtK(...)` bodies that followed the old import block. Delete the now-duplicated `function Section(...)`, `function ChartCard(...)`, `function Legend(...)`, `function TTip(...)`, `function TH(...)` bodies near the bottom of the file. Delete the now-duplicated `const ACTION_LABELS`, `const ACTION_COLORS`, `function actionLabel(...)`, `function actionColor(...)` bodies (still keep `UserModal`, `InfoCard`, `StatusBadge`, `TabBtn`, `NeusteUserBox`, `UserGrowthComparison`, `HeroRow`, `Header`, `FullError`, `BatchProgressModal` in place — those stay in `page.tsx`, they are not reused elsewhere).

- [ ] **Step 4: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no errors. If anything is still referenced from the deleted blocks, the compiler will point at the exact missing name — re-check the import list against Step 3.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `/analytics`, click through all four existing tabs (Übersicht, Nutzer, Website, Umsatz). Every chart, badge, and the CSV export must look and behave exactly as before this task — this is a pure refactor.

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add src/app/analytics/format.ts src/app/analytics/ui.tsx src/app/analytics/page.tsx
git commit -m "refactor: extract shared analytics formatters and UI primitives"
```

---

## Task 6: Extend `LiveFeed.tsx` with real usage events

**Files:**
- Modify: `earntrack-web/src/app/analytics/LiveFeed.tsx`

**Interfaces:**
- Consumes: `actionLabel`, `PLATFORM_LABELS` from Task 5 (`./format`).
- Produces: `LiveFeed` now accepts an optional prop `users?: { uid: string; email: string; name: string }[]` (default `[]`), used to display a human name instead of a raw uid for usage events. Consumed by Task 7, which renders `<LiveFeed users={...} />` in its new position.

- [ ] **Step 1: Add the import and the new `FeedEvent` kind**

In `earntrack-web/src/app/analytics/LiveFeed.tsx`, find:

```typescript
import { db } from '@/lib/firebase'

type FeedEvent = {
  id: string
  kind: 'registrierung' | 'zahlung' | 'demo' | 'upgrade' | 'kuendigung'
  label: string
  sublabel: string
  at: number
}
```

Replace with:

```typescript
import { db } from '@/lib/firebase'
import { actionLabel, PLATFORM_LABELS } from './format'

type FeedEvent = {
  id: string
  kind: 'registrierung' | 'zahlung' | 'demo' | 'upgrade' | 'kuendigung' | 'nutzung'
  label: string
  sublabel: string
  at: number
}

interface UserLite {
  uid: string
  email: string
  name: string
}
```

- [ ] **Step 2: Register the style/label for the new kind**

Find:

```typescript
const KIND_STYLE: Record<FeedEvent['kind'], { bg: string; text: string; dot: string }> = {
  registrierung: { bg: 'bg-[#0F766E]/15', text: 'text-[#0D9488]', dot: '#0D9488' },
  zahlung: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: '#F59E0B' },
  demo: { bg: 'bg-[#8B5CF6]/15', text: 'text-[#8B5CF6]', dot: '#8B5CF6' },
  upgrade: { bg: 'bg-[#0D9488]/15', text: 'text-[#0D9488]', dot: '#0D9488' },
  kuendigung: { bg: 'bg-red-500/15', text: 'text-red-400', dot: '#EF4444' },
}

const KIND_LABEL: Record<FeedEvent['kind'], string> = {
  registrierung: 'Registrierung',
  zahlung: 'Zahlung',
  demo: 'Demo-Anmeldung',
  upgrade: 'Upgrade',
  kuendigung: 'Kündigung',
}
```

Replace with:

```typescript
const KIND_STYLE: Record<FeedEvent['kind'], { bg: string; text: string; dot: string }> = {
  registrierung: { bg: 'bg-[#0F766E]/15', text: 'text-[#0D9488]', dot: '#0D9488' },
  zahlung: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: '#F59E0B' },
  demo: { bg: 'bg-[#8B5CF6]/15', text: 'text-[#8B5CF6]', dot: '#8B5CF6' },
  upgrade: { bg: 'bg-[#0D9488]/15', text: 'text-[#0D9488]', dot: '#0D9488' },
  kuendigung: { bg: 'bg-red-500/15', text: 'text-red-400', dot: '#EF4444' },
  nutzung: { bg: 'bg-slate-500/15', text: 'text-slate-500', dot: '#64748B' },
}

const KIND_LABEL: Record<FeedEvent['kind'], string> = {
  registrierung: 'Registrierung',
  zahlung: 'Zahlung',
  demo: 'Demo-Anmeldung',
  upgrade: 'Upgrade',
  kuendigung: 'Kündigung',
  nutzung: 'Nutzung',
}
```

- [ ] **Step 3: Accept the `users` prop and add the `activity_events` listener**

Find:

```typescript
export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
```

Replace with:

```typescript
export default function LiveFeed({ users = [] }: { users?: UserLite[] }) {
  const [events, setEvents] = useState<FeedEvent[]>([])
```

Find the closing of the `demo_signups` listener block (the fourth `unsubs.push(...)` call) — right before the `companies` listener:

```typescript
    unsubs.push(onSnapshot(
      query(collection(db, 'demo_signups'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `demo_${ch.doc.id}`,
            kind: 'demo',
            label: d.name || 'Unbekannt',
            sublabel: d.email || '',
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      collection(db, 'companies'),
```

Insert a new listener between them:

```typescript
    unsubs.push(onSnapshot(
      query(collection(db, 'demo_signups'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `demo_${ch.doc.id}`,
            kind: 'demo',
            label: d.name || 'Unbekannt',
            sublabel: d.email || '',
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      query(collection(db, 'activity_events'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          const user = users.find(u => u.uid === d.uid)
          const platform = d.platform === 'ios' || d.platform === 'android' ? d.platform : 'web'
          pushEvent({
            id: `nutzung_${ch.doc.id}`,
            kind: 'nutzung',
            label: user?.name && user.name !== '-' ? user.name : (user?.email || 'Unbekannt'),
            sublabel: `${actionLabel(d.action || '')} · ${PLATFORM_LABELS[platform]}`,
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      collection(db, 'companies'),
```

- [ ] **Step 4: Add `users` to the effect's dependency array**

Find the end of the `useEffect`:

```typescript
    return () => unsubs.forEach(u => u())
  }, [])
```

Replace with:

```typescript
    return () => unsubs.forEach(u => u())
  }, [users])
```

- [ ] **Step 5: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no errors. `page.tsx` still calls `<LiveFeed />` with no props at this point — that's fine, `users` defaults to `[]` — Task 7 wires the real prop.

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add src/app/analytics/LiveFeed.tsx
git commit -m "feat: show real usage events in the analytics live feed"
```

---

## Task 7: "Gerade aktiv" bar + "Zuletzt aktive Nutzer" card, Übersicht reorder

**Files:**
- Create: `earntrack-web/src/app/analytics/useRecentActivity.ts`
- Create: `earntrack-web/src/app/analytics/RecentActivity.tsx`
- Modify: `earntrack-web/src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `relTime`, `PLATFORM_LABELS`, `PLATFORM_COLORS` from Task 5; `Platform` type from Task 1.
- Produces: `useRecentActivity(limitCount): LiveActivityEntry[]` (real-time, client-side); components `LiveNowBar({ users })` and `RecentActivityCard({ users })`, both taking `UserLite[]`. Consumed only by `page.tsx` in this task.

- [ ] **Step 1: Create the live-activity hook**

Create `earntrack-web/src/app/analytics/useRecentActivity.ts`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Platform } from '@/lib/analyticsAggregation'

export interface LiveActivityEntry {
  id: string
  uid: string
  action: string
  platform: Platform
  at: number
}

function toMs(v: any): number {
  if (!v) return 0
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v?.toMillis === 'function') return v.toMillis()
  return 0
}

export function useRecentActivity(limitCount: number): LiveActivityEntry[] {
  const [entries, setEntries] = useState<LiveActivityEntry[]>([])

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'activity_events'), orderBy('createdAt', 'desc'), limit(limitCount)),
      snap => {
        setEntries(snap.docs.map(d => {
          const data = d.data()
          const platform: Platform = data.platform === 'ios' || data.platform === 'android' ? data.platform : 'web'
          return {
            id: d.id,
            uid: data.uid || '',
            action: data.action || '-',
            platform,
            at: toMs(data.createdAt),
          }
        }))
      },
      () => {}
    )
    return unsub
  }, [limitCount])

  return entries
}
```

- [ ] **Step 2: Create the two components**

Create `earntrack-web/src/app/analytics/RecentActivity.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { useRecentActivity } from './useRecentActivity'
import { relTime, PLATFORM_LABELS, PLATFORM_COLORS } from './format'

interface UserLite {
  uid: string
  email: string
  name: string
  companyName?: string
}

function joinUser(uid: string, users: UserLite[]): UserLite {
  return users.find(u => u.uid === uid) || { uid, email: '-', name: 'Unbekannt', companyName: '-' }
}

function initial(u: UserLite): string {
  const source = u.name !== '-' && u.name ? u.name : u.email
  return (source || '?').charAt(0).toUpperCase()
}

const FIVE_MIN_MS = 5 * 60 * 1000

export function LiveNowBar({ users }: { users: UserLite[] }) {
  const activity = useRecentActivity(50)
  const activeNow = useMemo(() => {
    const cutoff = Date.now() - FIVE_MIN_MS
    const seen = new Set<string>()
    return activity.filter(e => {
      if (e.at < cutoff || seen.has(e.uid)) return false
      seen.add(e.uid)
      return true
    })
  }, [activity])

  if (!activeNow.length) return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-gradient-to-r from-[#0F766E]/10 to-transparent px-5 py-3">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0D9488] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0D9488]" />
      </span>
      <p className="text-sm font-semibold text-[#0F172A]">{activeNow.length} Nutzer gerade aktiv</p>
      <div className="flex -space-x-2">
        {activeNow.slice(0, 8).map(e => {
          const u = joinUser(e.uid, users)
          return (
            <div
              key={e.uid}
              title={u.name !== '-' ? u.name : u.email}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#F8FAFC] bg-[#0F766E]/20 text-[10px] font-bold text-[#0D9488]"
            >
              {initial(u)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RecentActivityCard({ users }: { users: UserLite[] }) {
  const activity = useRecentActivity(50)
  const latestPerUser = useMemo(() => {
    const seen = new Set<string>()
    return activity.filter(e => {
      if (seen.has(e.uid)) return false
      seen.add(e.uid)
      return true
    }).slice(0, 8)
  }, [activity])

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-6">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-[#0F172A]">Zuletzt aktive Nutzer</h2>
        <p className="text-[10px] text-[#64748B] mt-0.5">Live, nach letzter Aktion sortiert</p>
      </div>
      {!latestPerUser.length ? (
        <p className="py-6 text-center text-xs text-[#64748B]">Noch keine Aktivität erfasst</p>
      ) : (
        <div className="space-y-2">
          {latestPerUser.map(e => {
            const u = joinUser(e.uid, users)
            return (
              <div key={e.uid} className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/60 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F766E]/15 text-xs font-bold text-[#0D9488]">
                  {initial(u)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0F172A]">{u.name !== '-' ? u.name : u.email}</p>
                  <p className="truncate text-[10px] text-[#64748B]">{u.companyName && u.companyName !== '-' ? u.companyName : u.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PLATFORM_COLORS[e.platform]}`}>
                    {PLATFORM_LABELS[e.platform]}
                  </span>
                  <p className="mt-1 text-[10px] text-[#64748B]">{relTime(e.at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Reorder the Übersicht tab in `page.tsx`**

Add the import:

```typescript
import { LiveNowBar, RecentActivityCard } from './RecentActivity'
```

Find the entire Übersicht block:

```tsx
            {/* ─── Übersicht ─── */}
            {activeTab === 'ubersicht' && (
              <div className="space-y-8">
                <LiveFeed />
                {data?.recentSignups?.length > 0 && <NeusteUserBox signups={data.recentSignups} />}
                <UserGrowthComparison k={k} />
                <HeroRow k={k} />
                <Section title="Nutzeraktivität" subtitle={`Letzte ${timeRange} Tage`}>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <ChartCard title="Täglich aktive User (DAU)" subtitle="Unique User pro Tag">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data.dauData}>
                          <defs><linearGradient id="dauG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={0.15}/><stop offset="100%" stopColor="#0D9488" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                          <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                          <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                          <Tooltip content={<TTip valueKey="users" unit="aktive User"/>}/>
                          <Line type="monotone" dataKey="users" stroke="#0D9488" strokeWidth={3} dot={false} activeDot={{r:6,fill:'#0D9488',stroke:'#F8FAFC',strokeWidth:3}}/>
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="Meistgenutzte Features" subtitle="Top 12 Aktionen">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.featureData} layout="vertical" margin={{left:0,right:16}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5} horizontal={false}/>
                          <XAxis type="number" tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                          <YAxis type="category" dataKey="name" tick={{fill:'#334155',fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                          <Tooltip content={<TTip valueKey="value" unit="Aufrufe"/>}/>
                          <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={20}>
                            {data.featureData.map((_: any,i: number) => <Cell key={i} fill={C[i%C.length]}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>
                </Section>
                <Section title="Wachstum" subtitle="Kumulierte Registrierungen">
```

Replace the opening through `<Section title="Wachstum"` with:

```tsx
            {/* ─── Übersicht ─── */}
            {activeTab === 'ubersicht' && (
              <div className="space-y-8">
                <LiveNowBar users={data?.users || []} />
                <RecentActivityCard users={data?.users || []} />
                {data?.recentSignups?.length > 0 && <NeusteUserBox signups={data.recentSignups} />}
                <HeroRow k={k} />
                <LiveFeed users={data?.users || []} />
                <UserGrowthComparison k={k} />
                <Section title="Wachstum" subtitle="Kumulierte Registrierungen">
```

This removes the entire "Nutzeraktivität" `<Section>` (DAU + feature chart) from Übersicht — it moves to the new Aktivität tab in Task 8. Leave everything from `<ChartCard title="User Growth"` onward (the rest of the Wachstum section, and the Geschäftsüberblick section after it) exactly as-is — only the opening portion shown above changes.

- [ ] **Step 4: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no errors. If `LineChart`, `BarChart`, `Cell` etc. are now unused in `page.tsx` because the removed section was their only usage, remove those now-unused imports from the `recharts` import line at the top of `page.tsx` (keep `BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area` only if still used elsewhere in the file — the Umsatz and Nutzer tabs still use several of these, so check with `grep -n "LineChart\|BarChart\|<Cell" src/app/analytics/page.tsx` before removing any).

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `/analytics` as admin. Übersicht should show, top to bottom: the "Gerade aktiv" bar (only if someone has acted in the last 5 minutes — trigger it yourself by clicking around the app in another tab while logged in as a normal user), the "Zuletzt aktive Nutzer" card, new-signups box (if any), hero KPIs, the live feed (now including a "Nutzung" badge when you generate activity), growth comparison, and the Wachstum/Geschäftsüberblick sections. The DAU/feature chart section should no longer appear here.

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add src/app/analytics/useRecentActivity.ts src/app/analytics/RecentActivity.tsx src/app/analytics/page.tsx
git commit -m "feat: add live active-users bar and card to analytics overview"
```

---

## Task 8: New web "Aktivität" tab

**Files:**
- Create: `earntrack-web/src/app/analytics/ActivityTab.tsx`
- Modify: `earntrack-web/src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `Section`, `ChartCard`, `TTip`, `TH`, `C` from Task 5 (`./ui`); `actionLabel`, `fmt`, `PLATFORM_LABELS`, `PLATFORM_COLORS` from Task 5 (`./format`); `data.dauData`, `data.featureData`, `data.platformBreakdown`, `data.platformTrend`, `data.recentActivity` from Task 2 (API response).
- Produces: `<ActivityTab timeRange featureData dauData platformBreakdown platformTrend recentActivity />`, rendered by `page.tsx` in this task.

- [ ] **Step 1: Create the component**

Create `earntrack-web/src/app/analytics/ActivityTab.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { Section, ChartCard, TTip, TH, C } from './ui'
import { actionLabel, fmt, PLATFORM_LABELS, PLATFORM_COLORS } from './format'
import type { RecentActivityEntry, PlatformBreakdown, PlatformTrendPoint } from '@/lib/analyticsAggregation'

interface Props {
  timeRange: number
  dauData: { label: string; users: number }[]
  featureData: { name: string; value: number }[]
  platformBreakdown: PlatformBreakdown | undefined
  platformTrend: PlatformTrendPoint[]
  recentActivity: RecentActivityEntry[]
}

const PLATFORM_PIE_COLORS = ['#0D9488', '#8B5CF6', '#F59E0B']

export default function ActivityTab({ timeRange, dauData, featureData, platformBreakdown, platformTrend, recentActivity }: Props) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const platformPieData = useMemo(() => {
    if (!platformBreakdown) return []
    return [
      { name: 'Web', value: platformBreakdown.web },
      { name: 'iOS', value: platformBreakdown.ios },
      { name: 'Android', value: platformBreakdown.android },
    ].filter(d => d.value > 0)
  }, [platformBreakdown])

  const filtered = useMemo(() => {
    let list = [...recentActivity]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e => e.email.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.companyName.toLowerCase().includes(q))
    }
    list.sort((a: any, b: any) => {
      const va = String(a[sortField] || ''), vb = String(b[sortField] || '')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [recentActivity, search, sortField, sortDir])

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  return (
    <div className="space-y-8">
      <Section title="Nutzeraktivität" subtitle={`Letzte ${timeRange} Tage`}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Täglich aktive User (DAU)" subtitle="Unique User pro Tag">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                <Tooltip content={<TTip valueKey="users" unit="aktive User"/>}/>
                <Line type="monotone" dataKey="users" stroke="#0D9488" strokeWidth={3} dot={false} activeDot={{r:6,fill:'#0D9488',stroke:'#F8FAFC',strokeWidth:3}}/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Meistgenutzte Features" subtitle="Top 12 Aktionen">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={featureData} layout="vertical" margin={{left:0,right:16}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5} horizontal={false}/>
                <XAxis type="number" tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fill:'#334155',fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                <Tooltip content={<TTip valueKey="value" unit="Aufrufe"/>}/>
                <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={20}>
                  {featureData.map((_, i) => <Cell key={i} fill={C[i % C.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      <Section title="Plattformen" subtitle="Web vs. iOS vs. Android">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Verteilung" subtitle="Aktionen im Zeitraum">
            <PieChart height={240} width={300}>
              <Pie data={platformPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                {platformPieData.map((_, i) => <Cell key={i} fill={PLATFORM_PIE_COLORS[i % PLATFORM_PIE_COLORS.length]}/>)}
              </Pie>
              <Tooltip/>
            </PieChart>
          </ChartCard>
          <ChartCard title="Verlauf" subtitle={`Letzte ${timeRange} Tage`}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={platformTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:10}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}/>
                <Area type="monotone" dataKey="web" name="Web" stackId="p" stroke="#0D9488" fill="#0D9488" fillOpacity={0.25}/>
                <Area type="monotone" dataKey="ios" name="iOS" stackId="p" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25}/>
                <Area type="monotone" dataKey="android" name="Android" stackId="p" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.25}/>
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      <Section title="Zuletzt aktiv" subtitle={`${filtered.length} Ereignisse`}>
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
          <div className="border-b border-[#E2E8F0] px-6 py-4">
            <div className="relative w-56">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="w-56 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 py-2 text-sm text-[#0F172A] placeholder-[#64748B] outline-none focus:border-[#0D9488]/50 transition-colors"/>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                <TH label="Nutzer" field="email" current={sortField} dir={sortDir} onClick={toggleSort}/>
                <td className="px-4 py-4">Aktion</td>
                <TH label="Plattform" field="platform" current={sortField} dir={sortDir} onClick={toggleSort}/>
                <TH label="Zeit" field="at" current={sortField} dir={sortDir} onClick={toggleSort}/>
              </tr></thead>
              <tbody>
                {filtered.slice(0, 200).map((e, i) => (
                  <tr key={`${e.uid}_${e.at}_${i}`} className="border-b border-[#E2E8F0]/40 text-[#334155] last:border-0">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-[#0F172A] text-sm">{e.name !== '-' ? e.name : e.email}</div>
                      <div className="text-[11px] text-[#64748B]">{e.companyName !== '-' ? e.companyName : ''}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">{actionLabel(e.action)}</td>
                    <td className="px-4 py-3.5"><span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PLATFORM_COLORS[e.platform]}`}>{PLATFORM_LABELS[e.platform]}</span></td>
                    <td className="px-4 py-3.5 text-xs text-[#64748B]">{fmt(e.at)}</td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={4} className="px-4 py-16 text-center text-sm text-[#64748B]">Keine Aktivität im Zeitraum</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
```

- [ ] **Step 2: Wire the tab into `page.tsx`**

Add the import:

```typescript
import ActivityTab from './ActivityTab'
```

Extend the `TabId` type:

```typescript
type TabId = 'ubersicht' | 'aktivitaet' | 'nutzer' | 'website' | 'umsatz'
```

(add `'downloads'` too, in the same edit, since Task 9 needs it and this is the one place the type is declared):

```typescript
type TabId = 'ubersicht' | 'aktivitaet' | 'nutzer' | 'downloads' | 'website' | 'umsatz'
```

Find the tab navigation bar:

```tsx
            <TabBtn active={activeTab === 'nutzer'} onClick={() => setActiveTab('nutzer')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Nutzer
            </TabBtn>
```

Insert a new `TabBtn` directly before it (Aktivität comes right after Übersicht):

```tsx
            <TabBtn active={activeTab === 'aktivitaet'} onClick={() => setActiveTab('aktivitaet')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Aktivität
            </TabBtn>
            <TabBtn active={activeTab === 'nutzer'} onClick={() => setActiveTab('nutzer')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Nutzer
            </TabBtn>
```

Find the closing of the Übersicht tab content block (right after the Task 7 changes, at `</div>\n            )}\n\n            {/* ─── Nutzer ─── */}`) and insert the Aktivität render block between Übersicht and Nutzer:

```tsx
              </div>
            )}

            {/* ─── Aktivität ─── */}
            {activeTab === 'aktivitaet' && (
              <ActivityTab
                timeRange={timeRange}
                dauData={data.dauData}
                featureData={data.featureData}
                platformBreakdown={data.platformBreakdown}
                platformTrend={data.platformTrend || []}
                recentActivity={data.recentActivity || []}
              />
            )}

            {/* ─── Nutzer ─── */}
```

- [ ] **Step 3: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/analytics`, click the new "Aktivität" tab. It should show the DAU chart, feature chart, a platform donut + trend area chart, and a searchable/sortable activity table. Try the search box and clicking column headers to sort.

- [ ] **Step 5: Commit**

```bash
cd earntrack-web
git add src/app/analytics/ActivityTab.tsx src/app/analytics/page.tsx
git commit -m "feat: add Aktivität tab with platform breakdown and activity table"
```

---

## Task 9: New web "Downloads" tab

**Files:**
- Create: `earntrack-web/src/app/analytics/DownloadsTab.tsx`
- Modify: `earntrack-web/src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `ChartCard` from Task 5 (`./ui`); `DownloadsSummary` type from Task 1; `kpis.downloads` from Task 3 (API response).
- Produces: `<DownloadsTab downloads range onRangeChange loading />`, rendered by `page.tsx`, which owns a new `downloadsRange` state independent from the page's global `timeRange`.

- [ ] **Step 1: Create the component**

Create `earntrack-web/src/app/analytics/DownloadsTab.tsx`:

```tsx
'use client'

import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { ChartCard } from './ui'
import type { DownloadsSummary } from '@/lib/analyticsAggregation'

const RANGE_OPTIONS = [1, 7, 30, 90] as const
const RANGE_LABELS: Record<number, string> = { 1: 'Heute', 7: '7T', 30: '30T', 90: '90T' }

interface Props {
  downloads: DownloadsSummary | undefined
  range: number
  onRangeChange: (days: number) => void
  loading: boolean
}

export default function DownloadsTab({ downloads, range, onRangeChange, loading }: Props) {
  if (!downloads?.configured) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-10 text-center">
        <h2 className="text-base font-bold text-[#0F172A]">Downloads noch nicht verbunden</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#64748B]">
          Es liegen noch keine Downloadzahlen vor. Dafür braucht es einen API Key aus App Store Connect
          und einen Service Account aus der Google Play Console.
        </p>
        <ol className="mx-auto mt-6 max-w-md space-y-2 text-left text-xs text-[#64748B] list-decimal list-inside">
          <li>In App Store Connect unter &bdquo;Nutzer und Zugriff → Integrationen&ldquo; einen API Key mit Rolle &bdquo;Finance&ldquo; oder &bdquo;Sales&ldquo; erstellen.</li>
          <li>In der Google Play Console unter &bdquo;Setup → API-Zugriff&ldquo; einen Service Account mit Zugriff auf &bdquo;Statistiken&ldquo; anlegen.</li>
          <li>Beide Zugangsdaten als Firebase-Functions-Secrets hinterlegen (APPSTORE_CONNECT_KEY_ID/ISSUER_ID/PRIVATE_KEY, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).</li>
        </ol>
      </div>
    )
  }

  const deltaLabel = downloads.deltaPct === null ? 'neu' : `${downloads.deltaPct > 0 ? '+' : ''}${downloads.deltaPct}%`
  const deltaColor = downloads.deltaPct === null ? 'text-[#64748B]' : downloads.deltaPct >= 0 ? 'text-[#0D9488]' : 'text-red-500'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Downloads</h2>
        <div className="flex rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
          {RANGE_OPTIONS.map(v => (
            <button key={v} onClick={() => onRangeChange(v)} disabled={loading} className={`rounded-md px-4 py-2 text-xs font-bold transition ${range === v ? 'bg-[#0F766E] text-white shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'}`}>
              {RANGE_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5 border-l-[3px] border-l-[#0D9488]">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Downloads gesamt</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.totalCurrent.toLocaleString('de-DE')}</p>
          <p className={`mt-1 text-xs font-bold ${deltaColor}`}>{deltaLabel} ggü. Vorperiode</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">iOS</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.ios.toLocaleString('de-DE')}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Android</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.android.toLocaleString('de-DE')}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Vorperiode</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.totalPrevious.toLocaleString('de-DE')}</p>
        </div>
      </div>

      <ChartCard title="Downloads pro Tag" subtitle="Nach Plattform">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={downloads.chartData}>
            <defs>
              <linearGradient id="iosG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={0.25}/><stop offset="100%" stopColor="#0D9488" stopOpacity={0}/></linearGradient>
              <linearGradient id="androidG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25}/><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
            <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:10}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
            <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}/>
            <Area type="monotone" dataKey="ios" name="iOS" stackId="dl" stroke="#0D9488" strokeWidth={2} fill="url(#iosG)"/>
            <Area type="monotone" dataKey="android" name="Android" stackId="dl" stroke="#8B5CF6" strokeWidth={2} fill="url(#androidG)"/>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
```

- [ ] **Step 2: Add `downloadsRange` state and thread it through `loadData`**

In `page.tsx`, find:

```typescript
  const [timeRange, setTimeRange] = useState(30)
```

Add directly after it:

```typescript
  const [timeRange, setTimeRange] = useState(30)
  const [downloadsRange, setDownloadsRange] = useState(30)
```

Find:

```typescript
  useEffect(() => {
    if (authLoading || adminLoading) return
    if (!isAdmin) { router.replace('/dashboard'); return }
    auth.currentUser?.getIdToken().then(token => {
      if (token) fetch('/api/auth/session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken: token }) }).catch(e => console.error('session fetch:', e))
    })
    loadData()
  }, [user, authLoading, adminLoading, timeRange, isAdmin])
```

Replace with:

```typescript
  useEffect(() => {
    if (authLoading || adminLoading) return
    if (!isAdmin) { router.replace('/dashboard'); return }
    auth.currentUser?.getIdToken().then(token => {
      if (token) fetch('/api/auth/session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken: token }) }).catch(e => console.error('session fetch:', e))
    })
    loadData()
  }, [user, authLoading, adminLoading, timeRange, downloadsRange, isAdmin])
```

Find:

```typescript
      const res = await fetch('/api/analytics/data', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timeRange }),
      })
```

Replace with:

```typescript
      const res = await fetch('/api/analytics/data', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timeRange, downloadsTimeRange: downloadsRange }),
      })
```

- [ ] **Step 3: Wire the tab into `page.tsx`**

Add the import:

```typescript
import DownloadsTab from './DownloadsTab'
```

Find the "Umsatz" `TabBtn` and the "Feedback →" link:

```tsx
            <TabBtn active={activeTab === 'umsatz'} onClick={() => setActiveTab('umsatz')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Umsatz
            </TabBtn>
            <a href="/analytics/feedback" className="ml-auto text-sm font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors">
```

Insert a new `TabBtn` between "Website" and "Umsatz" (find `Website\n            </TabBtn>` and insert after it, before the Umsatz button) — the resulting order is Übersicht, Aktivität, Nutzer, Downloads, Website, Umsatz:

```tsx
            <TabBtn active={activeTab === 'downloads'} onClick={() => setActiveTab('downloads')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Downloads
            </TabBtn>
```

Find the closing of the Website tab content block (`</div>\n            )}\n\n            {/* ─── Umsatz ─── */}`) and insert the Downloads render block between Website and Umsatz:

```tsx
              </div>
            )}

            {/* ─── Downloads ─── */}
            {activeTab === 'downloads' && (
              <DownloadsTab
                downloads={k?.downloads}
                range={downloadsRange}
                onRangeChange={setDownloadsRange}
                loading={loading}
              />
            )}

            {/* ─── Umsatz ─── */}
```

- [ ] **Step 4: Typecheck**

Run: `cd earntrack-web && npx tsc --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `/analytics`, click "Downloads". Since `store_downloads` is empty, it must show the "noch nicht verbunden" empty state with the 3-step instructions — never a chart with zeros. Confirm switching the (currently non-functional, since the collection is empty) range buttons doesn't crash and re-triggers a network request in the Network tab.

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add src/app/analytics/DownloadsTab.tsx src/app/analytics/page.tsx
git commit -m "feat: add Downloads tab with its own time-range filter"
```

---

## Task 10: Mobile — scrollable tab bar with the two new tabs

**Files:**
- Modify: `EarnTrack-Android/screens/AdminAnalyticsScreen.js`

**Interfaces:**
- Produces: `AdminAnalyticsScreen` now renders 6 tabs (`ubersicht, aktivitaet, nutzer, downloads, website, umsatz`) in a horizontally scrollable bar. Consumed visually only — Tasks 12/13 create the two new tab components this renders.

- [ ] **Step 1: Extend the `TABS` array**

Find:

```javascript
const TABS = [
  { id: 'ubersicht', label: 'Übersicht' },
  { id: 'nutzer', label: 'Nutzer' },
  { id: 'website', label: 'Website' },
  { id: 'umsatz', label: 'Umsatz' },
];
```

Replace with:

```javascript
const TABS = [
  { id: 'ubersicht', label: 'Übersicht' },
  { id: 'aktivitaet', label: 'Aktivität' },
  { id: 'nutzer', label: 'Nutzer' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'website', label: 'Website' },
  { id: 'umsatz', label: 'Umsatz' },
];
```

- [ ] **Step 2: Add the two imports**

Find:

```javascript
import OverviewTab from './adminAnalytics/OverviewTab';
import UsersTab from './adminAnalytics/UsersTab';
import { WebsiteTab, UmsatzTab } from './adminAnalytics/MetricsTabs';
```

Replace with:

```javascript
import OverviewTab from './adminAnalytics/OverviewTab';
import UsersTab from './adminAnalytics/UsersTab';
import ActivityTab from './adminAnalytics/ActivityTab';
import DownloadsTab from './adminAnalytics/DownloadsTab';
import { WebsiteTab, UmsatzTab } from './adminAnalytics/MetricsTabs';
```

- [ ] **Step 3: Make the tab bar horizontally scrollable**

Find:

```jsx
      <View style={[styles.tabBar, { borderColor: c.border }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tabBtn, activeTab === tab.id && { backgroundColor: '#0D9488' }]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.id ? '#fff' : c.muted }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
```

Replace with:

```jsx
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderColor: c.border }]}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tabBtn, activeTab === tab.id && { backgroundColor: '#0D9488' }]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.id ? '#fff' : c.muted }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
```

(`ScrollView` is already imported at the top of this file for the content area, no new import needed.)

- [ ] **Step 4: Update the tab bar styles**

Find:

```javascript
  tabBar: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, borderRadius: 12, borderWidth: 1, padding: 3, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
```

Replace with:

```javascript
  tabBar: { marginHorizontal: 20, marginBottom: 12, borderRadius: 12, borderWidth: 1 },
  tabBarContent: { flexDirection: 'row', padding: 3, gap: 2 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 9, alignItems: 'center' },
```

- [ ] **Step 5: Render the two new tabs**

Find:

```jsx
          {activeTab === 'ubersicht' && <OverviewTab data={data} isDark={isDark} />}
          {activeTab === 'nutzer' && <UsersTab users={data?.users || []} idToken={idToken} onRefresh={load} isDark={isDark} />}
          {activeTab === 'website' && <WebsiteTab data={data} isDark={isDark} />}
          {activeTab === 'umsatz' && <UmsatzTab data={data} isDark={isDark} />}
```

Replace with:

```jsx
          {activeTab === 'ubersicht' && <OverviewTab data={data} isDark={isDark} />}
          {activeTab === 'aktivitaet' && <ActivityTab data={data} isDark={isDark} />}
          {activeTab === 'nutzer' && <UsersTab users={data?.users || []} idToken={idToken} onRefresh={load} isDark={isDark} />}
          {activeTab === 'downloads' && <DownloadsTab data={data} isDark={isDark} />}
          {activeTab === 'website' && <WebsiteTab data={data} isDark={isDark} />}
          {activeTab === 'umsatz' && <UmsatzTab data={data} isDark={isDark} />}
```

- [ ] **Step 6: Verify it doesn't crash before the new tab files exist**

`ActivityTab` and `DownloadsTab` don't exist as files yet (Tasks 12 and 13 create them) — this task will fail to bundle until those land. Do Task 10, 11, 12, 13 in that order without shipping/testing Task 10 standalone; run the app after Task 13 is done (see Task 13's verification step, which covers all of Tasks 10-13 together).

- [ ] **Step 7: Commit**

```bash
cd EarnTrack-Android
git add screens/AdminAnalyticsScreen.js
git commit -m "feat: add scrollable tab bar with Aktivität and Downloads tabs"
```

---

## Task 11: Mobile — shared `RecentActivityList` + insert into `OverviewTab.js`

**Files:**
- Create: `EarnTrack-Android/screens/adminAnalytics/RecentActivityList.js`
- Modify: `EarnTrack-Android/screens/adminAnalytics/OverviewTab.js`

**Interfaces:**
- Produces: `<RecentActivityList entries={RecentActivityEntry[]} isDark limit? searchable? />` — `entries` matches the API's `recentActivity` shape (`{ uid, email, name, companyName, action, platform, at }`, `at` as ISO string). Consumed by `OverviewTab.js` (this task, `limit={5}`, no search) and Task 12's `ActivityTab.js` (`searchable`, no limit).

Note on scope: mobile intentionally reuses the same pull-to-refresh `fetchAnalyticsData` data (no separate live Firestore listener like the web `LiveNowBar`/`RecentActivityCard` from Task 7) — the mobile screen already refreshes via pull-to-refresh, and adding a second real-time data path here would duplicate work the web LiveFeed already covers without a corresponding request in the design spec for mobile.

- [ ] **Step 1: Create the component**

Create `EarnTrack-Android/screens/adminAnalytics/RecentActivityList.js`:

```javascript
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';

const PLATFORM_LABELS = { web: 'Web', ios: 'iOS', android: 'Android' };
const PLATFORM_COLORS = { web: '#0D9488', ios: '#8B5CF6', android: '#F59E0B' };

function relTime(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Gerade eben';
  if (m < 60) return `Vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Vor ${h} Std.`;
  return `Vor ${Math.floor(h / 24)} Tagen`;
}

export default function RecentActivityList({ entries = [], isDark = false, limit, searchable = false }) {
  const [search, setSearch] = useState('');
  const c = {
    card: isDark ? '#161618' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#0f172a',
    muted: isDark ? '#98989D' : '#64748b',
    input: isDark ? '#0A0A0A' : '#f8fafc',
  };

  const filtered = useMemo(() => {
    let list = entries;
    if (searchable && search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.email || '').toLowerCase().includes(q) ||
        (e.name || '').toLowerCase().includes(q) ||
        (e.companyName || '').toLowerCase().includes(q)
      );
    }
    return limit ? list.slice(0, limit) : list;
  }, [entries, search, searchable, limit]);

  return (
    <View>
      {searchable && (
        <View style={[styles.searchBox, { backgroundColor: c.input, borderColor: c.border }]}>
          <Search size={16} color={c.muted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Suche nach Name, E-Mail, Firma..."
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      )}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {!filtered.length ? (
          <Text style={[styles.empty, { color: c.muted }]}>Noch keine Aktivität erfasst</Text>
        ) : filtered.map((e, i) => (
          <View key={`${e.uid}_${e.at}_${i}`} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{e.name && e.name !== '-' ? e.name : e.email}</Text>
              <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>{e.companyName && e.companyName !== '-' ? e.companyName : e.email}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.platform, { color: PLATFORM_COLORS[e.platform] || PLATFORM_COLORS.web }]}>
                {PLATFORM_LABELS[e.platform] || 'Web'}
              </Text>
              <Text style={[styles.time, { color: c.muted }]}>{relTime(e.at)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  name: { fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 2 },
  platform: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  time: { fontSize: 10, marginTop: 2 },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 20 },
});
```

- [ ] **Step 2: Rewrite `OverviewTab.js`**

Replace the full contents of `EarnTrack-Android/screens/adminAnalytics/OverviewTab.js`:

```javascript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LiveFeed from './LiveFeed';
import RecentActivityList from './RecentActivityList';

function Kpi({ c, label, value, accent }) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.kpiLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent || c.text }]}>{value}</Text>
    </View>
  );
}

export default function OverviewTab({ data, isDark = false }) {
  const k = data?.kpis || {};

  const c = {
    card: isDark ? '#161618' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#0f172a',
    muted: isDark ? '#98989D' : '#64748b',
  };

  return (
    <View>
      <LiveFeed isDark={isDark} />

      <View style={styles.kpiGrid}>
        <Kpi c={c} label="Nutzer gesamt" value={String(k.totalUsers ?? 0)} />
        <Kpi c={c} label="Aktiv heute" value={String(k.activeToday ?? 0)} accent="#0D9488" />
        <Kpi c={c} label="Aktiv 7 Tage" value={String(k.activeWeek ?? 0)} />
        <Kpi c={c} label="Firmen" value={String(k.totalCompanies ?? 0)} />
        <Kpi c={c} label="Pro-Nutzer" value={String(k.subs?.active ?? 0)} accent="#0D9488" />
        <Kpi c={c} label="Trial" value={String(k.subs?.trial ?? 0)} />
        <Kpi c={c} label="Neu heute" value={String(k.newUsersToday ?? 0)} />
        <Kpi c={c} label="Neu 7 Tage" value={String(k.newUsersThisWeek ?? 0)} />
      </View>

      <Text style={[styles.sectionTitle, { color: c.text }]}>Zuletzt aktive Nutzer</Text>
      <RecentActivityList entries={data?.recentActivity || []} isDark={isDark} limit={5} />
    </View>
  );
}

const styles = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  kpiCard: { flexBasis: '31%', borderRadius: 12, borderWidth: 1, padding: 10 },
  kpiLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontSize: 17, fontWeight: '800' },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
});
```

This removes the DAU `LineChart` and the "Meistgenutzte Features" list from `OverviewTab.js` (moved to `ActivityTab.js` in Task 12) and adds the compact `RecentActivityList` after the KPI grid, matching the design spec.

- [ ] **Step 3: Manual verification**

This can't run standalone yet (`AdminAnalyticsScreen.js` from Task 10 already references `ActivityTab`/`DownloadsTab`, which don't exist until Tasks 12-13). Proceed to Task 12.

- [ ] **Step 4: Commit**

```bash
cd EarnTrack-Android
git add screens/adminAnalytics/RecentActivityList.js screens/adminAnalytics/OverviewTab.js
git commit -m "feat: add compact recent-activity list to mobile overview tab"
```

---

## Task 12: Mobile — new `ActivityTab.js`

**Files:**
- Modify: `EarnTrack-Android/screens/adminAnalytics/MetricsTabs.js` (export shared helpers)
- Create: `EarnTrack-Android/screens/adminAnalytics/ActivityTab.js`

**Interfaces:**
- Consumes: `RecentActivityList` from Task 11; `themeColors`, `lineChartConfig`, `RankedList` exported from `MetricsTabs.js` in this task's Step 1.
- Produces: `<ActivityTab data isDark />`, rendered by `AdminAnalyticsScreen.js` (already wired in Task 10).

- [ ] **Step 1: Export the shared helpers from `MetricsTabs.js`**

Find:

```javascript
function themeColors(isDark) {
```

Replace with:

```javascript
export function themeColors(isDark) {
```

Find:

```javascript
function lineChartConfig(isDark, colorRgb) {
```

Replace with:

```javascript
export function lineChartConfig(isDark, colorRgb) {
```

Find:

```javascript
function Kpi({ c, label, value, accent }) {
```

Replace with:

```javascript
export function Kpi({ c, label, value, accent }) {
```

Find:

```javascript
function RankedList({ c, title, items, formatValue }) {
```

Replace with:

```javascript
export function RankedList({ c, title, items, formatValue }) {
```

- [ ] **Step 2: Create `ActivityTab.js`**

Create `EarnTrack-Android/screens/adminAnalytics/ActivityTab.js`:

```javascript
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { themeColors, lineChartConfig, RankedList } from './MetricsTabs';
import RecentActivityList from './RecentActivityList';

const screenWidth = Dimensions.get('window').width - 40;

export default function ActivityTab({ data, isDark = false }) {
  const c = themeColors(isDark);
  const dau = data?.dauData || [];
  const features = (data?.featureData || []).slice(0, 8);
  const platform = data?.platformBreakdown || { web: 0, ios: 0, android: 0 };
  const platformItems = [
    { label: 'Web', value: platform.web },
    { label: 'iOS', value: platform.ios },
    { label: 'Android', value: platform.android },
  ];
  const dauLabels = dau.map((d, i) => (i % 5 === 0 ? d.label : ''));

  return (
    <View>
      {dau.length > 0 && (
        <View style={[styles.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.chartTitle, { color: c.text }]}>Täglich aktive User (DAU)</Text>
          <LineChart
            data={{ labels: dauLabels, datasets: [{ data: dau.map(d => d.users) }] }}
            width={screenWidth}
            height={180}
            withDots={false}
            withInnerLines={false}
            chartConfig={lineChartConfig(isDark, '13, 148, 136')}
            bezier
            style={{ marginLeft: -16, borderRadius: 12 }}
          />
        </View>
      )}

      <RankedList c={c} title="Meistgenutzte Features" items={features.map(f => ({ label: f.name, value: f.value }))} />
      <RankedList c={c} title="Plattformen" items={platformItems} />

      <Text style={[styles.sectionTitle, { color: c.text }]}>Zuletzt aktiv</Text>
      <RecentActivityList entries={data?.recentActivity || []} isDark={isDark} searchable />
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, overflow: 'hidden' },
  chartTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 4 },
});
```

- [ ] **Step 3: Commit**

```bash
cd EarnTrack-Android
git add screens/adminAnalytics/MetricsTabs.js screens/adminAnalytics/ActivityTab.js
git commit -m "feat: add mobile Aktivität tab with DAU, feature and platform breakdown"
```

---

## Task 13: Mobile — new `DownloadsTab.js`

**Files:**
- Create: `EarnTrack-Android/screens/adminAnalytics/DownloadsTab.js`

**Interfaces:**
- Consumes: `themeColors`, `lineChartConfig`, `Kpi` exported from `MetricsTabs.js` (Task 12); `data.kpis.downloads` from Task 3 (API response, same shape as web's `DownloadsSummary`).
- Produces: `<DownloadsTab data isDark />`, rendered by `AdminAnalyticsScreen.js` (already wired in Task 10). This is the last task — completing it makes Tasks 10-13 buildable together.

- [ ] **Step 1: Create the component**

Create `EarnTrack-Android/screens/adminAnalytics/DownloadsTab.js`:

```javascript
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { themeColors, lineChartConfig, Kpi } from './MetricsTabs';

const screenWidth = Dimensions.get('window').width - 40;

export default function DownloadsTab({ data, isDark = false }) {
  const c = themeColors(isDark);
  const downloads = data?.kpis?.downloads;

  if (!downloads?.configured) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.emptyTitle, { color: c.text }]}>Downloads noch nicht verbunden</Text>
        <Text style={[styles.emptyText, { color: c.muted }]}>
          Es fehlen noch die Zugangsdaten für App Store Connect und die Google Play Console.
          Richte sie in der Web-Version unter Analytics → Downloads ein.
        </Text>
      </View>
    );
  }

  const chartData = downloads.chartData || [];
  const labels = chartData.map((d, i) => (i % 5 === 0 ? d.date.slice(5) : ''));
  const deltaLabel = downloads.deltaPct === null ? 'neu' : `${downloads.deltaPct > 0 ? '+' : ''}${downloads.deltaPct}%`;

  return (
    <View>
      <View style={styles.kpiGrid}>
        <Kpi c={c} label="Downloads gesamt" value={String(downloads.totalCurrent)} accent="#0D9488" />
        <Kpi c={c} label="iOS" value={String(downloads.ios)} />
        <Kpi c={c} label="Android" value={String(downloads.android)} />
        <Kpi c={c} label="Ggü. Vorperiode" value={deltaLabel} />
      </View>

      {chartData.length > 0 && (
        <View style={[styles.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.chartTitle, { color: c.text }]}>Downloads pro Tag (iOS)</Text>
          <LineChart
            data={{ labels, datasets: [{ data: chartData.map(d => d.ios) }] }}
            width={screenWidth}
            height={180}
            withDots={false}
            withInnerLines={false}
            chartConfig={lineChartConfig(isDark, '13, 148, 136')}
            bezier
            style={{ marginLeft: -16, borderRadius: 12 }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, overflow: 'hidden' },
  chartTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
```

Note: mobile always requests `timeRange: 90` (hardcoded in `AdminAnalyticsScreen.js`'s `load()`) and never sends `downloadsTimeRange`, so the API defaults `downloadsTimeRange` to `90` for mobile — there is intentionally no independent Downloads period filter on mobile (small-screen simplification; the web tab has the full filter from Task 9).

- [ ] **Step 2: Verify the whole mobile change set builds**

Run: `cd EarnTrack-Android && npx tsc --noEmit --pretty false 2>&1 | head -50` if the project has a `tsconfig.json` for type-checking JS (check with `cat tsconfig.json` first — if it doesn't exist or doesn't include `screens/adminAnalytics`, skip this and rely on Step 3 instead).

- [ ] **Step 3: Manual verification (simulator/device)**

Start the app (`cd EarnTrack-Android && npx expo start`), sign in as the admin account, open Analytics from the admin menu. Confirm:
- The tab bar now shows 6 tabs and scrolls horizontally without clipping.
- Übersicht shows the "Zuletzt aktive Nutzer" list under the KPI grid (or the "Noch keine Aktivität erfasst" empty state if `activity_events` has nothing yet).
- Aktivität shows the DAU chart, feature ranking, platform ranking, and a searchable activity list.
- Downloads shows the "noch nicht verbunden" empty state (since `store_downloads` is empty).
- Nutzer, Website, Umsatz tabs still work exactly as before.

- [ ] **Step 4: Commit**

```bash
cd EarnTrack-Android
git add screens/adminAnalytics/DownloadsTab.js
git commit -m "feat: add mobile Downloads tab"
```

---

## Explicitly Out of Scope (per design spec)

- The real App Store Connect / Google Play Developer API calls inside `syncStoreDownloads` (Task 4 only scaffolds the schedule + config-check + write path). This is a separate follow-up once the user has created the API Key and Service Account described in the Downloads tab's empty state.
