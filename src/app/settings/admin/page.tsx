'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean);

export default function AdminPage() {
  const { user, loading } = useData();
  const router = useRouter();

  const [activeToday, setActiveToday] = useState(0);
  const [activeWeek, setActiveWeek] = useState(0);
  const [activeMonth, setActiveMonth] = useState(0);
  const [recentSignups, setRecentSignups] = useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [topActions, setTopActions] = useState<string[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [trialCompanies, setTrialCompanies] = useState<any[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) return;
    loadData();
  }, [user]);

  async function loadData() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

      const [todaySnap, weekSnap, monthSnap, signupsSnap, paymentsSnap, usersSnap, trialSnap] = await Promise.all([
        getDocs(query(collection(db, 'usage_log'), where('date', '==', today))),
        getDocs(query(collection(db, 'usage_log'), where('date', '>=', weekAgo))),
        getDocs(query(collection(db, 'usage_log'), where('date', '>=', monthAgo))),
        getDocs(query(collection(db, 'demo_signups'), orderBy('createdAt', 'desc'), limit(10))),
        getDocs(query(collection(db, 'payment_requests'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'companies'), where('subscriptionStatus', '==', 'trial'))),
      ]);

      setActiveToday(todaySnap.size);
      setActiveWeek(weekSnap.size);

      const monthUids = new Set<string>();
      const actionCounts: Record<string, number> = {};
      monthSnap.forEach(d => {
        const dta = d.data();
        monthUids.add(dta.uid);
        const act = dta.lastAction || 'unknown';
        actionCounts[act] = (actionCounts[act] || 0) + 1;
      });
      setActiveMonth(monthUids.size);

      const sorted = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
      setTopActions(sorted);

      setRecentSignups(signupsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPaymentRequests(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTotalUsers(usersSnap.size);

      // Trial companies with user emails
      const trialList = await Promise.all(trialSnap.docs.map(async (d) => {
        const data = d.data();
        let userEmail = '';
        try {
          const userSnap = await getDoc(doc(db, 'users', d.id));
          if (userSnap.exists()) userEmail = userSnap.data().email || '';
        } catch (e2) { console.error('admin load user error:', e2); }
        return {
          uid: d.id,
          companyName: data.name || '',
          email: userEmail,
          trialEndsAt: data.trialEndsAt?.toDate?.()?.toISOString() || data.trialEndsAt || '',
          subscriptionPlan: data.subscriptionPlan || 'trial',
        };
      }));
      setTrialCompanies(trialList);
    } catch (e) {
      console.error('Admin load error:', e);
    } finally {
      setLoadingData(false);
    }
  }

  async function handlePaymentAction(id: string, status: 'approved' | 'rejected') {
    try {
      await updateDoc(doc(db, 'payment_requests', id), { status, updatedAt: serverTimestamp() });
      setPaymentRequests(prev => prev.filter(p => p.id !== id));
    } catch (e) { console.error('payment action error:', e); }
  }

  async function handleEndDemo(uid: string) {
    if (!confirm('Demo wirklich beenden? Der User wird sofort gesperrt.')) return;
    try {
      await updateDoc(doc(db, 'companies', uid), { subscriptionStatus: 'expired', updatedAt: serverTimestamp() });
      setTrialCompanies(prev => prev.filter(c => c.uid !== uid));
    } catch (e) { console.error('end demo error:', e); }
  }

  async function handleSearchUser() {
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase())));
      if (userSnap.empty) {
        setSearchResult({ error: 'Kein User mit dieser E-Mail gefunden' });
        return;
      }
      const userDoc = userSnap.docs[0];
      const uid = userDoc.id;
      const companySnap = await getDoc(doc(db, 'companies', uid));
      const companyData = companySnap.exists() ? companySnap.data() : null;
      setSearchResult({
        uid,
        userEmail: userDoc.data().email || '',
        userName: userDoc.data().name || userDoc.data().displayName || '',
        companyName: companyData?.name || '',
        subscriptionStatus: companyData?.subscriptionStatus || 'kein Status',
        subscriptionPlan: companyData?.subscriptionPlan || '-',
        trialEndsAt: companyData?.trialEndsAt?.toDate?.()?.toISOString() || companyData?.trialEndsAt || '-',
      });
    } catch (e: any) {
      setSearchResult({ error: e.message || 'Fehler bei der Suche' });
    } finally {
      setSearching(false);
    }
  }

  if (loading || !user) return null;

  if (!user?.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Sidebar />
        <main className="flex-1 overflow-y-auto flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" /></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Kein Zugriff</h1>
            <p className="text-slate-500 text-sm mt-1">Dieser Bereich ist nur für Admins.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-5xl mx-auto space-y-6">
          <div className="mb-2">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Panel</h1>
            <p className="text-slate-500 text-sm mt-1">Nutzungsstatistiken, Demo-Anmeldungen & Zahlungsanfragen</p>
          </div>

          {loadingData ? (
            <div className="text-center text-slate-400 text-sm py-12">Laden...</div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <StatCard label="Aktive User heute" value={activeToday} />
                <StatCard label="Aktive User diese Woche" value={activeWeek} />
                <StatCard label="Aktive User diesen Monat" value={activeMonth} />
                <StatCard label="Registrierte User" value={totalUsers} />
                <StatCard label="Ausstehende Zahlungen" value={paymentRequests.length} />
                <StatCard label="Aktive Testphasen" value={trialCompanies.length} />
              </div>

              {/* Top Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-3">Top Aktionen (30 Tage)</h2>
                {topActions.length === 0 ? (
                  <p className="text-sm text-slate-400">Keine Daten</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topActions.map(a => (
                      <span key={a} className="px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold">{a}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Latest Demo Signups */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900">Neueste Demo-Anmeldungen</h2>
                </div>
                {recentSignups.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm">Keine Anmeldungen</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentSignups.map((s: any) => (
                      <div key={s.id} className="p-5 flex items-start justify-between hover:bg-slate-50 transition-all">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{s.name || 'Unbekannt'}</p>
                          <p className="text-xs text-slate-400">{s.email} · {s.companyName || '-'} · {s.phone || '-'}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.address || '-'}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {s.status || 'pending'}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1">{s.createdAt?.toDate?.().toLocaleDateString('de-DE') || '-'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Requests */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900">Ausstehende Zahlungsanfragen</h2>
                </div>
                {paymentRequests.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm">Keine ausstehenden Anfragen</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {paymentRequests.map(req => (
                      <div key={req.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-all">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{req.userEmail || 'Unbekannt'}</p>
                          <p className="text-xs text-slate-400">{req.plan || 'Pro'} · {req.submittedAt?.toDate?.().toLocaleDateString('de-DE') || '-'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handlePaymentAction(req.id, 'approved')}
                            className="px-4 py-1.5 bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold hover:from-green-100 hover:to-emerald-100 active:scale-[0.97] transition-all shadow-sm">
                            Bestätigen
                          </button>
                          <button onClick={() => handlePaymentAction(req.id, 'rejected')}
                            className="px-4 py-1.5 bg-gradient-to-br from-red-50 to-rose-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:from-red-100 hover:to-rose-100 active:scale-[0.97] transition-all shadow-sm">
                            Ablehnen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Trial Companies */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900">Demo-Teilnehmer verwalten</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{trialCompanies.length} Unternehmen in der Testphase</p>
                </div>
                {trialCompanies.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm">Keine aktiven Testphasen</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {trialCompanies.map(c => (
                      <div key={c.uid} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 truncate">{c.companyName || 'Unbekannt'}</p>
                          <p className="text-xs text-slate-400 truncate">{c.email}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Plan: {c.subscriptionPlan} · Ende: {c.trialEndsAt ? new Date(c.trialEndsAt).toLocaleDateString('de-DE') : '-'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleEndDemo(c.uid)}
                          className="shrink-0 ml-4 px-4 py-1.5 bg-gradient-to-br from-red-50 to-rose-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:from-red-100 hover:to-rose-100 active:scale-[0.97] transition-all shadow-sm"
                        >
                          Demo beenden
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Search User by Email */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-3">User per E-Mail suchen</h2>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={searchEmail}
                    onChange={e => setSearchEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearchUser()}
                    placeholder="user@example.com"
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                  />
                  <button
                    onClick={handleSearchUser}
                    disabled={searching}
                    className="px-5 py-2 bg-gradient-to-br from-teal-500 to-emerald-500 text-white rounded-xl text-sm font-bold hover:from-teal-600 hover:to-emerald-600 active:scale-[0.97] transition-all shadow-sm disabled:opacity-50"
                  >
                    {searching ? 'Suche...' : 'Suchen'}
                  </button>
                </div>

                {searchResult && (
                  <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                    {searchResult.error ? (
                      <p className="text-sm text-red-600 font-medium">{searchResult.error}</p>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{searchResult.userName || searchResult.userEmail}</p>
                          <p className="text-xs text-slate-400">{searchResult.userEmail} · {searchResult.companyName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Status: <span className={`font-semibold ${searchResult.subscriptionStatus === 'expired' ? 'text-red-600' : searchResult.subscriptionStatus === 'trial' ? 'text-amber-600' : 'text-green-600'}`}>{searchResult.subscriptionStatus}</span>
                            · Plan: {searchResult.subscriptionPlan}
                            · Trial-Ende: {searchResult.trialEndsAt !== '-' ? new Date(searchResult.trialEndsAt).toLocaleDateString('de-DE') : '-'}
                          </p>
                        </div>
                        {searchResult.subscriptionStatus === 'trial' && (
                          <button
                            onClick={() => handleEndDemo(searchResult.uid)}
                            className="shrink-0 ml-4 px-4 py-1.5 bg-gradient-to-br from-red-50 to-rose-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:from-red-100 hover:to-rose-100 active:scale-[0.97] transition-all shadow-sm"
                          >
                            Demo beenden
                          </button>
                        )}
                        {searchResult.subscriptionStatus === 'active' && (
                          <span className="shrink-0 ml-4 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold">
                            Bereits aktiv
                          </span>
                        )}
                        {searchResult.subscriptionStatus === 'expired' && (
                          <span className="shrink-0 ml-4 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold">
                            Bereits abgelaufen
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center hover:shadow-md transition-all">
      <p className="text-3xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-1 font-medium">{label}</p>
    </div>
  );
}
