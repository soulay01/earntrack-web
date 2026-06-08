import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export interface EstimateTemplate {
  id?: string;
  companyId: string;
  name: string;
  customerId?: string | null;
  projekt?: string;
  employeeIds?: string[];
  employeeHours?: Record<string, string>;
  materials?: { name: string; preis: string; menge: string }[];
  otherCosts?: { name: string; betrag: string }[];
  gewinnmarge?: string;
  createdAt?: any;
  updatedAt?: any;
}

export async function loadTemplates(companyId: string): Promise<EstimateTemplate[]> {
  const q = query(collection(db, 'companies', companyId, 'estimateTemplates'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EstimateTemplate))
    .sort((a, b) => ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)) * -1);
}

export async function saveTemplate(companyId: string, data: Omit<EstimateTemplate, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'companies', companyId, 'estimateTemplates'), {
    companyId,
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteTemplate(companyId: string, templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'companies', companyId, 'estimateTemplates', templateId));
}
