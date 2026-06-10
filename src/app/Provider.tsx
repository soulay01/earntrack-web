'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { User } from 'firebase/auth';
import { onAuthChange, logout as fbLogout } from '@/lib/auth';
import { subscribe, subscribeCompany } from '@/lib/db';
import { Unsubscribe } from 'firebase/firestore';
import { Assignment, Employee, Customer, Supplier, Expense } from '@/lib/types';
import { doc, getDoc, getDocFromServer, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import PaywallOverlay from '@/components/PaywallOverlay';
import CleanupCountdown from '@/components/CleanupCountdown';
import { getPlanLimit } from '@/lib/plans';

interface Data {
  user: User | null;
  loading: boolean;
  role: string | null;
  company: any;
  companyId: string | null;
  assignments: Assignment[];
  employees: Employee[];
  customers: Customer[];
  suppliers: Supplier[];
  expenses: Expense[];
  myProjects: Assignment[];
  linkedProjectIds: string[];
  unreadCounts: Record<string, number>;
  projectReads: Record<string, any>;
  markProjectRead: (assignmentId: string) => Promise<void>;
  photoReads: Record<string, any>;
  photoUnreadCounts: Record<string, number>;
  markPhotoRead: (assignmentId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshUser: () => void;
}

const Ctx = createContext<Data>({
  user: null, loading: true, role: null, company: null, companyId: null,
  assignments: [], employees: [], customers: [], suppliers: [], expenses: [], myProjects: [], linkedProjectIds: [],
  unreadCounts: {}, projectReads: {},
  markProjectRead: async () => {},
  photoReads: {}, photoUnreadCounts: {}, markPhotoRead: async () => {},
  logout: async () => {}, refresh: async () => {}, refreshUser: () => {},
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
        subscriptionStatus: 'trial',
        subscriptionPlan: 'trial',
        trialEndsAt: Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
      }),
    ]);
    return cid;
  } catch (e) { console.error('resolveCompanyId failed:', e); return null; }
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [myProjects, setMyProjects] = useState<Assignment[]>([]);
  const [linkedProjectIds, setLinkedProjectIds] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [projectReads, setProjectReads] = useState<Record<string, any>>({});
  const [photoReads, setPhotoReads] = useState<Record<string, any>>({});
  const [photoUnreadCounts, setPhotoUnreadCounts] = useState<Record<string, number>>({});
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
      subscribe<Supplier>('suppliers', cid, data => setSuppliers(data)),
      subscribe<Expense>('expenses', cid, data => setExpenses(data)),
      subscribe<Assignment>('assignments', cid, data => setAssignments(data)),
      subscribeCompany(cid, data => { setCompany(data); setCompanyLoaded(true); }),
    );
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
      setCompanyLoaded(false);
      stopListeners();
      setAssignments([]);
      setEmployees([]);
      setCustomers([]);
      setSuppliers([]);
      setExpenses([]);
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
    const unsub = onAuthChange(u => {
      setUser(u);
      if (u) {
        load(u)
          .then(() => setLoading(false))
          .catch(e => { console.error('Auth init failed:', e); setLoading(false); });
      } else {
        setRole(null);
        setCompanyId(null);
        setCompany(null);
        setCompanyLoaded(false);
        stopListeners();
        setAssignments([]);
        setEmployees([]);
        setCustomers([]);
        setSuppliers([]);
        setExpenses([]);
        setMyProjects([]);
        setLinkedProjectIds([]);
        setLoading(false);
      }
    });
    return () => { unsub(); stopListeners(); };
  }, [load, stopListeners]);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      const snap = await getDocFromServer(doc(db, 'companies', companyId));
      if (snap.exists()) {
        setCompany({ ...snap.data(), id: snap.id });
      }
    } catch (e) {
      console.error('refresh failed:', e);
    }
  }, [companyId]);

  const refreshUser = useCallback(() => {
    setUser(auth.currentUser);
  }, []);

  const [companyLoaded, setCompanyLoaded] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid);
    getDoc(ref).then(snap => {
      if (!snap.exists()) return;
      setProjectReads(snap.data().projectReads || {});
      setPhotoReads(snap.data().photoReads || {});
    }).catch((e) => console.error('load reads error:', e));
  }, [user?.uid]);

  const markProjectRead = useCallback(async (assignmentId: string) => {
    if (!user?.uid) return;
    const now = Timestamp.now();
    setProjectReads(prev => ({ ...prev, [assignmentId]: now }));
    updateDoc(doc(db, 'users', user.uid), {
      [`projectReads.${assignmentId}`]: now,
    }).catch((e) => console.error('markProjectRead error:', e));
  }, [user?.uid]);

  const markPhotoRead = useCallback(async (assignmentId: string) => {
    if (!user?.uid) return;
    const now = Timestamp.now();
    setPhotoReads(prev => ({ ...prev, [assignmentId]: now }));
    updateDoc(doc(db, 'users', user.uid), {
      [`photoReads.${assignmentId}`]: now,
    }).catch((e) => console.error('markPhotoRead error:', e));
  }, [user?.uid]);

  // Trigger cleanup when excessCleanupAt has expired
  useEffect(() => {
    if (!companyLoaded || !company?.excessCleanupAt) return;
    const cleanupDate = company.excessCleanupAt?.toDate
      ? company.excessCleanupAt.toDate()
      : new Date(company.excessCleanupAt);
    if (cleanupDate.getTime() > Date.now()) return;

    const doCleanup = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        await fetch('/api/cleanup-excess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        });
      } catch (e) {
        console.error('Cleanup trigger failed:', e);
      }
    };
    doCleanup();
  }, [companyLoaded, company?.excessCleanupAt]);

  const showPaywall =
    role === 'owner' &&
    !loading &&
    user != null &&
    company != null &&
    companyLoaded &&
    company.subscriptionStatus != null &&
    !['active', 'trial', 'trialing', 'cancelled', 'paused'].includes(company.subscriptionStatus);

  // Excess-Check: Mitarbeiter > Plan-Limit, auch ohne vorhandenes excessCleanupAt
  const planEmployeeLimit = company?.subscriptionPlan ? getPlanLimit(company?.subscriptionPlan, 'employees') : null;
  const hasImpliedExcess = planEmployeeLimit !== null && planEmployeeLimit !== Infinity && employees.length > planEmployeeLimit;

  return (
    <Ctx.Provider value={{ user, loading, role, company, companyId, assignments, employees, customers, suppliers, expenses, myProjects, linkedProjectIds, unreadCounts, projectReads, photoReads, photoUnreadCounts, markProjectRead, markPhotoRead, logout: fbLogout, refresh, refreshUser }}>
      {role === 'employee'
        ? <EmployeeNotice user={user} logout={fbLogout} />
        : showPaywall
          ? <PaywallOverlay />
          : <>{company?.subscriptionStatus === 'cancelled' && company?.dataCleanupAt && <CleanupCountdown dataCleanupAt={company.dataCleanupAt} />}{company?.excessCleanupAt && company?.subscriptionStatus !== 'cancelled' && (
              <CleanupCountdown
                dataCleanupAt={company.excessCleanupAt}
                mode="excess"
                excessDataTypes={company.excessDataTypes || ['employees']}
                excessCount={company.excessCount}
                excessOldPlan={company.excessOldPlan}
                currentPlan={company.subscriptionPlan}
              />
            )}{hasImpliedExcess && !company?.excessCleanupAt && company?.subscriptionStatus !== 'cancelled' && (
              <div className="border-b border-amber-500/25 bg-gradient-to-r from-amber-950 via-amber-900/60 to-amber-950">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <p className="text-sm text-amber-200">
                      Dein <strong className="text-amber-50">{company?.subscriptionPlan === 'solo' ? 'Solo' : company?.subscriptionPlan}</strong>-Plan erlaubt maximal <strong className="text-amber-50">{planEmployeeLimit}</strong> Mitarbeiter. Du hast aktuell <strong className="text-amber-50">{employees.length}</strong>. Bitte reduziere die Anzahl oder wähle einen höheren Plan.
                    </p>
                  </div>
                  <Link
                    href="/settings/subscription"
                    className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20 active:scale-[0.97]"
                  >
                    Plan upgraden
                  </Link>
                </div>
              </div>
            )}{children}</>}
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
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
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
