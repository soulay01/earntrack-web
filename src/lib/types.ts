export interface Employee {
  id: string;
  name: string;
  email?: string;
  stundenlohn?: number;
  telefon?: string;
  notizen?: string;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  telefon?: string;
  adresse?: string;
  notizen?: string;
  createdAt?: string;
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
