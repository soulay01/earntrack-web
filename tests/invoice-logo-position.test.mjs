import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateInvoiceHTML, generateEstimateHTML } from '../src/lib/estimateUtils.ts';

const baseAssignment = { id: 'a', kunde: 'Kunde', umsatz: '100', stunden: '1', stundenlohn: '100' };

test('logo rendered in .inv-logo (rechts) when logoUrl present', () => {
  const html = generateInvoiceHTML(
    baseAssignment,
    { logoUrl: 'data:image/png;base64,AAAA', companyName: 'Firma', templateStyle: 'standard' },
    { customers: [] }
  );
  assert.match(html, /<div class="header-right">/);
  assert.match(html, /<div class="inv-logo"><img[^>]+class="inv-logo-img"/);
  assert.match(html, /class="company-info"/);
  assert.doesNotMatch(html, /<div class="brand-logo">\s*<img/);
});

test('no .inv-logo when logoUrl missing', () => {
  const html = generateInvoiceHTML(
    baseAssignment,
    { companyName: 'Firma', templateStyle: 'standard' },
    { customers: [] }
  );
  assert.doesNotMatch(html, /class="inv-logo"/);
  assert.match(html, /class="company-info"/);
});

test('company-info fully preserved (address + contact)', () => {
  const html = generateInvoiceHTML(
    baseAssignment,
    { logoUrl: 'data:image/png;base64,AAAA', companyName: 'Firma', companyAddress: 'Str 1, 12345 Ort', companyPhone: '0123', templateStyle: 'standard' },
    { customers: [] }
  );
  assert.match(html, /Str 1, 12345 Ort/);
  assert.match(html, /0123/);
});

test('estimate: logo in .inv-logo when logoUrl present', () => {
  const html = generateEstimateHTML(
    { id: 'e', kunde: 'Kunde', umsatz: '100', companyName: 'Firma' },
    { logoUrl: 'data:image/png;base64,AAAA', templateStyle: 'standard' },
    { customers: [] }
  );
  assert.match(html, /<div class="header-right">/);
  assert.match(html, /<div class="inv-logo"><img[^>]+class="inv-logo-img"/);
  assert.match(html, /class="company-info"/);
  assert.doesNotMatch(html, /<div class="brand-logo">\s*<img/);
});
