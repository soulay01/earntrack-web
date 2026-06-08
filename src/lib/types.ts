export interface Employee {
  id: string;
  name: string;
  berufsfeld?: string;
  email?: string;
  stundenlohn?: number;
  telefon?: string;
  notizen?: string;
  imageUrl?: string;
  hasCredentials?: boolean;
  needsSetup?: boolean;
  authUid?: string;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  telefon?: string;
  adresse?: string;
  notizen?: string;
  imageUrl?: string;
  createdAt?: string;
}

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  supplierNo?: string;
  creditorNo?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  country?: string;
  contactPerson?: string;
  email?: string;
  telefon?: string;
  iban?: string;
  bic?: string;
  paymentTerms?: string;
  supplies?: string[];
  createdAt?: string;
}

export interface Expense {
  id: string;
  companyId: string;
  supplierId?: string;
  supplierName?: string;
  assignmentId?: string;
  customerId?: string;
  invoiceNumber?: string;
  amount: number;
  taxAmount?: number;
  totalAmount?: number;
  currency?: string;
  dueDate?: string;
  invoiceDate?: string;
  description?: string;
  category?: string;
  fileUrl?: string;
  fileName?: string;
  iban?: string;
  bic?: string;
  creditorNo?: string;
  status?: 'open' | 'paid' | 'overdue';
  createdAt?: string;
}

export interface Article {
  id: string;
  companyId: string;
  articleNo: string;
  manufacturerNo: string;
  ean: string;
  name1: string;
  name2: string;
  unit: string;
  price: number;
  currency: string;
  manufacturerName: string;
  importedAt?: string;
}

export interface Assignment {
  id: string;
  companyId: string;
  createdBy: string;
  projekt: string;
  kunde: string;
  datum: string;
  mitarbeiter: string[] | string;
  umsatz: number | string;
  stunden: number | string;
  stundenlohn: number | string;
  status?: string;
  createdAt?: string;
  invoiceStatus?: string;
  invoiceDueDate?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  lineItems?: any[];
  discount?: number;
  discountType?: 'percent' | 'fixed';
}
