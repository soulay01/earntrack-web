'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, logout as fbLogout } from '@/lib/auth';
import { fetchAll, getCompany } from '@/lib/db';
import { Assignment, Employee, Customer } from '@/lib/types';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Data {
  user: User | null;
  loading: boolean;
  company: any;
  companyId: string | null;
  assignments: Assignment[];
  employees: Employee[];
  customers: Customer[];
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Data>({
  user: null, loading: true, company: null, companyId: null,
  assignments: [], employees: [], customers: [],
  logout: async () => {}, refresh: async () => {},
});

export function useData() { return useContext(Ctx); }

async function resolveCompanyId(u: User): Promise<string | null> {
  try {
    const userDocRef = doc(db, 'users', u.uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      return userDoc.data().companyId || u.uid;
    }
    const cid = u.uid;
    await Promise.all([
      setDoc(userDocRef, {
        email: u.email,
        companyId: cid,
        role: 'owner',
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'companies', cid), {
        id: cid,
        name: u.email?.split('@')[0] || 'Mein Unternehmen',
        createdAt: serverTimestamp(),
      }),
    ]);
    return cid;
  } catch { return null; }
}

async function loadAll(cid: string) {
  const [comp, ass, emp, cust] = await Promise.all([
    getCompany(cid),
    fetchAll<Assignment>('assignments', cid),
    fetchAll<Employee>('employees', cid),
    fetchAll<Customer>('customers', cid),
  ]);
  return { company: comp, assignments: ass || [], employees: emp || [], customers: cust || [] };
}

export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const load = useCallback(async (u: User) => {
    const cid = await resolveCompanyId(u);
    setCompanyId(cid);
    if (cid) {
      const data = await loadAll(cid);
      setCompany(data.company);
      setAssignments(data.assignments);
      setEmployees(data.employees);
      setCustomers(data.customers);
    }
  }, []);

  useEffect(() => onAuthChange(async u => {
    setUser(u);
    if (u) await load(u);
    else {
      setCompanyId(null);
      setCompany(null);
      setAssignments([]);
      setEmployees([]);
      setCustomers([]);
    }
    setLoading(false);
  }), [load]);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const data = await loadAll(companyId);
    setCompany(data.company);
    setAssignments(data.assignments);
    setEmployees(data.employees);
    setCustomers(data.customers);
  }, [companyId]);

  return (
    <Ctx.Provider value={{ user, loading, company, companyId, assignments, employees, customers, logout: fbLogout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
