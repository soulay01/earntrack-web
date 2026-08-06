'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useData } from '@/app/Provider'
import { useIsAdmin } from '@/lib/useIsAdmin'
import PageSkeleton from '@/components/skeletons/PageSkeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { X, Check } from 'lucide-react'
import LiveFeed from './LiveFeed'
import { LiveNowBar, RecentActivityCard } from './RecentActivity'
import ActivityTab from './ActivityTab'
import { fmt, fmtDate, eur, fmtK, actionLabel, actionColor } from './format'
import { C, PC, Section, ChartCard, Legend, TTip, TH } from './ui'
import DownloadsTab from './DownloadsTab'

type TabId = 'ubersicht' | 'aktivitaet' | 'nutzer' | 'downloads' | 'website' | 'umsatz'

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useData()
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [timeRange, setTimeRange] = useState(30)
  const [downloadsRange, setDownloadsRange] = useState(30)
  const [data, setData] = useState<any>(null)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [sortField, setSortField] = useState('email')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; action: string; email?: string } | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('ubersicht')

  const canView = isAdmin

  useEffect(() => {
    if (authLoading || adminLoading) return
    if (!user || !user.email) { router.replace('/login'); return }
  }, [user, authLoading, adminLoading])

  useEffect(() => {
    if (authLoading || adminLoading) return
    if (!isAdmin) { router.replace('/dashboard'); return }
    auth.currentUser?.getIdToken().then(token => {
      if (token) fetch('/api/auth/session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken: token }) }).catch(e => console.error('session fetch:', e))
    })
    loadData()
  }, [user, authLoading, adminLoading, timeRange, downloadsRange, isAdmin])

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { setError('Nicht authentifiziert'); setLoading(false); return }
      const res = await fetch('/api/analytics/data', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timeRange, downloadsTimeRange: downloadsRange }),
      })
      if (!res.ok) { const errBody = await res.json().catch(()=>null); throw new Error(errBody?.error || `HTTP ${res.status}`) }
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message || 'Fehler beim Laden')
    } finally { setLoading(false) }
  }

  const filteredUsers = useMemo(() => {
    if (!data?.users || activeTab !== 'nutzer') return []
    let list = [...data.users]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter((u: any) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.companyName.toLowerCase().includes(q))
    }
    list.sort((a: any, b: any) => {
      let va: any = a[sortField], vb: any = b[sortField]
      if (sortField === 'totalActions' || sortField === 'emailVerified' || sortField === 'employeesCount' || sortField === 'assignmentsCount' || sortField === 'customersCount') return sortDir === 'asc' ? Number(va)-Number(vb) : Number(vb)-Number(va)
      if (sortField === 'lastActive' || sortField === 'createdAt') { va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0; return sortDir === 'asc' ? va-vb : vb-va }
      va = String(va||''); vb = String(vb||'')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [data?.users, searchQuery, sortField, sortDir, activeTab])

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc') } }

  function toggleSelect(uid: string) {
    setSelectedUids(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedUids.size === filteredUsers.length) {
      setSelectedUids(new Set())
    } else {
      setSelectedUids(new Set(filteredUsers.map((u: any) => u.uid)))
    }
  }

  async function batchAction(action: string, singleUid?: string) {
    const uids = singleUid ? [singleUid] : Array.from(selectedUids)
    if (!uids.length) return
    if (action === 'delete' && !confirm(`Wirklich ${uids.length} User löschen?`)) return
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    const userEmail = (uid: string) => (data?.users || []).find((u: any) => u.uid === uid)?.email || uid
    setBatchLoading(true)
    setBatchProgress({ current: 0, total: uids.length, action })
    try {
      for (let i = 0; i < uids.length; i++) {
        const uid = uids[i]
        setBatchProgress({ current: i + 1, total: uids.length, action, email: userEmail(uid) })
        const res = await fetch('/api/analytics/batch-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uids: [uid], action }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Fehler bei ${userEmail(uid)}`)
        }
      }
      setSelectedUids(new Set())
      loadData()
    } catch (e: any) {
      alert(e.message)
    } finally { setBatchLoading(false); setBatchProgress(null) }
  }

  function exportCSV() {
    if (!filteredUsers.length) return
    const rows = filteredUsers.map((u: any) => ({ Email: u.email, Name: u.name, Unternehmen: u.companyName, 'Verifiziert': u.emailVerified ? 'Ja' : 'Nein', 'Letzte Aktivität': fmt(u.lastActive), Aktionen: u.totalActions, Status: u.subscriptionStatus, Registriert: fmtDate(u.createdAt) }))
    const h = Object.keys(rows[0])
    const csv = [h.join(','), ...rows.map(r => h.map(k => { let v = String((r as any)[k]??''); if (/^[=+\-@]/.test(v)) v = "'" + v; return v.includes(',')||v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v }).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'})); a.download = `earntrack-users-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const k = data?.kpis, ch = data?.charts

  if (authLoading || adminLoading) return <PageSkeleton variant="dashboard" maxWidth="max-w-[1440px]" />
  if (!canView) return null
  if (error) return <FullError message={error} onRetry={loadData} />

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Header lastUpdated={lastUpdated} onRefresh={loadData} timeRange={timeRange} onTimeRangeChange={setTimeRange} loading={loading} />

      {/* Tab navigation */}
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC]/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="flex items-center gap-1 h-12">
            <TabBtn active={activeTab === 'ubersicht'} onClick={() => setActiveTab('ubersicht')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
              Übersicht
            </TabBtn>
            <TabBtn active={activeTab === 'aktivitaet'} onClick={() => setActiveTab('aktivitaet')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Aktivität
            </TabBtn>
            <TabBtn active={activeTab === 'nutzer'} onClick={() => setActiveTab('nutzer')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Nutzer
            </TabBtn>
            <TabBtn active={activeTab === 'website'} onClick={() => setActiveTab('website')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
              Website
            </TabBtn>
            <TabBtn active={activeTab === 'downloads'} onClick={() => setActiveTab('downloads')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Downloads
            </TabBtn>
            <TabBtn active={activeTab === 'umsatz'} onClick={() => setActiveTab('umsatz')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Umsatz
            </TabBtn>
            <a href="/analytics/feedback" className="ml-auto text-sm font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors">
              Feedback →
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 pb-16 pt-8">
        {loading && !lastUpdated ? (
          <div className="flex items-center justify-center py-40">
            <div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0D9488]/30 border-t-[#0D9488]" /><p className="text-sm font-medium text-[#64748B]">Lade Analysedaten...</p></div>
          </div>
        ) : k ? (
          <>
            {/* ─── Übersicht ─── */}
            {activeTab === 'ubersicht' && (
              <div className="space-y-8">
                <LiveNowBar users={data?.users || []} />
                <RecentActivityCard users={data?.users || []} />
                {data?.recentSignups?.length > 0 && <NeusteUserBox signups={data.recentSignups} />}
                <HeroRow k={k} />
                <LiveFeed users={data?.users || []} />
                <UserGrowthComparison k={k} />
                <Section title="Wachstum" subtitle="Kumulierte Registrierungen">
                  <ChartCard title="User Growth" subtitle={`${timeRange} Tage`}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={data.growthData}>
                        <defs><linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14B8A6" stopOpacity={0.12}/><stop offset="100%" stopColor="#14B8A6" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                        <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                        <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                        <Tooltip content={<TTip valueKey="users" unit="User"/>}/>
                        <Line type="monotone" dataKey="users" stroke="#14B8A6" strokeWidth={3} dot={false} activeDot={{r:6,fill:'#14B8A6',stroke:'#F8FAFC',strokeWidth:3}} fill="url(#gG)"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </Section>
                <Section title="Geschäftsüberblick" subtitle="Verteilungen auf einen Blick">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {ch?.invoiceStatusData?.length ? (
                      <ChartCard title="Rechnungsstatus" subtitle={`${k.totalInvoices} Rechnungen · ${eur(k.totalInvoiceRevenue)} Rechnungswert`}>
                        <PieChart height={240} width={300}><Pie data={ch.invoiceStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                          {ch.invoiceStatusData.map((_: any,i: number) => <Cell key={i} fill={PC[i%PC.length]}/>)}
                        </Pie><Tooltip/></PieChart>
                        <Legend data={ch.invoiceStatusData} />
                      </ChartCard>
                    ) : null}
                    {ch?.planData?.length ? (
                      <ChartCard title="Abonnement-Verteilung" subtitle={`${k.totalCompanies} Firmen`}>
                        <PieChart height={240} width={300}><Pie data={ch.planData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                          {ch.planData.map((_: any,i: number) => <Cell key={i} fill={C[i%C.length]}/>)}
                        </Pie><Tooltip/></PieChart>
                        <Legend data={ch.planData} />
                      </ChartCard>
                    ) : null}
                    {ch?.subscriptionStatusData?.length ? (
                      <ChartCard title="Account-Status" subtitle={`${k.totalCompanies} Firmen`}>
                        <PieChart height={240} width={300}><Pie data={ch.subscriptionStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                          {ch.subscriptionStatusData.map((_: any,i: number) => <Cell key={i} fill={PC[i%PC.length]}/>)}
                        </Pie><Tooltip/></PieChart>
                        <Legend data={ch.subscriptionStatusData} />
                      </ChartCard>
                    ) : null}
                  </div>
                </Section>
              </div>
            )}

            {/* ─── Aktivität ─── */}
            {activeTab === 'aktivitaet' && (
              <ActivityTab
                timeRange={timeRange}
                dauData={data.dauData}
                featureData={data.featureData}
                platformBreakdown={data.platformBreakdown}
                platformTrend={data.platformTrend || []}
                recentActivity={data.recentActivity || []}
              />
            )}

            {/* ─── Nutzer ─── */}
            {activeTab === 'nutzer' && (
              <div className="space-y-8">
                <Section title="User Verwaltung" subtitle={`${filteredUsers.length} externe User (gefiltert & dedupliziert)`}>
                  <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                          <input type="text" placeholder="Suchen..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-56 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 py-2 text-sm text-[#0F172A] placeholder-[#64748B] outline-none focus:border-[#0D9488]/50 transition-colors"/>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedUids.size > 0 && (
                          <div className="flex items-center gap-2 mr-2">
                            <span className="text-xs font-semibold text-[#0D9488]">{selectedUids.size} ausgewählt</span>
                            {filteredUsers.some((u: any) => selectedUids.has(u.uid) && u.subscriptionStatus !== 'active') && (
                              <button onClick={() => batchAction('grantPro')} disabled={batchLoading} className="rounded-lg border border-[#0F766E] bg-[#0F766E]/10 px-4 py-2 text-xs font-bold text-[#0D9488] transition hover:bg-[#0F766E]/20 disabled:opacity-50">
                                Pro geben
                              </button>
                            )}
                            {filteredUsers.some((u: any) => selectedUids.has(u.uid) && u.subscriptionStatus === 'active') && (
                              <button onClick={() => batchAction('removePro')} disabled={batchLoading} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50">
                                Pro entfernen
                              </button>
                            )}
                            {filteredUsers.some((u: any) => selectedUids.has(u.uid) && u.subscriptionStatus === 'trial') && (
                              <button onClick={() => batchAction('endDemo')} disabled={batchLoading} className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                                Demo beenden
                              </button>
                            )}
                            <button onClick={() => batchAction('delete')} disabled={batchLoading} className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                              Löschen
                            </button>
                          </div>
                        )}
                        <button onClick={exportCSV} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs font-semibold text-[#0D9488] transition hover:bg-[#E2E8F0] hover:border-[#0D9488]/30">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          CSV Export
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                          <td className="px-3 py-4 w-10 sticky left-0 z-10 bg-[#FFFFFF]">
                            <button onClick={(e) => { e.stopPropagation(); toggleSelectAll() }} className="h-4 w-4 rounded border border-[#E2E8F0] flex items-center justify-center bg-[#F8FAFC] cursor-pointer hover:border-[#0D9488]/50 transition-colors">
                              {selectedUids.size === filteredUsers.length && filteredUsers.length > 0 && (
                                <svg className="h-3 w-3 text-[#0D9488]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                              )}
                            </button>
                          </td>
                          <TH label="E-Mail / Name" field="email" current={sortField} dir={sortDir} onClick={toggleSort}/>
                          <TH label="Firma" field="companyName" current={sortField} dir={sortDir} onClick={toggleSort}/>
                          <TH label="Status" field="subscriptionStatus" current={sortField} dir={sortDir} onClick={toggleSort}/>
                          <TH label="Aktivität" field="lastActive" current={sortField} dir={sortDir} onClick={toggleSort}/>
                          <TH label="Verifiziert" field="emailVerified" current={sortField} dir={sortDir} onClick={toggleSort}/>
                          <td className="px-4 py-4 sticky right-0 z-10 bg-[#FFFFFF] text-[10px] font-semibold text-[#64748B]">Aktion</td>
                        </tr></thead>
                        <tbody>
                          {filteredUsers.map((u: any) => (
                            <tr key={u.uid} onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; setSelectedUser(u) }} className="cursor-pointer border-b border-[#E2E8F0]/40 text-[#334155] transition hover:bg-[#E2E8F0]/40 last:border-0 group">
                              <td className="px-3 py-3.5 sticky left-0 z-10 bg-[#F8FAFC]">
                                <button onClick={(e) => { e.stopPropagation(); toggleSelect(u.uid) }} className="h-4 w-4 rounded border border-[#E2E8F0] flex items-center justify-center bg-[#F8FAFC] cursor-pointer hover:border-[#0D9488]/50 transition-colors">
                                  {selectedUids.has(u.uid) && (
                                    <svg className="h-3 w-3 text-[#0D9488]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="font-medium text-[#0F172A] text-sm">{u.email}</div>
                                <div className="text-[11px] text-[#64748B]">{u.name !== '-' ? u.name : ''}</div>
                              </td>
                              <td className="px-4 py-3.5 text-sm">{u.companyName}</td>
                              <td className="px-4 py-3.5"><StatusBadge status={u.subscriptionStatus}/></td>
                              <td className="px-4 py-3.5 text-xs text-[#64748B]">{fmt(u.lastActive)}</td>
                              <td className="px-4 py-3.5">{u.emailVerified ? <span className="inline-flex items-center gap-1 text-[#0D9488]"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Ja</span> : <span className="text-[#64748B]">Nein</span>}</td>
                              <td className="px-3 py-3.5 sticky right-0 z-10 bg-[#F8FAFC]">
                                {u.subscriptionStatus === 'active' ? (
                                  <button onClick={(e) => { e.stopPropagation(); batchAction('removePro', u.uid) }} disabled={batchLoading} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50 whitespace-nowrap">
                                    Pro entfernen
                                  </button>
                                ) : u.subscriptionStatus === 'trial' ? (
                                  <button onClick={(e) => { e.stopPropagation(); batchAction('endDemo', u.uid) }} disabled={batchLoading} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50 whitespace-nowrap">
                                    Demo beenden
                                  </button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); batchAction('grantPro', u.uid) }} disabled={batchLoading} className="rounded-md border border-[#0F766E]/30 bg-[#0F766E]/10 px-2 py-1 text-[10px] font-bold text-[#0D9488] transition hover:bg-[#0F766E]/20 disabled:opacity-50 whitespace-nowrap">
                                    Pro
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!filteredUsers.length && <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-[#64748B]">Keine User gefunden</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>
                {data?.earntrackUsers?.length > 0 && (
                  <Section title="Interne User" subtitle={`${data.earntrackUsers.length} @earntrack.de Accounts`}>
                    <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead><tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                            <td className="px-6 py-4">E-Mail</td><td className="px-6 py-4">Name</td><td className="px-6 py-4">Rolle</td><td className="px-6 py-4">Verifiziert</td><td className="px-6 py-4">Registriert</td>
                          </tr></thead>
                          <tbody>
                            {data.earntrackUsers.map((u: any) => (
                              <tr key={u.uid} className="border-b border-[#E2E8F0]/40 text-[#334155] last:border-0">
                                <td className="px-6 py-3.5 font-medium text-[#0F172A]">{u.email}</td>
                                <td className="px-6 py-3.5">{u.name !== '-' ? u.name : '-'}</td>
                                <td className="px-6 py-3.5">
                                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    u.role === 'owner' ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
                                  }`}>
                                    {u.role === 'owner' ? 'Admin' : 'Mitarbeiter'}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5">{u.emailVerified ? <span className="inline-flex items-center gap-1 text-[#0D9488]"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Ja</span> : <span className="text-[#64748B]">Nein</span>}</td>
                                <td className="px-6 py-3.5 text-xs text-[#64748B]">{fmtDate(u.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Section>
                )}
                <Section title="Demo-Anmeldungen" subtitle={`${data?.demos?.length || 0} insgesamt · ${k?.demoConversionRate || 0}% Conversion zu User`}>
                  <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                          <td className="px-6 py-4">Name</td><td className="px-6 py-4">E-Mail</td><td className="px-6 py-4">Firma</td><td className="px-6 py-4">Status</td><td className="px-6 py-4">Conversion</td><td className="px-6 py-4">Datum</td>
                        </tr></thead>
                        <tbody>
                          {(data?.demos||[]).map((d: any) => (
                            <tr key={d.id} className="border-b border-[#E2E8F0]/40 text-[#334155] last:border-0">
                              <td className="px-6 py-3.5 font-medium text-[#0F172A]">{d.name||'-'}</td>
                              <td className="px-6 py-3.5">{d.email||'-'}</td>
                              <td className="px-6 py-3.5">{d.companyName||'-'}</td>
                              <td className="px-6 py-3.5"><StatusBadge status={d.status||'pending'}/></td>
                              <td className="px-6 py-3.5">{d.userExists ? d.hasActivity ? <span className="inline-flex items-center gap-1 text-[#0D9488]"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Aktiv</span> : <span className="text-amber-400">Registriert</span> : <span className="text-[#64748B]">Offen</span>}</td>
                              <td className="px-6 py-3.5 text-xs text-[#64748B]">{fmtDate(d.createdAt)}</td>
                            </tr>
                          ))}
                          {(!data?.demos || !data.demos.length) && <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-[#64748B]">Keine Demo-Anmeldungen</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>
              </div>
            )}

            {/* ─── Website ─── */}
            {activeTab === 'website' && (
              <div className="space-y-8">
                {k.pageViews?.total > 0 ? (
                  <Section title="Website Besucher" subtitle="earntrack.de">
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Besuche gesamt', value: fmtK(k.pageViews.total), sub: `${k.pageViews.avgPerDay} / Tag` },
                          { label: 'Heute', value: fmtK(k.pageViews.today), sub: '' },
                          { label: 'Diese Woche', value: fmtK(k.pageViews.thisWeek), sub: '' },
                          { label: 'Seiten', value: String(k.topPages?.length || 0), sub: 'unterschiedliche' },
                        ].map(card => (
                          <div key={card.label} className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5 border-l-[3px] border-l-[#14B8A6]">
                            <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">{card.label}</p>
                            <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{card.value}</p>
                            {card.sub && <p className="mt-1 text-xs text-[#64748B]">{card.sub}</p>}
                          </div>
                        ))}
                      </div>
                      <ChartCard title="Seitenaufrufe pro Tag" subtitle={`Letzte ${timeRange} Tage`}>
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={k.pageViewsChartData || []}>
                            <defs><linearGradient id="pvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14B8A6" stopOpacity={0.15}/><stop offset="100%" stopColor="#14B8A6" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                            <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:10}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                            <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:10}} axisLine={false} tickLine={false}/>
                            <Tooltip content={<TTip valueKey="views" unit="Aufrufe"/>}/>
                            <Area type="monotone" dataKey="views" stroke="#14B8A6" strokeWidth={2} fill="url(#pvG)" dot={false}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    </div>
                  </Section>
                ) : (
                  <div className="flex items-center justify-center py-24">
                    <p className="text-sm text-[#64748B]">Noch keine Website-Besucherdaten vorhanden.</p>
                  </div>
                )}
              </div>
            )}

            {/* ─── Downloads ─── */}
            {activeTab === 'downloads' && (
              <DownloadsTab
                downloads={k?.downloads}
                range={downloadsRange}
                onRangeChange={setDownloadsRange}
                loading={loading}
              />
            )}

            {/* ─── Umsatz ─── */}
            {activeTab === 'umsatz' && (
              <div className="space-y-8">
                <Section title="Umsatz" subtitle="Monatliche Einnahmen">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {ch?.revenueData?.length ? (
                      <ChartCard title="Monatsumsatz" subtitle="Entwicklung der Einnahmen">
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={ch.revenueData}>
                            <defs><linearGradient id="rG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity={0.15}/><stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                            <XAxis dataKey="month" tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                            <YAxis tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtK(v)+'€'}/>
                            <Tooltip content={<TTip valueKey="value" unit="€" isEur />}/>
                            <Area type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={3} fill="url(#rG)"/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    ) : null}
                    {ch?.topCompaniesData?.length ? (
                      <ChartCard title="Top Firmen" subtitle="Umsatzstärkste Unternehmen">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={ch.topCompaniesData} layout="vertical" margin={{left:0,right:20}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5} horizontal={false}/>
                            <XAxis type="number" tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>fmtK(v)+'€'}/>
                            <YAxis type="category" dataKey="name" tick={{fill:'#334155',fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                            <Tooltip content={<TTip valueKey="revenue" unit="€" isEur/>}/>
                            <Bar dataKey="revenue" radius={[0,6,6,0]} maxBarSize={22} fill="#F59E0B"/>
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    ) : null}
                  </div>
                </Section>
                <Section title="Kennzahlen" subtitle="Aktuelle Metriken">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {ch?.invoiceStatusData?.length ? (
                      <ChartCard title="Rechnungsstatus" subtitle={`${k.totalInvoices} Rechnungen · ${eur(k.totalInvoiceRevenue)} Rechnungswert`}>
                        <PieChart height={240} width={300}><Pie data={ch.invoiceStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                          {ch.invoiceStatusData.map((_: any,i: number) => <Cell key={i} fill={PC[i%PC.length]}/>)}
                        </Pie><Tooltip/></PieChart>
                        <Legend data={ch.invoiceStatusData} />
                      </ChartCard>
                    ) : null}
                    {ch?.planData?.length ? (
                      <ChartCard title="Abonnement-Verteilung" subtitle={`${k.totalCompanies} Firmen`}>
                        <PieChart height={240} width={300}><Pie data={ch.planData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                          {ch.planData.map((_: any,i: number) => <Cell key={i} fill={C[i%C.length]}/>)}
                        </Pie><Tooltip/></PieChart>
                        <Legend data={ch.planData} />
                      </ChartCard>
                    ) : null}
                    {ch?.subscriptionStatusData?.length ? (
                      <ChartCard title="Account-Status" subtitle={`${k.totalCompanies} Firmen`}>
                        <PieChart height={240} width={300}><Pie data={ch.subscriptionStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                          {ch.subscriptionStatusData.map((_: any,i: number) => <Cell key={i} fill={PC[i%PC.length]}/>)}
                        </Pie><Tooltip/></PieChart>
                        <Legend data={ch.subscriptionStatusData} />
                      </ChartCard>
                    ) : null}
                  </div>
                </Section>
              </div>
            )}
          </>
        ) : null}
      </div>

      {selectedUser && <UserModal user={selectedUser} onClose={()=>setSelectedUser(null)} />}
      {batchProgress && <BatchProgressModal progress={batchProgress} />}
    </div>
  )
}

// ─── Components ───

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
      active
        ? 'bg-[#0F766E]/20 text-[#0D9488] shadow-sm'
        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0]/50'
    }`}>
      {children}
    </button>
  )
}

function NeusteUserBox({ signups }: { signups: { name: string; email: string; date: string; type: string }[] }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">Neue User</h2>
          <p className="text-[10px] text-[#64748B] mt-0.5">Letzte Registrierungen & Demo-Anmeldungen</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {signups.map((s, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/60 px-4 py-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.type === 'Registrierung' ? 'bg-[#0F766E]/20 text-[#0D9488]' : 'bg-[#8B5CF6]/20 text-[#8B5CF6]'}`}>
              {s.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#0F172A]">{s.name}</p>
              <p className="truncate text-[10px] text-[#64748B]">{s.email}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-medium text-[#64748B]">{fmtDate(s.date)}</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase leading-none ${s.type === 'Registrierung' ? 'bg-[#0F766E]/15 text-[#0D9488]' : 'bg-[#8B5CF6]/15 text-[#8B5CF6]'}`}>
                {s.type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UserGrowthComparison({ k }: { k: any }) {
  const today = k.newUsersToday ?? 0
  const yesterday = k.newUsersYesterday ?? 0
  const thisWeek = k.newUsersThisWeek ?? 0
  const lastWeek = k.newUsersLastWeek ?? 0
  const dayDiff = today - yesterday
  const weekDiff = thisWeek - lastWeek
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] p-5">
        <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Neue User heute</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-[#0F172A]">{today}</span>
          <span className={`flex items-center gap-1 text-sm font-bold ${dayDiff > 0 ? 'text-[#0D9488]' : dayDiff < 0 ? 'text-red-400' : 'text-[#64748B]'}`}>
            {dayDiff > 0 ? '▲' : dayDiff < 0 ? '▼' : '–'}
            {dayDiff !== 0 ? Math.abs(dayDiff) : ''} {dayDiff > 0 ? 'mehr' : dayDiff < 0 ? 'weniger' : ''} als gestern
          </span>
        </div>
        <p className="mt-1 text-xs text-[#64748B]">gestern: {yesterday}</p>
      </div>
      <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] p-5">
        <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Neue User diese Woche</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-[#0F172A]">{thisWeek}</span>
          <span className={`flex items-center gap-1 text-sm font-bold ${weekDiff > 0 ? 'text-[#0D9488]' : weekDiff < 0 ? 'text-red-400' : 'text-[#64748B]'}`}>
            {weekDiff > 0 ? '▲' : weekDiff < 0 ? '▼' : '–'}
            {weekDiff !== 0 ? Math.abs(weekDiff) : ''} {weekDiff > 0 ? 'mehr' : weekDiff < 0 ? 'weniger' : ''} als letzte Woche
          </span>
        </div>
        <p className="mt-1 text-xs text-[#64748B]">letzte Woche: {lastWeek}</p>
      </div>
    </div>
  )
}

function HeroRow({ k }: { k: any }) {
  const hero = [
    { label: 'Aktiv Heute', value: k.activeToday, sub: `${k.dauMau}% Stickiness`, color: 'border-l-[#0D9488]' },
    { label: 'Echte User', value: k.totalUsers, sub: `${k.verifiedCount} verifiziert · ${k.owners} Inhaber`, color: 'border-l-[#8B5CF6]' },
    { label: 'Stripe-Umsatz', value: eur(k.totalRevenue), sub: `${eur(k.currentMonthRevenue)} diesen Monat`, color: 'border-l-[#F59E0B]' },
    { label: 'Demo → User', value: `${k.demoConversionRate}%`, sub: `${k.demosConverted} von ${k.totalUsers} Usern`, color: 'border-l-[#EC4899]' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {hero.map(h => (
        <div key={h.label} className={`relative rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5 overflow-hidden group hover:border-[#0D9488]/20 transition-all duration-300 ${h.color} border-l-[3px]`}>
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">{h.label}</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{h.value}</p>
          <p className="mt-1 text-xs text-[#64748B]">{h.sub}</p>
          <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full opacity-[0.04] bg-white group-hover:opacity-[0.07] transition-opacity" />
        </div>
      ))}
    </div>
  )
}

function Header({ lastUpdated, onRefresh, timeRange, onTimeRangeChange, loading }: any) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-[#F8FAFC]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png?v=2" alt="EarnTrack" className="h-8 w-8 object-contain" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-black tracking-tight text-[#0F172A]">Analytics</h1>
              {lastUpdated && <span className="text-[10px] font-medium text-[#64748B]">· aktualisiert {lastUpdated.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}</span>}
            </div>
            <p className="text-[10px] text-[#64748B] -mt-0.5">EarnTrack Zentrale</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
            {[7,30,90].map(v => (
              <button key={v} onClick={()=>onTimeRangeChange(v)} className={`rounded-md px-4 py-2 text-xs font-bold transition ${timeRange===v ? 'bg-[#0F766E] text-white shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'}`}>{v}T</button>
            ))}
          </div>
          <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0D9488] transition hover:bg-[#E2E8F0] disabled:opacity-50">
            ⟳ {loading ? 'Lade...' : 'Aktualisieren'}
          </button>
        </div>
      </div>
    </header>
  )
}

function FullError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
        </div>
        <h2 className="text-lg font-bold text-[#0F172A]">Fehler beim Laden</h2>
        <p className="mt-1 text-sm text-[#64748B]">{message}</p>
        <button onClick={onRetry} className="mt-4 rounded-lg bg-[#0F766E] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0D9488]">Erneut versuchen</button>
      </div>
    </div>
  )
}

function BatchProgressModal({ progress }: { progress: { current: number; total: number; action: string; email?: string } }) {
  const pct = Math.round((progress.current / progress.total) * 100)
  const labels: Record<string, string> = { delete: 'Lösche', grantPro: 'Aktiviere Pro', removePro: 'Entferne Pro', endDemo: 'Beende Demo' }
  const label = labels[progress.action] || 'Bearbeite'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-8 shadow-2xl shadow-black/40 text-center">
        <div className="mb-5">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F8FAFC]">
            <svg className={`h-6 w-6 text-[#0D9488] ${progress.current < progress.total ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <p className="text-sm font-bold text-[#0F172A]">{label} User...</p>
          <p className="mt-1 text-xs text-[#64748B]">{progress.current} von {progress.total} · {pct}%</p>
          {progress.email && <p className="mt-2 text-xs font-medium text-[#334155] truncate max-w-[250px] mx-auto">{progress.email}</p>}
        </div>
        <div className="h-2 w-full rounded-full bg-[#F8FAFC] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#0F766E] to-[#0D9488] transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    active: 'border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0D9488]',
    expired: 'border-red-500/30 bg-red-500/10 text-red-400',
    cancelled: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
    pending: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  }
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${colors[status] || colors.pending}`}>
      {status === 'active' ? 'Pro' : status === 'trial' ? 'Trial' : status === 'expired' ? 'Expired' : status === 'cancelled' ? 'Gekündigt' : status}
    </span>
  )
}

function UserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [activity, setActivity] = useState<{ id: string; action: string; platform: string; at: number }[]>([])
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    setActivityLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'activity_events'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(200)),
      snap => {
        setActivity(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            action: data.action || '-',
            platform: data.platform || 'web',
            at: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
          }
        }))
        setActivityLoading(false)
      },
      () => setActivityLoading(false)
    )
    return unsub
  }, [user?.uid])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-2xl shadow-black/40" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">{user.name || user.email}</h2>
            <p className="text-xs text-[#64748B]">{user.email} · {user.companyName||'-'}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F8FAFC] text-[#64748B] transition hover:text-[#0F172A]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <InfoCard label="Status" value={<StatusBadge status={user.subscriptionStatus}/>}/>
            <InfoCard label="Rolle" value={user.role === 'owner' ? 'Inhaber' : 'Angestellter'}/>
            <InfoCard label="Letzte Aktivität" value={fmt(user.lastActive)}/>
            <InfoCard label="Aktionen" value={String(user.totalActions)}/>
            <InfoCard label="Plan" value={
              user.subscriptionStatus === 'active'
                ? 'Pro'
                : user.subscriptionPlan === 'trial' || !user.subscriptionPlan
                  ? 'Trial'
                  : user.subscriptionPlan
            }/>
            <InfoCard label="Registriert" value={fmtDate(user.createdAt)}/>
          </div>
          <InfoCard label="E-Mail bestätigt" value={user.emailVerified ? <span className="inline-flex items-center gap-1">Ja <Check className="w-3 h-3 inline text-green-600" /></span> : 'Nein'}/>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Aktivität · letzte {activity.length} von max. 200</p>
            <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              {activityLoading ? (
                <p className="py-4 text-center text-xs text-[#64748B]">Lade...</p>
              ) : activity.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#64748B]">Keine erfassten Aktionen</p>
              ) : (
                activity.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[#FFFFFF]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded-full border border-[#E2E8F0] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#64748B]">{a.platform}</span>
                      <span className={`truncate text-xs font-medium ${actionColor(a.action)}`}>{actionLabel(a.action)}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-[#64748B]">{fmt(new Date(a.at).toISOString())}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[#0F172A]">{value}</p>
    </div>
  )
}
