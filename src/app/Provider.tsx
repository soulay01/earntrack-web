'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, logout as fbLogout } from '@/lib/auth';
import { subscribe, subscribeCompany } from '@/lib/db';
import { Unsubscribe } from 'firebase/firestore';
import { Assignment, Employee, Customer, Supplier, Expense } from '@/lib/types';
import { doc, getDoc, getDocs, getDocFromServer, setDoc, updateDoc, serverTimestamp, Timestamp, collection, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import PaywallOverlay from '@/components/PaywallOverlay';
import CleanupCountdown from '@/components/CleanupCountdown';
import { getPlanLimit, EXCESS_CLEANUP_MS } from '@/lib/plans';
import { useFcmNotifications } from '@/lib/useFcmNotifications';

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
  clockReads: Record<string, any>;
  clockUnreadCounts: Record<string, number>;
  markClockRead: (assignmentId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshUser: () => void;
  requestFcmPermission: () => Promise<string | null>;
  removeFcmToken: () => Promise<void>;
  fcmToken: string | null;
  fcmPermission: string;
}

const Ctx = createContext<Data>({
  user: null, loading: true, role: null, company: null, companyId: null,
  assignments: [], employees: [], customers: [], suppliers: [], expenses: [], myProjects: [], linkedProjectIds: [],
  unreadCounts: {}, projectReads: {},
  markProjectRead: async () => {},
  photoReads: {}, photoUnreadCounts: {}, markPhotoRead: async () => {},
  clockReads: {}, clockUnreadCounts: {}, markClockRead: async () => {},
  logout: async () => {}, refresh: async () => {}, refreshUser: () => {},
  requestFcmPermission: async () => null, removeFcmToken: async () => {},
  fcmToken: null, fcmPermission: 'prompt',
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
  const [clockReads, setClockReads] = useState<Record<string, any>>({});
  const [clockUnreadCounts, setClockUnreadCounts] = useState<Record<string, number>>({});
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
  }, [stopListeners, startListeners]);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthChange(u => {
      if (cancelled) return;
      setUser(u);
      if (u) {
        load(u)
          .then(() => { if (!cancelled) setLoading(false); })
          .catch(e => { if (!cancelled) { console.error('Auth init failed:', e); setLoading(false); } });
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
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; unsub(); stopListeners(); };
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
    let cancelled = false;
    const ref = doc(db, 'users', user.uid);
    getDoc(ref).then(snap => {
      if (cancelled || !snap.exists()) return;
      setProjectReads(snap.data().projectReads || {});
      setPhotoReads(snap.data().photoReads || {});
      setClockReads(snap.data().clockReads || {});
    }).catch((e) => console.error('load reads error:', e));
    return () => { cancelled = true; };
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

  const markClockRead = useCallback(async (assignmentId: string) => {
    if (!user?.uid) return;
    const now = Timestamp.now();
    setClockReads(prev => ({ ...prev, [assignmentId]: now }));
    updateDoc(doc(db, 'users', user.uid), {
      [`clockReads.${assignmentId}`]: now,
    }).catch((e) => console.error('markClockRead error:', e));
  }, [user?.uid]);

  // Refs to avoid triggering interval restart on every read-marker change
  const projectReadsRef = useRef(projectReads);
  projectReadsRef.current = projectReads;
  const photoReadsRef = useRef(photoReads);
  photoReadsRef.current = photoReads;
  const clockReadsRef = useRef(clockReads);
  clockReadsRef.current = clockReads;

  // ─── Unread count computation ─────────────────────────────────
  useEffect(() => {
    if (!user?.uid || assignments.length === 0 || role !== 'owner') return;

    const assignmentIds = assignments.map((a: any) => a.id);
    const BATCH = 10;
    let cancelled = false;
    let computing = false;

    const compute = async () => {
      if (cancelled || computing || assignmentIds.length === 0) return;
      computing = true;

      const noteCounts: Record<string, number> = {};
      const photoCounts: Record<string, number> = {};
      // Use refs to get latest read data without triggering deps
      const curProjectReads = projectReadsRef.current;
      const curPhotoReads = photoReadsRef.current;
      const curClockReads = clockReadsRef.current;

      // Query project_notes in batches of 10
      for (let i = 0; i < assignmentIds.length; i += BATCH) {
        if (cancelled) { computing = false; return; }
        const batch = assignmentIds.slice(i, i + BATCH);
        try {
          const snap = await getDocs(query(
            collection(db, 'project_notes'),
            where('assignmentId', 'in', batch)
          ));
          snap.forEach(d => {
            if (cancelled) return;
            const data = d.data();
            const aid = data.assignmentId;
            if (!aid) return;
            if (data.userId === user.uid) return;
            const created = data.createdAt?.toDate
              ? data.createdAt.toDate()
              : data.createdAt
                ? new Date(data.createdAt)
                : null;
            if (!created) return;
            const lastRead = curProjectReads[aid];
            if (lastRead) {
              const lastReadDate = lastRead.toDate ? lastRead.toDate() : new Date(lastRead);
              if (created <= lastReadDate) return;
            }
            noteCounts[aid] = (noteCounts[aid] || 0) + 1;
          });
        } catch (e) {
          console.error('compute notes batch error:', e);
        }
      }

      // Query project_photos in batches of 10
      for (let i = 0; i < assignmentIds.length; i += BATCH) {
        if (cancelled) { computing = false; return; }
        const batch = assignmentIds.slice(i, i + BATCH);
        try {
          const snap = await getDocs(query(
            collection(db, 'project_photos'),
            where('assignmentId', 'in', batch)
          ));
          snap.forEach(d => {
            if (cancelled) return;
            const data = d.data();
            const aid = data.assignmentId;
            if (!aid) return;
            if (data.userId === user.uid) return;
            const created = data.createdAt?.toDate
              ? data.createdAt.toDate()
              : data.createdAt
                ? new Date(data.createdAt)
                : null;
            if (!created) return;
            const lastRead = curPhotoReads[aid];
            if (lastRead) {
              const lastReadDate = lastRead.toDate ? lastRead.toDate() : new Date(lastRead);
              if (created <= lastReadDate) return;
            }
            photoCounts[aid] = (photoCounts[aid] || 0) + 1;
          });
        } catch (e) {
          console.error('compute photos batch error:', e);
        }
      }

      // Query clock_entries in batches of 10
      const clockCounts: Record<string, number> = {};
      for (let i = 0; i < assignmentIds.length; i += BATCH) {
        if (cancelled) { computing = false; return; }
        const batch = assignmentIds.slice(i, i + BATCH);
        try {
          const snap = await getDocs(query(
            collection(db, 'clock_entries'),
            where('assignmentId', 'in', batch)
          ));
          snap.forEach(d => {
            if (cancelled) return;
            const data = d.data();
            const aid = data.assignmentId;
            if (!aid) return;
            if (data.userId === user.uid) return;
            const created = data.clockIn?.toDate
              ? data.clockIn.toDate()
              : data.clockIn
                ? new Date(data.clockIn)
                : null;
            if (!created) return;
            const lastRead = curClockReads[aid];
            if (lastRead) {
              const lastReadDate = lastRead.toDate ? lastRead.toDate() : new Date(lastRead);
              if (created <= lastReadDate) return;
            }
            clockCounts[aid] = (clockCounts[aid] || 0) + 1;
          });
        } catch (e) {
          console.error('compute clock batch error:', e);
        }
      }

      if (!cancelled) {
        setUnreadCounts(noteCounts);
        setPhotoUnreadCounts(photoCounts);
        setClockUnreadCounts(clockCounts);
      }
      computing = false;
    };

    compute();
    const interval = setInterval(compute, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.uid, assignments, role]);

  // ─── FCM Push Notifications ──────────────────────────────────
  const {
    permission: fcmPermission,
    token: fcmToken,
    requestPermission: requestFcmPermission,
    removeToken: removeFcmToken,
  } = useFcmNotifications(user?.uid);

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
  }, [companyLoaded, company, company?.excessCleanupAt]);

  const showPaywall =
    role === 'owner' &&
    !loading &&
    user != null &&
    company != null &&
    companyLoaded &&
    company.subscriptionStatus != null &&
    !['active', 'trial', 'trialing', 'cancelled', 'paused'].includes(company.subscriptionStatus);

  // Excess-Check: Mitarbeiter > Plan-Limit, auch ohne vorhandenes excessCleanupAt
  const effectivePlan = company?.subscriptionPlan || (company?.subscriptionStatus === 'trial' ? 'trial' : 'solo');
  const planEmployeeLimit = getPlanLimit(effectivePlan, 'employees');
  const hasImpliedExcess = planEmployeeLimit !== Infinity && employees.length > planEmployeeLimit;

  // Automatisch excessCleanupAt setzen wenn impliziter Überschuss erkannt wurde
  useEffect(() => {
    if (!hasImpliedExcess || company?.excessCleanupAt || !companyId || !auth.currentUser) return;
    const cleanupAt = Timestamp.fromDate(new Date(Date.now() + EXCESS_CLEANUP_MS));
    const excessCount = employees.length - planEmployeeLimit;
    updateDoc(doc(db, 'companies', companyId), {
      excessCleanupAt: cleanupAt,
      excessDataTypes: ['employees'],
      excessCount,
      excessOldPlan: company?.subscriptionPlan || 'solo',
    }).catch(e => console.error('Failed to set excess cleanup:', e));
  }, [hasImpliedExcess, company?.excessCleanupAt, companyId, employees.length, planEmployeeLimit, company?.subscriptionPlan]);

  return (
    <Ctx.Provider value={{ user, loading, role, company, companyId, assignments, employees, customers, suppliers, expenses, myProjects, linkedProjectIds, unreadCounts, projectReads, photoReads, photoUnreadCounts, markProjectRead, markPhotoRead, clockReads, clockUnreadCounts, markClockRead, logout: fbLogout, refresh, refreshUser, requestFcmPermission, removeFcmToken, fcmToken, fcmPermission }}>
      {role === 'employee'
        ? <EmployeeNotice user={user} logout={fbLogout} />
        : showPaywall
          ? <PaywallOverlay />
          : <>{company?.subscriptionStatus === 'cancelled' && company?.dataCleanupAt && <CleanupCountdown dataCleanupAt={company.dataCleanupAt} />}{children}</>}
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
