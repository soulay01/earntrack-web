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
