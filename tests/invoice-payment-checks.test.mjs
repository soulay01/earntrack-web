// Unit-Tests für die Zahlungsstatus-Check-Funktionen (gemockter fetch, keine echten API-Calls).
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/invoice-payment-checks.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { checkLexofficeInvoicePaid } from '../src/lib/lexoffice.ts';
import { checkSevdeskInvoicePaid } from '../src/lib/sevdesk.ts';

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
