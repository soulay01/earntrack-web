'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, logout as fbLogout } from '@/lib/auth';
import { subscribe, getCompany } from '@/lib/db';
import { Unsubscribe } from 'firebase/firestore';
import { Assignment, Employee, Customer } from '@/lib/types';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Data {
  user: User | null;
  loading: boolean;
  role: string | null;
  company: any;
  companyId: string | null;
  assignments: Assignment[];
  employees: Employee[];
  customers: Customer[];
  myProjects: Assignment[];
  linkedProjectIds: string[];
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Data>({
  user: null, loading: true, role: null, company: null, companyId: null,
  assignments: [], employees: [], customers: [], myProjects: [], linkedProjectIds: [],
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

export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [myProjects, setMyProjects] = useState<Assignment[]>([]);
  const [linkedProjectIds, setLinkedProjectIds] = useState<string[]>([]);
  const unsubs = useRef<Unsubscribe[]>([]);

  const stopListeners = useCallback(() => {
    unsubs.current.forEach(fn => fn());
    unsubs.current = [];
  }, []);

  const startListeners = useCallback((cid: string) => {
    stopListeners();
    unsubs.current.push(
      subscribe<Employee>('employees', cid, data => setEmployees(data)),
      subscribe<Customer>('customers', cid, data => setCustomers(data)),
      subscribe<Assignment>('assignments', cid, data => setAssignments(data)),
    );
    getCompany(cid).then(setCompany);
  }, [stopListeners]);

  const load = useCallback(async (u: User) => {
    const userDocRef = doc(db, 'users', u.uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists() && userDoc.data().role === 'employee') {
      const ud = userDoc.data();
      const linkedIds = ud.linkedToProjects || [];
      setRole('employee');
      setCompanyId(null);
      setCompany(null);
      stopListeners();
      setAssignments([]);
      setEmployees([]);
      setCustomers([]);
      setLinkedProjectIds(linkedIds);
      if (linkedIds.length > 0) {
        const snaps = await Promise.all(linkedIds.map((aid: string) => getDoc(doc(db, 'assignments', aid))));
        setMyProjects(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as Assignment)));
      }
      return;
    }
    const cid = await resolveCompanyId(u);
    setCompanyId(cid);
    setRole('owner');
    setLinkedProjectIds([]);
    setMyProjects([]);
    if (cid) {
      startListeners(cid);
    }
  }, [stopListeners]);

  useEffect(() => {
    const unsub = onAuthChange(async u => {
      setUser(u);
      if (u) await load(u);
      else {
        setRole(null);
        setCompanyId(null);
        setCompany(null);
        stopListeners();
        setAssignments([]);
        setEmployees([]);
        setCustomers([]);
        setMyProjects([]);
        setLinkedProjectIds([]);
      }
      setLoading(false);
    });
    return () => { unsub(); stopListeners(); };
  }, [load, stopListeners]);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    getCompany(companyId).then(setCompany);
  }, [companyId]);

  return (
    <Ctx.Provider value={{ user, loading, role, company, companyId, assignments, employees, customers, myProjects, linkedProjectIds, logout: fbLogout, refresh }}>
      {role === 'employee' ? <EmployeeNotice user={user} logout={fbLogout} /> : children}
    </Ctx.Provider>
  );
}

function EmployeeNotice({ user, logout }: { user: User | null; logout: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-teal-50 via-white to-emerald-50">
      <div className="w-full max-w-sm text-center animate-slideUp">
        <img src="/logo.png" alt="EarnTrack" className="w-16 h-16 mx-auto mb-5 rounded-full object-cover shadow-lg shadow-teal-200" />
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Nur für Unternehmer</h1>
        <p className="text-slate-500 text-sm mb-6">
          Diese Web-App ist nur für Geschäftsführer und Projektleiter.<br />
          Bitte verwende die mobile EarnTrack-App für deine Zeiterfassung.
        </p>
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6 text-left space-y-4">
          <p className="text-sm font-semibold text-slate-700">Angemeldet als</p>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-500 text-xs font-medium truncate">{user?.email}</p>
              <p className="text-slate-400 text-[10px]">Mitarbeiter-Zugang</p>
            </div>
          </div>
        </div>
        <button onClick={async () => { setLoading(true); await logout(); }} disabled={loading}
          className="w-full py-3 bg-red-50 hover:bg-red-100 active:scale-[0.97] text-red-600 font-semibold rounded-lg transition-all text-sm border border-red-200 flex items-center justify-center gap-2">
          {loading && <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />}
          Abmelden
        </button>
      </div>
    </div>
  );
}
