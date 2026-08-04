// Unit-Tests für die ZUGFeRD/Factur-X-XML-Generierung (src/lib/zugferd.ts).
// Alle drei Fälle wurden gegen den offiziellen ZUGFeRD-Referenzvalidator (Mustang-CLI, das im
// ZUGFeRD-Konsortium selbst verwendete Tool) geprüft: PDF/A-3 + XML-Schema + Schematron
// (EN16931) — vorher "invalid", jetzt "valid" für Standard-, Kleinunternehmer- und Minimalfall.
//
// Ausführen: node --experimental-strip-types --import ./tests/ts-resolve-loader.mjs --test tests/zugferd.test.mjs

import assert from 'node:assert';
import { test } from 'node:test';
import { generateZugferdXML } from '../src/lib/zugferd.ts';

const baseParams = {
  invoiceNumber: 'RE-2026-0001',
  invoiceDate: '2026-08-04',
  seller: { name: 'Testfirma GmbH', street: 'Musterstr. 1', zip: '12345', city: 'Berlin', taxId: 'DE123456789' },
  buyer: { name: 'Kunde XY' },
  lineItems: [{ id: '1', description: 'Beratung', quantity: 1, unitCode: 'C62', unitPrice: 100, netAmount: 100, taxPercent: 19 }],
  netTotal: 100, taxTotal: 19, grossTotal: 119, taxRate: 19,
};

test('Kein BIC-Element mehr im BASIC-Profil (CreditorFinancialAccountType kennt nur IBAN/ProprietaryID)', () => {
  const xml = generateZugferdXML({ ...baseParams, bankDetails: { iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' } });
  assert.ok(!xml.includes('SpecifiedCreditorFinancialInstitution'), 'BIC-Element existiert im BASIC-Profil-Schema nicht und macht die XML schema-ungültig');
  assert.ok(xml.includes('DE89370400440532013000'), 'IBAN muss weiterhin enthalten sein');
});

test('ApplicableTradeTax hält die vom Schema vorgeschriebene Feldreihenfolge ein (BasisAmount vor CategoryCode vor RateApplicablePercent)', () => {
  const xml = generateZugferdXML(baseParams);
  const headerTaxBlock = xml.slice(xml.indexOf('<ram:ApplicableTradeTax>', xml.indexOf('ApplicableHeaderTradeSettlement')));
  const basisIdx = headerTaxBlock.indexOf('BasisAmount');
  const categoryIdx = headerTaxBlock.indexOf('CategoryCode');
  const rateIdx = headerTaxBlock.indexOf('RateApplicablePercent');
  assert.ok(basisIdx > 0 && categoryIdx > basisIdx && rateIdx > categoryIdx,
    `Reihenfolge muss BasisAmount(${basisIdx}) < CategoryCode(${categoryIdx}) < RateApplicablePercent(${rateIdx}) sein`);
});

test('BR-CO-26: Verkäufer-ram:ID wird gesetzt, auch wenn nur eine Steuernummer (kein USt-IdNr.) vorliegt', () => {
  // "12/345/67890" ist eine deutsche Steuernummer (kein Ländercode-Präfix) — der Normalfall bei
  // vielen Kleinunternehmern ohne USt-IdNr. Ohne ram:ID/GlobalID/SpecifiedLegalOrganization/ram:ID
  // oder schemeID="VA" kann der Käufer den Verkäufer laut EN16931 nicht automatisiert identifizieren.
  const xml = generateZugferdXML({ ...baseParams, seller: { ...baseParams.seller, taxId: '12/345/67890' } });
  const sellerBlock = xml.slice(xml.indexOf('<ram:SellerTradeParty>'), xml.indexOf('</ram:SellerTradeParty>'));
  assert.ok(/<ram:ID>12\/345\/67890<\/ram:ID>/.test(sellerBlock), 'ram:ID muss die Steuernummer enthalten, damit BR-CO-26 erfüllt ist');
  assert.ok(sellerBlock.indexOf('<ram:ID>') < sellerBlock.indexOf('<ram:Name>'), 'ram:ID muss laut Schema vor ram:Name stehen');
});

test('Seller-ID (BR-CO-26) auch bei echter USt-IdNr. gesetzt — schadet nicht, zusätzliche VA-Registrierung bleibt bestehen', () => {
  const xml = generateZugferdXML(baseParams); // taxId = 'DE123456789'
  const sellerBlock = xml.slice(xml.indexOf('<ram:SellerTradeParty>'), xml.indexOf('</ram:SellerTradeParty>'));
  assert.ok(/<ram:ID>DE123456789<\/ram:ID>/.test(sellerBlock));
  assert.ok(sellerBlock.includes('schemeID="VA"'), 'USt-IdNr. bleibt zusätzlich als SpecifiedTaxRegistration erhalten');
});
