import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';

export interface RecurringConfig {
  id?: string;
  companyId: string;
  name: string;
  customerId: string;
  customerName: string;
  projekt: string;
  umsatz: number;
  stunden: number;
  stundenlohn: number;
  mitarbeiter: string[];
  interval: 'monthly' | 'quarterly' | 'yearly';
  intervalCount: number;
  nextInvoiceDate: string;
  lastInvoiceDate: string | null;
  createdAt?: any;
  updatedAt?: any;
  invoiceNumberPrefix?: string;
}

export function getNextDate(from: string, interval: 'monthly' | 'quarterly' | 'yearly', count: number): string {
  const d = new Date(from);
  const origDay = d.getDate();
  switch (interval) {
    case 'monthly': d.setMonth(d.getMonth() + count); break;
    case 'quarterly': d.setMonth(d.getMonth() + count * 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + count); break;
  }
  if (d.getDate() !== origDay) d.setDate(0);
  return d.toISOString().split('T')[0];
}

export function formatDateStr(d: string): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function isDue(config: RecurringConfig): boolean {
  if (!config.nextInvoiceDate) return false;
  const next = new Date(config.nextInvoiceDate);
  const now = new Date();
  return next <= now;
}

export async function loadRecurringConfigs(companyId: string): Promise<RecurringConfig[]> {
  const q = query(collection(db, 'companies', companyId, 'recurring'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringConfig));
}

export async function saveRecurringConfig(companyId: string, data: Omit<RecurringConfig, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'companies', companyId, 'recurring'), {
    companyId, ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRecurringConfig(companyId: string, id: string, data: Partial<RecurringConfig>): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId, 'recurring', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteRecurringConfig(companyId: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'companies', companyId, 'recurring', id));
}

export async function generateInvoiceFromConfig(
  companyId: string,
  config: RecurringConfig,
  invoiceNumber: string,
  invoiceTemplate: any,
  companyData: any,
  addAssignment: (data: any) => Promise<string | null>
): Promise<string | null> {
  const today = new Date().toISOString().split('T')[0];
  try {
    const aid = await addAssignment({
      projekt: config.projekt,
      kunde: config.customerName,
      datum: today,
      stunden: String(config.stunden),
      stundenlohn: String(config.stundenlohn),
      umsatz: String(config.umsatz),
      mitarbeiter: config.mitarbeiter,
      invoiceStatus: 'offen',
      invoiceDueDate: (() => {
        const d = new Date(); d.setDate(d.getDate() + 14);
        return d.toLocaleDateString('de-DE');
      })(),
    });
    return aid;
  } catch (e) {
    console.error('createRecurringInvoiceAssignment failed', e);
    return null;
  }
}
