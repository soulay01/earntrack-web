import { db } from './firebase';
import { collection, query, where, getDocs, doc, getDoc, Unsubscribe, onSnapshot } from 'firebase/firestore';
import { Assignment, Employee, Customer } from './types';

function q(col: string, companyId: string) {
  return query(collection(db, col), where('companyId', '==', companyId));
}

export async function fetchAll<T>(colName: string, companyId: string): Promise<T[]> {
  const snap = await getDocs(q(colName, companyId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
}

export function subscribe<T>(colName: string, companyId: string, cb: (data: T[]) => void): Unsubscribe {
  return onSnapshot(q(colName, companyId), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as T))));
}

export async function getCompany(companyId: string) {
  const snap = await getDoc(doc(db, 'companies', companyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export { fetchAll as fetchAssignments, fetchAll as fetchEmployees, fetchAll as fetchCustomers, subscribe as subscribeAssignments };

export type { Unsubscribe };
