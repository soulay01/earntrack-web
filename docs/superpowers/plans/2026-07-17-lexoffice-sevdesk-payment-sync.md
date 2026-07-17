# Lexoffice/sevDesk Zahlungsstatus-Rücksync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wenn eine bereits zu Lexoffice/sevDesk gepushte Rechnung dort als bezahlt markiert wird, setzt EarnTrack automatisch `invoiceStatus: 'bezahlt'` auf dem zugehörigen `assignment`-Dokument, ohne manuellen Eingriff.

**Architecture:** Ein Vercel Cron Job ruft stündlich eine neue Next.js API-Route auf, die alle offenen Rechnungen mit gespeicherter `externalId` durchgeht, den Zahlungsstatus beim jeweiligen Anbieter abfragt und bei erkannter Zahlung `invoiceStatus` per Admin SDK aktualisiert. Kein Webhook, kein neuer Firestore-Rules-Bezug.

**Tech Stack:** Next.js API Route (App Router), Firebase Admin SDK (`firebase-admin/firestore`), Vercel Cron Jobs, Node.js `node:test` + `--experimental-strip-types` für Tests (keine neue Test-Dependency).

## Global Constraints

- Scope ist ausschließlich Zahlungsstatus — kein Rücksync von Versand-/Finalisierungsstatus, keine Inhaltssync (Beträge/Positionen bleiben EarnTrack-seitig Source of Truth).
- Einheitliches Polling für beide Anbieter (kein Webhook für Lexoffice), stündlich (`schedule: "0 * * * *"`).
- Kein manueller "Jetzt aktualisieren"-Button, keine UI für Sync-Fehler — beides explizit außerhalb des Scopes.
- Vercel Cron Job + Next.js API-Route, **nicht** Firebase Cloud Function (Korrektur der ursprünglichen Spec — siehe `docs/superpowers/specs/2026-07-17-lexoffice-sevdesk-payment-sync-design.md`).
- Keine neue Test-Dependency (kein Jest/Vitest) — Tests folgen dem bestehenden Muster aus `tests/firestore-rules.test.mjs` (`node:test`, plain `.mjs`), TypeScript-Imports über Node's `--experimental-strip-types`.
- **Wichtig:** Node's ESM-Resolver verlangt bei `--experimental-strip-types` explizite Dateiendungen für relative Imports. `src/lib/lexoffice.ts` und `src/lib/sevdesk.ts` importieren `./calculations` bereits ohne Endung (bestehender Code, Next.js/webpack löst das problemlos auf) — das darf **nicht** angepasst werden, das würde `tsc`/`next build` brechen (`TS5097`). Stattdessen registriert ein kleiner Resolver-Hook (`tests/ts-resolve-loader.mjs` + `tests/ts-resolve-hook.mjs`, Task 1 Step 0) bei fehlgeschlagener Auflösung automatisch `.ts` nach — Node's offizielle `module.register()`-Loader-API, keine neue Dependency. Alle Testläufe in diesem Plan nutzen `--import ./tests/ts-resolve-loader.mjs`.
- API-Keys werden ausschließlich aus `companies/{companyId}/private/integrations` gelesen (Felder `lexofficeApiKey`, `sevdeskApiKey`) — exakt die Stelle, die `src/app/api/integrations/{lexoffice,sevdesk}/route.ts` bereits nutzen.

---

## File Structure Overview

| Datei | Aktion | Zweck |
|---|---|---|
| `src/lib/lexoffice.ts` | Modify | `checkLexofficeInvoicePaid` ergänzen |
| `src/lib/sevdesk.ts` | Modify | `checkSevdeskInvoicePaid` ergänzen |
| `src/lib/invoicePaymentSync.ts` | Create | Kern-Sync-Loop, DI-fähig für Tests |
| `src/app/api/cron/sync-invoice-payments/route.ts` | Create | Cron-Endpoint, verifiziert `CRON_SECRET` |
| `vercel.json` | Modify | Cron-Konfiguration |
| `.env.example`, `.env.local` | Modify | `CRON_SECRET` |
| `tests/ts-resolve-loader.mjs`, `tests/ts-resolve-hook.mjs` | Create | Node-Resolver-Hook (löst `.ts`-Endung für relative Imports auf, siehe Global Constraints) |
| `tests/invoice-payment-checks.test.mjs` | Create | Unit-Tests (gemockter `fetch`) |
| `tests/invoice-payment-sync.test.mjs` | Create | Integrationstest gegen Firestore-Emulator |
| `package.json` | Modify | `test:sync`, `test:sync-integration` Scripts |

