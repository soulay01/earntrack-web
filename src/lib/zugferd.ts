export interface ZugferdParams {
  invoiceNumber: string;
  invoiceDate: string;
  deliveryDate?: string;
  seller: {
    name: string;
    street: string;
    zip: string;
    city: string;
    taxId: string;
    email?: string;
    phone?: string;
    owner?: string;
  };
  buyer: {
    name: string;
    street?: string;
    zip?: string;
    city?: string;
  };
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitCode: string;
    unitPrice: number;
    netAmount: number;
    taxPercent: number;
  }>;
  netTotal: number;
  taxTotal: number;
  grossTotal: number;
  taxRate: number;
  currency?: string;
  paymentTerms?: string;
  bankDetails?: {
    accountHolder?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
  } | null;
}

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(n: number): string {
  return Number(n).toFixed(2);
}

// CII format="102" requires YYYYMMDD — strip any dashes from YYYY-MM-DD input
function toFmt102(d: string): string {
  return (d || '').replace(/-/g, '');
}

export function generateZugferdXML(p: ZugferdParams): string {
  const c = p.currency || 'EUR';
  const issueDate = toFmt102(p.invoiceDate);
  const deliveryDate = toFmt102(p.deliveryDate || p.invoiceDate);

  // FC = Steuernummer, VA = USt-IdNr. (starts with country code like DE)
  const taxIdScheme = p.seller.taxId?.match(/^[A-Z]{2}/i) ? 'VA' : 'FC';

  const lineItemsXml = (p.lineItems || []).map((item, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${fmt(item.unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${esc(item.unitCode)}">${fmt(item.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${item.taxPercent === 0 ? 'E' : 'S'}</ram:CategoryCode>
          <ram:RateApplicablePercent>${fmt(item.taxPercent)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${fmt(item.netAmount)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('');

  const paymentMeansXml = p.bankDetails?.iban ? `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(p.bankDetails.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        ${p.bankDetails.bic ? `<ram:SpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(p.bankDetails.bic)}</ram:BICID>
        </ram:SpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>` : '';

  const sellerEmailXml = p.seller.email ? `
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${esc(p.seller.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : '';

  const taxRegistrationXml = p.seller.taxId ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="${taxIdScheme}">${esc(p.seller.taxId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : '';

  const buyerAddressXml = `
        <ram:PostalTradeAddress>
          ${p.buyer.zip ? `<ram:PostcodeCode>${esc(p.buyer.zip)}</ram:PostcodeCode>` : ''}
          ${p.buyer.street ? `<ram:LineOne>${esc(p.buyer.street)}</ram:LineOne>` : ''}
          ${p.buyer.city ? `<ram:CityName>${esc(p.buyer.city)}</ram:CityName>` : ''}
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>`;

  const paymentTermsXml = p.paymentTerms ? `
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(p.paymentTerms)}</ram:Description>
      </ram:SpecifiedTradePaymentTerms>` : '';

  const noteXml = p.paymentTerms ? `
    <ram:IncludedNote>
      <ram:Content>${esc(p.paymentTerms)}</ram:Content>
    </ram:IncludedNote>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(p.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>${noteXml}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lineItemsXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.seller.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.seller.street)}</ram:LineOne>
          <ram:CityName>${esc(p.seller.city)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>${sellerEmailXml}${taxRegistrationXml}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.buyer.name)}</ram:Name>${buyerAddressXml}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${deliveryDate}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(p.invoiceNumber)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>${c}</ram:InvoiceCurrencyCode>
      ${paymentMeansXml}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(p.taxTotal)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${p.taxRate === 0 ? '\n        <ram:ExemptionReason>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</ram:ExemptionReason>' : ''}
        <ram:CategoryCode>${p.taxRate === 0 ? 'E' : 'S'}</ram:CategoryCode>
        <ram:BasisAmount>${fmt(p.netTotal)}</ram:BasisAmount>
        <ram:RateApplicablePercent>${fmt(p.taxRate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>${paymentTermsXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt(p.netTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmt(p.netTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${c}">${fmt(p.taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt(p.grossTotal)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmt(p.grossTotal)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

export function generateXRechnungXML(p: ZugferdParams): string {
  return generateZugferdXML(p);
}

export function generateZugferdFilename(invoiceNumber: string): string {
  return `Rechnung_${invoiceNumber}.xml`;
}

// "Musterstr. 1, 12345 Berlin" → Bestandteile für die E-Rechnung (Empfänger-Anschrift, BT-50 ff.)
export function parseCustomerAddress(adresse?: string): { street: string; zip: string; city: string } {
  const parts = String(adresse || '').split(',').map(s => s.trim());
  const street = parts[0] || '';
  const rest = parts.slice(1).join(', ');
  const m = rest.match(/^(\d{4,5})\s+(.*)$/);
  return { street, zip: m ? m[1] : '', city: m ? m[2] : rest };
}
