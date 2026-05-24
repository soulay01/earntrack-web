export interface Employee {
  id: string;
  name: string;
  email?: string;
  stundenlohn?: number;
  telefon?: string;
  notizen?: string;
  imageUrl?: string;
  _storedPassword?: string;
  needsSetup?: boolean;
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
}
