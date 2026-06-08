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
  };
}

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export function generateZugferdXML(p: ZugferdParams): string {
  const c = p.currency || 'EUR';
  const issueDate = p.invoiceDate;
  const deliveryDate = p.deliveryDate || issueDate;

  const sellerStreet = `${esc(p.seller.street)}`;
  const sellerCity = `${esc(p.seller.zip)} ${esc(p.seller.city)}`;
  const buyerStreet = p.buyer.street ? esc(p.buyer.street) : esc(p.buyer.name);
  const buyerCity = p.buyer.zip && p.buyer.city ? `${esc(p.buyer.zip)} ${esc(p.buyer.city)}` : '';

  const lineItemsXml = p.lineItems.map((item, i) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${i + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${esc(item.description)}</ram:Name>
          ${item.id ? `<ram:GlobalID schemeID="0160">${esc(item.id)}</ram:GlobalID>` : ''}
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
            <ram:CategoryCode>S</ram:CategoryCode>
            <ram:RateApplicablePercent>${fmt(item.taxPercent)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${fmt(item.netAmount)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`).join('');

  const bankXml = p.bankDetails?.bankName ? `
          <ram:SpecifiedCreditorFinancialInstitution>
            <ram:Name>${esc(p.bankDetails.bankName)}</ram:Name>
          </ram:SpecifiedCreditorFinancialInstitution>` : '';

  const bicXml = p.bankDetails?.bic ? `
          <ram:SpecifiedCreditorFinancialInstitution>
            <ram:Name>${esc(p.bankDetails.bankName || '')}</ram:Name>
            <ram:ProprietaryID schemeID="BIC">${esc(p.bankDetails.bic)}</ram:ProprietaryID>
          </ram:SpecifiedCreditorFinancialInstitution>` : '';

  const paymentMeansXml = p.bankDetails ? `
        <ram:SpecifiedTradeSettlementPaymentMeans>
          <ram:TypeCode>30</ram:TypeCode>
          <ram:Information>${esc(p.paymentTerms || 'Zahlbar innerhalb von 14 Tagen')}</ram:Information>
          <ram:PayeePartyCreditorFinancialAccount>
            <ram:IBANID>${esc(p.bankDetails.iban || '')}</ram:IBANID>
          </ram:PayeePartyCreditorFinancialAccount>
          ${bankXml || bicXml}
        </ram:SpecifiedTradeSettlementPaymentMeans>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID>
    </ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(p.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(p.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${sellerStreet}</ram:LineOne>
          <ram:LineThree>${sellerCity}</ram:LineThree>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${esc(p.seller.taxId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(p.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${buyerStreet}</ram:LineOne>
          ${buyerCity ? `<ram:LineThree>${buyerCity}</ram:LineThree>` : ''}
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
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
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmt(p.taxRate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
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