---

### Task 1: Lexoffice-Zahlungsstatus-Check

**Files:**
- Create: `tests/ts-resolve-loader.mjs`, `tests/ts-resolve-hook.mjs`
- Modify: `src/lib/lexoffice.ts`
- Create: `tests/invoice-payment-checks.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `checkLexofficeInvoicePaid(externalId: string, apiKey: string): Promise<{ ok: boolean; paid: boolean; error?: string }>` in `src/lib/lexoffice.ts` — wird von Task 3 (`invoicePaymentSync.ts`) konsumiert.
- Produces: den Resolver-Hook `tests/ts-resolve-loader.mjs` / `tests/ts-resolve-hook.mjs` — wird von Task 2 und Task 3 in ihren Testläufen wiederverwendet (nicht erneut anlegen).

- [ ] **Step 0: Resolver-Hook anlegen**

Node's `--experimental-strip-types` verlangt bei relativen Imports ohne Dateiendung (z. B. `./calculations` in `src/lib/lexoffice.ts`) eine explizite Endung, sonst schlägt die Auflösung fehl (`ERR_MODULE_NOT_FOUND`). Der bestehende Quellcode darf dafür **nicht** angepasst werden (bricht `tsc`/`next build`). Stattdessen registriert dieser Hook automatisch `.ts` nach, wenn die ursprüngliche Auflösung fehlschlägt — Node's offizielle `module.register()`-Loader-API (stabil seit Node 20.6), keine neue Dependency.

Erstelle `tests/ts-resolve-hook.mjs`:

```mjs
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
```

Erstelle `tests/ts-resolve-loader.mjs`:

```mjs
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
```

- [ ] **Step 1: Test-Datei mit Lexoffice-Tests anlegen (RED)**

Erstelle `tests/invoice-payment-checks.test.mjs`:

```mjs
// Unit-Tests für die Zahlungsstatus-Check-Funktionen (gemockter fetch, keine echten API-Calls).
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { checkLexofficeInvoicePaid } from '../src/lib/lexoffice.ts';

test('checkLexofficeInvoicePaid: voucherStatus paidoff -> paid true', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ voucherStatus: 'paidoff' }) });
  const result = await checkLexofficeInvoicePaid('lex-123', 'key');
  assert.deepStrictEqual(result, { ok: true, paid: true });
});

test('checkLexofficeInvoicePaid: voucherStatus open -> paid false', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ voucherStatus: 'open' }) });
  const result = await checkLexofficeInvoicePaid('lex-123', 'key');
  assert.deepStrictEqual(result, { ok: true, paid: false });
});

test('checkLexofficeInvoicePaid: HTTP-Fehler -> ok false', async () => {
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not found' }) });
  const result = await checkLexofficeInvoicePaid('lex-123', 'key');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.paid, false);
  assert.strictEqual(result.error, 'Not found');
});

test('checkLexofficeInvoicePaid: Netzwerkfehler -> ok false, kein Throw', async () => {
  global.fetch = async () => { throw new Error('network down'); };
  const result = await checkLexofficeInvoicePaid('lex-123', 'key');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'network down');
});
```

- [ ] **Step 2: Test ausführen, muss fehlschlagen**

Run: `node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs`
Expected: FAIL — `checkLexofficeInvoicePaid` ist kein Export von `src/lib/lexoffice.ts` (Import-Fehler, alle 4 Tests schlagen fehl).

*(Hinweis: Node gibt zusätzlich eine harmlose `MODULE_TYPELESS_PACKAGE_JSON`-Warnung aus, da `package.json` kein `"type": "module"` setzt — das betrifft nur die Warnung, nicht das Testergebnis.)*

- [ ] **Step 3: `checkLexofficeInvoicePaid` implementieren (GREEN)**

Ergänze am Ende von `src/lib/lexoffice.ts`:

```ts
export async function checkLexofficeInvoicePaid(
  externalId: string,
  apiKey: string,
): Promise<{ ok: boolean; paid: boolean; error?: string }> {
  try {
    const res = await fetch(`${LEXOFFICE_BASE}/invoices/${externalId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, paid: false, error: data.message || `HTTP ${res.status}` };
    return { ok: true, paid: data.voucherStatus === 'paidoff' };
  } catch (e: any) {
    return { ok: false, paid: false, error: e.message };
  }
}
```

- [ ] **Step 4: Test ausführen, muss bestehen**

Run: `node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs`
Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 5: npm-Script ergänzen**

In `package.json` unter `"scripts"`, nach `"test:rules"`:

```json
"test:sync": "node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add tests/ts-resolve-loader.mjs tests/ts-resolve-hook.mjs src/lib/lexoffice.ts tests/invoice-payment-checks.test.mjs package.json
git commit -m "feat: add Lexoffice payment status check"
```

---

### Task 2: sevDesk-Zahlungsstatus-Check

**Files:**
- Modify: `src/lib/sevdesk.ts`
- Modify: `tests/invoice-payment-checks.test.mjs`

**Interfaces:**
- Consumes: nichts von Task 1 (unabhängige Funktion, gleiche Testdatei wird erweitert).
- Produces: `checkSevdeskInvoicePaid(externalId: string, apiKey: string): Promise<{ ok: boolean; paid: boolean; error?: string }>` in `src/lib/sevdesk.ts` — wird von Task 3 (`invoicePaymentSync.ts`) konsumiert.

- [ ] **Step 1: sevDesk-Tests an bestehende Testdatei anhängen (RED)**

Füge am Ende von `tests/invoice-payment-checks.test.mjs` hinzu (Import-Zeile ergänzen, Tests anhängen):

```mjs
import { checkSevdeskInvoicePaid } from '../src/lib/sevdesk.ts';

test('checkSevdeskInvoicePaid: status 1000 -> paid true', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ objects: [{ status: '1000' }] }) });
  const result = await checkSevdeskInvoicePaid('sev-123', 'key');
  assert.deepStrictEqual(result, { ok: true, paid: true });
});

test('checkSevdeskInvoicePaid: status 200 (offen) -> paid false', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ objects: [{ status: '200' }] }) });
  const result = await checkSevdeskInvoicePaid('sev-123', 'key');
  assert.deepStrictEqual(result, { ok: true, paid: false });
});

test('checkSevdeskInvoicePaid: Rechnung nicht gefunden -> ok false', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ objects: [] }) });
  const result = await checkSevdeskInvoicePaid('sev-123', 'key');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'Rechnung nicht gefunden');
});

test('checkSevdeskInvoicePaid: HTTP-Fehler -> ok false', async () => {
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Ungültiger Token' }) });
  const result = await checkSevdeskInvoicePaid('sev-123', 'key');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'Ungültiger Token');
});
```

Die neue `import`-Zeile gehört zu den bestehenden Imports oben in der Datei (nicht mitten im Code).

- [ ] **Step 2: Test ausführen, muss fehlschlagen**

Run: `node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs`
Expected: FAIL — die 4 neuen sevDesk-Tests schlagen fehl (Import-Fehler), die 4 Lexoffice-Tests aus Task 1 bestehen weiterhin: `# pass 4`, `# fail 4`.

- [ ] **Step 3: `checkSevdeskInvoicePaid` implementieren (GREEN)**

Ergänze am Ende von `src/lib/sevdesk.ts`:

```ts
export async function checkSevdeskInvoicePaid(
  externalId: string,
  apiKey: string,
): Promise<{ ok: boolean; paid: boolean; error?: string }> {
  try {
    const res = await fetch(`${SEVDESK_BASE}/Invoice/${externalId}`, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, paid: false, error: data?.message || `HTTP ${res.status}` };
    const invoice = data?.objects?.[0];
    if (!invoice) return { ok: false, paid: false, error: 'Rechnung nicht gefunden' };
    return { ok: true, paid: String(invoice.status) === '1000' };
  } catch (e: any) {
    return { ok: false, paid: false, error: e.message };
  }
}
```

- [ ] **Step 4: Test ausführen, muss bestehen**

Run: `node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs`
Expected: PASS — `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sevdesk.ts tests/invoice-payment-checks.test.mjs
git commit -m "feat: add sevDesk payment status check"
```

---

### Task 3: Kern-Sync-Loop (`invoicePaymentSync.ts`)

**Files:**
- Create: `src/lib/invoicePaymentSync.ts`
- Create: `tests/invoice-payment-sync.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `checkLexofficeInvoicePaid` (Task 1), `checkSevdeskInvoicePaid` (Task 2) — exakte Signaturen wie oben.
- Produces: `runInvoicePaymentSync(db: Firestore, checkFns?: { checkLexofficeInvoicePaid: typeof checkLexofficeInvoicePaid; checkSevdeskInvoicePaid: typeof checkSevdeskInvoicePaid }): Promise<{ checked: number; updated: number; errors: number }>` — wird von Task 4 (API-Route) konsumiert.

- [ ] **Step 1: Integrationstest gegen Firestore-Emulator anlegen (RED)**

Erstelle `tests/invoice-payment-sync.test.mjs`:

```mjs
// Integrationstest für den Sync-Loop gegen den Firestore-Emulator.
// Anbieter-API-Calls werden per Dependency-Injection gemockt (kein echter HTTP-Call).
// Ausführen: firebase emulators:exec --only firestore "node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-sync.test.mjs"

import assert from 'node:assert';
import { test, beforeEach } from 'node:test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runInvoicePaymentSync } from '../src/lib/invoicePaymentSync.ts';

initializeApp({ projectId: 'demo-earntrack-sync-test' });
const db = getFirestore();

// Isoliert jeden Test: löscht Dokumente aus vorherigen Tests, damit
// runInvoicePaymentSync() nicht versehentlich Assignments aus früheren
// Testfällen mitverarbeitet (gemeinsamer Emulator-Zustand pro Testdatei).
beforeEach(async () => {
  const assignmentRefs = await db.collection('assignments').listDocuments();
  await Promise.all(assignmentRefs.map((ref) => ref.delete()));
  const companyRefs = await db.collection('companies').listDocuments();
  await Promise.all(companyRefs.map((ref) => db.recursiveDelete(ref)));
});

test('markiert Rechnung als bezahlt, wenn Lexoffice paid meldet', async () => {
  await db.collection('companies').doc('c1').collection('private').doc('integrations')
    .set({ lexofficeApiKey: 'key-1' });
  await db.collection('assignments').doc('a1').set({
    companyId: 'c1',
    invoiceStatus: 'gesendet',
    integrationSyncs: { lexoffice: { externalId: 'lex-1', syncedAt: new Date().toISOString() } },
  });

  const result = await runInvoicePaymentSync(db, {
    checkLexofficeInvoicePaid: async () => ({ ok: true, paid: true }),
    checkSevdeskInvoicePaid: async () => ({ ok: true, paid: false }),
  });

  assert.strictEqual(result.updated, 1);
  const after = await db.collection('assignments').doc('a1').get();
  assert.strictEqual(after.data().invoiceStatus, 'bezahlt');
});

test('lässt Rechnung unangetastet, wenn Anbieter noch nicht bezahlt meldet', async () => {
  await db.collection('companies').doc('c2').collection('private').doc('integrations')
    .set({ sevdeskApiKey: 'key-2' });
  await db.collection('assignments').doc('a2').set({
    companyId: 'c2',
    invoiceStatus: 'offen',
    integrationSyncs: { sevdesk: { externalId: 'sev-1', syncedAt: new Date().toISOString() } },
  });

  const result = await runInvoicePaymentSync(db, {
    checkLexofficeInvoicePaid: async () => ({ ok: true, paid: false }),
    checkSevdeskInvoicePaid: async () => ({ ok: true, paid: false }),
  });

  assert.strictEqual(result.updated, 0);
  const after = await db.collection('assignments').doc('a2').get();
  assert.strictEqual(after.data().invoiceStatus, 'offen');
});

test('überspringt Rechnungen ohne verknüpfte externalId', async () => {
  await db.collection('assignments').doc('a3').set({ companyId: 'c3', invoiceStatus: 'mahnung_1' });

  const result = await runInvoicePaymentSync(db, {
    checkLexofficeInvoicePaid: async () => { throw new Error('sollte nicht aufgerufen werden'); },
    checkSevdeskInvoicePaid: async () => { throw new Error('sollte nicht aufgerufen werden'); },
  });

  assert.strictEqual(result.checked, 0);
});

test('zählt Anbieter-Fehler statt zu werfen', async () => {
  await db.collection('companies').doc('c4').collection('private').doc('integrations')
    .set({ lexofficeApiKey: 'key-4' });
  await db.collection('assignments').doc('a4').set({
    companyId: 'c4',
    invoiceStatus: 'mahnung_2',
    integrationSyncs: { lexoffice: { externalId: 'lex-4', syncedAt: new Date().toISOString() } },
  });

  const result = await runInvoicePaymentSync(db, {
    checkLexofficeInvoicePaid: async () => ({ ok: false, paid: false, error: 'HTTP 500' }),
    checkSevdeskInvoicePaid: async () => ({ ok: true, paid: false }),
  });

  assert.strictEqual(result.errors, 1);
  assert.strictEqual(result.updated, 0);
});

test('zählt Firestore-Schreibfehler statt zu werfen', async () => {
  // Richte Assignment und Anbieter auf — der Mock löscht das Dokument vor dem Update,
  // was einen echten Firestore-Schreibfehler (NOT_FOUND) auslöst.
  await db.collection('companies').doc('c5').collection('private').doc('integrations')
    .set({ lexofficeApiKey: 'key-5' });
  await db.collection('assignments').doc('a5').set({
    companyId: 'c5',
    invoiceStatus: 'gesendet',
    integrationSyncs: { lexoffice: { externalId: 'lex-5', syncedAt: new Date().toISOString() } },
  });

  const result = await runInvoicePaymentSync(db, {
    checkLexofficeInvoicePaid: async () => {
      // Lösche das Assignment, bevor der Sync-Loop es aktualisieren kann.
      // Das führt zu einem echten Firestore-Fehler (NOT_FOUND) beim Update.
      await db.collection('assignments').doc('a5').delete();
      return { ok: true, paid: true };
    },
    checkSevdeskInvoicePaid: async () => ({ ok: true, paid: false }),
  });

  // Der Fehler sollte gezählt werden, aber updated nicht inkrementiert.
  assert.strictEqual(result.errors, 1);
  assert.strictEqual(result.updated, 0);
});
```

- [ ] **Step 2: Test ausführen, muss fehlschlagen**

Run: `firebase emulators:exec --only firestore "node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-sync.test.mjs"`
Expected: FAIL — `src/lib/invoicePaymentSync.ts` existiert noch nicht (Import-Fehler, alle 5 Tests schlagen fehl).

- [ ] **Step 3: `invoicePaymentSync.ts` implementieren (GREEN)**

Erstelle `src/lib/invoicePaymentSync.ts`:

```ts
import { FieldPath, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { checkLexofficeInvoicePaid } from './lexoffice';
import { checkSevdeskInvoicePaid } from './sevdesk';

const OPEN_STATUSES = ['offen', 'gesendet', 'mahnung_1', 'mahnung_2'];
const PAGE_SIZE = 100;

type CheckFns = {
  checkLexofficeInvoicePaid: typeof checkLexofficeInvoicePaid;
  checkSevdeskInvoicePaid: typeof checkSevdeskInvoicePaid;
};

export interface SyncResult {
  checked: number;
  updated: number;
  errors: number;
}

export async function runInvoicePaymentSync(
  db: Firestore,
  checkFns: CheckFns = { checkLexofficeInvoicePaid, checkSevdeskInvoicePaid },
): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, errors: 0 };
  const apiKeyCache = new Map<string, { lexofficeApiKey?: string; sevdeskApiKey?: string }>();

  async function getApiKeys(companyId: string) {
    if (apiKeyCache.has(companyId)) return apiKeyCache.get(companyId)!;
    const snap = await db.collection('companies').doc(companyId).collection('private').doc('integrations').get();
    const keys = { lexofficeApiKey: snap.data()?.lexofficeApiKey, sevdeskApiKey: snap.data()?.sevdeskApiKey };
    apiKeyCache.set(companyId, keys);
    return keys;
  }

  let lastDoc: DocumentSnapshot | null = null;

  while (true) {
    let query = db.collection('assignments')
      .where('invoiceStatus', 'in', OPEN_STATUSES)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const companyId = data.companyId as string | undefined;
      const lexId = data.integrationSyncs?.lexoffice?.externalId as string | undefined;
      const sevId = data.integrationSyncs?.sevdesk?.externalId as string | undefined;
      if (!companyId || (!lexId && !sevId)) continue;

      const keys = await getApiKeys(companyId);
      let paidHandled = false;

      if (lexId && keys.lexofficeApiKey) {
        result.checked++;
        const check = await checkFns.checkLexofficeInvoicePaid(lexId, keys.lexofficeApiKey);
        if (!check.ok) result.errors++;
        else if (check.paid) {
          try {
            await doc.ref.update({ invoiceStatus: 'bezahlt' });
            result.updated++;
            paidHandled = true;
          } catch {
            result.errors++;
          }
        }
      }

      if (!paidHandled && sevId && keys.sevdeskApiKey) {
        result.checked++;
        const check = await checkFns.checkSevdeskInvoicePaid(sevId, keys.sevdeskApiKey);
        if (!check.ok) result.errors++;
        else if (check.paid) {
          try {
            await doc.ref.update({ invoiceStatus: 'bezahlt' });
            result.updated++;
          } catch {
            result.errors++;
          }
        }
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return result;
}
```

- [ ] **Step 4: Test ausführen, muss bestehen**

Run: `firebase emulators:exec --only firestore "node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-sync.test.mjs"`
Expected: PASS — `# pass 5`, `# fail 0`.

- [ ] **Step 5: npm-Script ergänzen**

In `package.json` unter `"scripts"`, nach `"test:sync"`:

```json
"test:sync-integration": "firebase emulators:exec --only firestore \"node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-sync.test.mjs\"",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoicePaymentSync.ts tests/invoice-payment-sync.test.mjs package.json
git commit -m "feat: add invoice payment sync loop"
```

---

### Task 4: Cron-API-Route + lokaler Smoke-Test

**Files:**
- Create: `src/app/api/cron/sync-invoice-payments/route.ts`
- Modify: `.env.example`
- Modify: `.env.local` (nicht versioniert — lokaler Wert)

**Interfaces:**
- Consumes: `runInvoicePaymentSync` (Task 3), `admin.db` aus `src/lib/firebase-admin.ts` (bestehend, `Firestore`-Instanz per Getter).
- Produces: `GET /api/cron/sync-invoice-payments` — HTTP-Endpoint, konsumiert von Vercel Cron (Task 5).

- [ ] **Step 1: `CRON_SECRET` zu `.env.example` hinzufügen**

Ergänze am Ende von `.env.example`:

```
# Cron-Job-Auth (Vercel sendet dies automatisch als Authorization-Header — per `openssl rand -hex 32` generieren)
CRON_SECRET=
```

- [ ] **Step 2: Lokalen Secret-Wert generieren und in `.env.local` eintragen**

Run: `openssl rand -hex 32`
Expected: eine 64-stellige Hex-Zeichenkette (z. B. `a1b2c3...`).

Trage die Ausgabe in `.env.local` ein:

```
CRON_SECRET=<generierter-wert>
```

- [ ] **Step 3: Route implementieren**

Erstelle `src/app/api/cron/sync-invoice-payments/route.ts`:

```ts
import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';
import { runInvoicePaymentSync } from '@/lib/invoicePaymentSync';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runInvoicePaymentSync(admin.db);
    console.log('[sync-invoice-payments]', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[sync-invoice-payments] failed:', e);
    return NextResponse.json({ ok: false, error: e.message || 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Lokal im Produktions-Modus bauen und starten**

Run: `npm run build && npm run start`
Expected: Build erfolgreich, Server läuft auf `http://localhost:3000`.

- [ ] **Step 5: Negativtest — falscher/fehlender Secret**

In einem zweiten Terminal:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/sync-invoice-payments`
Expected: `401`

- [ ] **Step 6: Positivtest — korrekter Secret**

Run (Wert aus `.env.local` einsetzen): `curl -s -H "Authorization: Bearer <CRON_SECRET-Wert>" http://localhost:3000/api/cron/sync-invoice-payments`
Expected: JSON-Antwort `{"ok":true,"checked":<n>,"updated":<n>,"errors":<n>}` (Zahlen abhängig vom aktuellen Datenbestand — kein Fehler-Status).

Server danach stoppen (Ctrl+C im ersten Terminal).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/sync-invoice-payments/route.ts .env.example
git commit -m "feat: add cron endpoint for invoice payment sync"
```

*(`.env.local` wird nicht committed — steht in `.gitignore`.)*

---

### Task 5: Vercel-Cron-Konfiguration + Produktions-Deploy

**Files:**
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `GET /api/cron/sync-invoice-payments` (Task 4).
- Produces: nichts (letzter Task).

- [ ] **Step 1: Cron-Eintrag in `vercel.json` ergänzen**

Ersetze den Inhalt von `vercel.json` mit:

```json
{
  "framework": "nextjs",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "analytics.earntrack.de" }],
      "destination": "https://app.earntrack.de/analytics",
      "permanent": false
    }
  ],
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    }
  ],
  "crons": [
    { "path": "/api/cron/sync-invoice-payments", "schedule": "0 * * * *" }
  ]
}
```

- [ ] **Step 2: `CRON_SECRET` in Vercel-Produktionsumgebung hinterlegen**

Run: `vercel env add CRON_SECRET production`
Erwartet: interaktiver Prompt nach dem Wert — den in Task 4 Step 2 generierten Hex-String eingeben (oder einen neuen produktionsspezifischen mit `openssl rand -hex 32` generieren, dann diesen Wert verwenden).

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: configure hourly Vercel cron for invoice payment sync"
```

- [ ] **Step 4: Deployen**

Run: `vercel --prod`
Expected: Deploy erfolgreich, Produktions-URL wird ausgegeben.

- [ ] **Step 5: Produktions-Smoke-Test — Unauthorized-Fall**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://app.earntrack.de/api/cron/sync-invoice-payments`
Expected: `401`

- [ ] **Step 6: Produktions-Smoke-Test — mit korrektem Secret**

Run (Produktions-Secret aus Step 2 einsetzen): `curl -s -H "Authorization: Bearer <CRON_SECRET-Wert>" https://app.earntrack.de/api/cron/sync-invoice-payments`
Expected: `{"ok":true,"checked":<n>,"updated":<n>,"errors":<n>}`

- [ ] **Step 7: Cron-Eintrag in Vercel-Dashboard verifizieren**

Run: `vercel crons ls`
Expected: Eintrag `/api/cron/sync-invoice-payments` mit Schedule `0 * * * *` und Status aktiv.
