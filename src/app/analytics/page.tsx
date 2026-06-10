'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { useData } from '@/app/Provider'
import { useIsAdmin } from '@/lib/useIsAdmin'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
const C = ['#087F63','#10D6A3','#35E9BA','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444','#14B8A6','#F97316','#6366F1','#84CC16']
const PC = ['#087F63','#F59E0B','#EF4444','#6B8A7C','#8B5CF6','#EC4899']

function fmt(d: string | undefined | null) {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  const diff = Date.now() - date.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Gerade eben'
  if (m < 60) return `Vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `Vor ${h} Std.`
  const days = Math.floor(h / 24)
  if (days < 30) return `Vor ${days} Tagen`
  return date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function fmtDate(d: string | undefined | null) {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function eur(n: number) {
  return new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', minimumFractionDigits:0, maximumFractionDigits:0 }).format(n)
}

function fmtK(num: number) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toLocaleString()
}

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useData()
  const isAdmin = useIsAdmin()
  const [adminChecked, setAdminChecked] = useState(false)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [timeRange, setTimeRange] = useState(30)
  const [data, setData] = useState<any>(null)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [sortField, setSortField] = useState('email')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; action: string; email?: string } | null>(null)

  const canView = isAdmin

  useEffect(() => {
    if (authLoading) return
    if (!user || !user.email) { router.replace('/login'); return }
  }, [user, authLoading])

  useEffect(() => {
    if (authLoading || !adminChecked) return
    if (!isAdmin) { router.replace('/dashboard'); return }
    auth.currentUser?.getIdToken().then(token => {
      if (token) fetch('/api/auth/session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken: token }) }).catch(()=>{})
    })
    loadData()
  }, [user, authLoading, timeRange, isAdmin, adminChecked])

  useEffect(() => {
    if (!authLoading) setAdminChecked(true)
  }, [authLoading])

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { setError('Nicht authentifiziert'); setLoading(false); return }
      const res = await fetch('/api/analytics/data', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timeRange }),
      })
      if (!res.ok) throw new Error((await res.json().catch(()=>{})).error || `HTTP ${res.status}`)
      setData(await res.json())
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message || 'Fehler beim Laden')
    } finally { setLoading(false) }
  }

  const filteredUsers = useMemo(() => {
    if (!data?.users) return []
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
  }, [data?.users, searchQuery, sortField, sortDir])

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
    const csv = [h.join(','), ...rows.map(r => h.map(k => { let v = String((r as any)[k]??''); // CSV injection protection: prefix =,+,@,- cells
    if (/^[=+\-@]/.test(v)) v = "'" + v; return v.includes(',')||v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v }).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'})); a.download = `earntrack-users-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const k = data?.kpis, ch = data?.charts

  if (authLoading) return <FullLoading />
  if (!canView) return null
  if (error) return <FullError message={error} onRetry={loadData} />

  return (
    <div className="min-h-screen bg-[#0A0F0D]">
      <Header lastUpdated={lastUpdated} onRefresh={loadData} timeRange={timeRange} onTimeRangeChange={setTimeRange} loading={loading} />

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 pb-16 pt-8">
        {loading && !lastUpdated ? (
          <div className="flex items-center justify-center py-40">
            <div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#10D6A3]/30 border-t-[#10D6A3]" /><p className="text-sm font-medium text-[#6B8A7C]">Lade Analysedaten...</p></div>
          </div>
        ) : k ? (
          <div className="space-y-10">
            {/* ─── Neuste User ─── */}
            {data?.recentSignups?.length > 0 && <NeusteUserBox signups={data.recentSignups} />}

            {/* ─── Neue User Vergleich ─── */}
            <UserGrowthComparison k={k} />

            {/* ─── Hero Metrics ─── */}
            <HeroRow k={k} />

            {/* ─── Website Besucher ─── */}
            {k.pageViews?.total > 0 && (
              <Section title="Website" subtitle="earntrack.de Besucher (nur mit Cookie-Zustimmung)">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Besuche gesamt', value: fmtK(k.pageViews.total), sub: `${k.pageViews.avgPerDay} / Tag` },
                      { label: 'Heute', value: fmtK(k.pageViews.today), sub: '' },
                      { label: 'Diese Woche', value: fmtK(k.pageViews.thisWeek), sub: '' },
                      { label: 'Seiten', value: String(k.topPages?.length || 0), sub: 'unterschiedliche' },
                    ].map(card => (
                      <div key={card.label} className="rounded-2xl border border-[#1A2B22] bg-gradient-to-br from-[#111B15] to-[#0A0F0D] px-6 py-5 border-l-[3px] border-l-[#35E9BA]">
                        <p className="text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">{card.label}</p>
                        <p className="mt-1 text-3xl font-black text-[#E8F0EC] tracking-tight">{card.value}</p>
                        {card.sub && <p className="mt-1 text-xs text-[#6B8A7C]">{card.sub}</p>}
                      </div>
                    ))}
                  </div>
                  <ChartCard title="Seitenaufrufe pro Tag" subtitle={`Letzte ${timeRange} Tage`}>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={k.pageViewsChartData || []}>
                        <defs><linearGradient id="pvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#35E9BA" stopOpacity={0.15}/><stop offset="100%" stopColor="#35E9BA" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1A2B22" strokeOpacity={0.5}/>
                        <XAxis dataKey="date" tick={{fill:'#6B8A7C',fontSize:10}} axisLine={{stroke:'#1A2B22'}} tickLine={false}/>
                        <YAxis allowDecimals={false} tick={{fill:'#6B8A7C',fontSize:10}} axisLine={false} tickLine={false}/>
                        <Tooltip content={<TTip valueKey="views" unit="Aufrufe"/>}/>
                        <Area type="monotone" dataKey="views" stroke="#35E9BA" strokeWidth={2} fill="url(#pvG)" dot={false}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              </Section>
            )}

            {/* ─── Nutzeraktivität ─── */}
            <Section title="Nutzeraktivität" subtitle={`Letzte ${timeRange} Tage`}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <ChartCard title="Täglich aktive User (DAU)" subtitle="Unique User pro Tag">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.dauData}>
                      <defs><linearGradient id="dauG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10D6A3" stopOpacity={0.15}/><stop offset="100%" stopColor="#10D6A3" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2B22" strokeOpacity={0.5}/>
                      <XAxis dataKey="label" tick={{fill:'#6B8A7C',fontSize:11}} axisLine={{stroke:'#1A2B22'}} tickLine={false}/>
                      <YAxis allowDecimals={false} tick={{fill:'#6B8A7C',fontSize:11}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<TTip valueKey="users" unit="aktive User"/>}/>
                      <Line type="monotone" dataKey="users" stroke="#10D6A3" strokeWidth={3} dot={false} activeDot={{r:6,fill:'#10D6A3',stroke:'#0A0F0D',strokeWidth:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Meistgenutzte Features" subtitle="Top 12 Aktionen">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.featureData} layout="vertical" margin={{left:0,right:16}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2B22" strokeOpacity={0.5} horizontal={false}/>
                      <XAxis type="number" tick={{fill:'#6B8A7C',fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis type="category" dataKey="name" tick={{fill:'#C5D9D0',fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                      <Tooltip content={<TTip valueKey="value" unit="Aufrufe"/>}/>
                      <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={20}>
                        {data.featureData.map((_: any,i: number) => <Cell key={i} fill={C[i%C.length]}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </Section>

            {/* ─── Wachstum & Umsatz ─── */}
            <Section title="Wachstum & Umsatz" subtitle="Kumulierte Registrierungen und monatliche Einnahmen">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <ChartCard title="User Growth" subtitle={`${timeRange} Tage`}>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data.growthData}>
                      <defs><linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#35E9BA" stopOpacity={0.12}/><stop offset="100%" stopColor="#35E9BA" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2B22" strokeOpacity={0.5}/>
                      <XAxis dataKey="label" tick={{fill:'#6B8A7C',fontSize:11}} axisLine={{stroke:'#1A2B22'}} tickLine={false}/>
                      <YAxis allowDecimals={false} tick={{fill:'#6B8A7C',fontSize:11}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<TTip valueKey="users" unit="User"/>}/>
                      <Line type="monotone" dataKey="users" stroke="#35E9BA" strokeWidth={3} dot={false} activeDot={{r:6,fill:'#35E9BA',stroke:'#0A0F0D',strokeWidth:3}} fill="url(#gG)"/>
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
                {ch?.revenueData?.length ? (
                  <ChartCard title="Monatsumsatz" subtitle="Entwicklung der Einnahmen">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={ch.revenueData}>
                        <defs><linearGradient id="rG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity={0.15}/><stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1A2B22" strokeOpacity={0.5}/>
                        <XAxis dataKey="month" tick={{fill:'#6B8A7C',fontSize:11}} axisLine={{stroke:'#1A2B22'}} tickLine={false}/>
                        <YAxis tick={{fill:'#6B8A7C',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtK(v)+'€'}/>
                        <Tooltip content={<TTip valueKey="value" unit="€" isEur />}/>
                        <Area type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={3} fill="url(#rG)"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                ) : null}
              </div>
            </Section>

            {/* ─── Geschäftsüberblick ─── */}
            <Section title="Geschäftsüberblick" subtitle="Verteilungen auf einen Blick">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {ch?.invoiceStatusData?.length ? (
                  <ChartCard title="Rechnungsstatus" subtitle={`${k.totalInvoices} Rechnungen · ${eur(k.totalRevenue)} gesamt`}>
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

            {/* ─── Top Firmen ─── */}
            {ch?.topCompaniesData?.length ? (
              <Section title="Top Firmen" subtitle="Umsatzstärkste Unternehmen">
                <ChartCard title="Umsatz nach Firma" subtitle="Top 10">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ch.topCompaniesData} layout="vertical" margin={{left:0,right:20}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2B22" strokeOpacity={0.5} horizontal={false}/>
                      <XAxis type="number" tick={{fill:'#6B8A7C',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>fmtK(v)+'€'}/>
                      <YAxis type="category" dataKey="name" tick={{fill:'#C5D9D0',fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                      <Tooltip content={<TTip valueKey="revenue" unit="€" isEur/>}/>
                      <Bar dataKey="revenue" radius={[0,6,6,0]} maxBarSize={22} fill="#F59E0B"/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Section>
            ) : null}

            {/* ─── User Tabelle ─── */}
            <Section title="User Verwaltung" subtitle={`${filteredUsers.length} echte User (gefiltert & dedupliziert)`}>
              <div className="rounded-2xl border border-[#1A2B22] bg-[#111B15] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1A2B22] px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B8A7C]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                      <input type="text" placeholder="Suchen..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-56 rounded-lg border border-[#1A2B22] bg-[#0A0F0D] pl-9 pr-3 py-2 text-sm text-[#E8F0EC] placeholder-[#6B8A7C] outline-none focus:border-[#10D6A3]/50 transition-colors"/>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedUids.size > 0 && (
                      <div className="flex items-center gap-2 mr-2">
                        <span className="text-xs font-semibold text-[#10D6A3]">{selectedUids.size} ausgewählt</span>
                        {filteredUsers.some((u: any) => selectedUids.has(u.uid) && u.subscriptionStatus !== 'active') && (
                          <button onClick={() => batchAction('grantPro')} disabled={batchLoading} className="rounded-lg border border-[#087F63] bg-[#087F63]/10 px-3 py-1.5 text-xs font-bold text-[#10D6A3] transition hover:bg-[#087F63]/20 disabled:opacity-50">
                            Pro geben
                          </button>
                        )}
                        {filteredUsers.some((u: any) => selectedUids.has(u.uid) && u.subscriptionStatus === 'active') && (
                          <button onClick={() => batchAction('removePro')} disabled={batchLoading} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50">
                            Pro entfernen
                          </button>
                        )}
                        {filteredUsers.some((u: any) => selectedUids.has(u.uid) && u.subscriptionStatus === 'trial') && (
                          <button onClick={() => batchAction('endDemo')} disabled={batchLoading} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                            Demo beenden
                          </button>
                        )}
                        <button onClick={() => batchAction('delete')} disabled={batchLoading} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                          Löschen
                        </button>
                      </div>
                    )}
                    <button onClick={exportCSV} className="flex items-center gap-2 rounded-lg border border-[#1A2B22] bg-[#0A0F0D] px-4 py-2 text-xs font-semibold text-[#10D6A3] transition hover:bg-[#1A2B22] hover:border-[#10D6A3]/30">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      CSV Export
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-[#1A2B22] text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">
                      <td className="px-3 py-4 w-10 sticky left-0 z-10 bg-[#111B15]">
                        <button onClick={(e) => { e.stopPropagation(); toggleSelectAll() }} className="h-4 w-4 rounded border border-[#1A2B22] flex items-center justify-center bg-[#0A0F0D] cursor-pointer hover:border-[#10D6A3]/50 transition-colors">
                          {selectedUids.size === filteredUsers.length && filteredUsers.length > 0 && (
                            <svg className="h-3 w-3 text-[#10D6A3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                          )}
                        </button>
                      </td>
                      <TH label="E-Mail / Name" field="email" current={sortField} dir={sortDir} onClick={toggleSort}/>
                      <TH label="Firma" field="companyName" current={sortField} dir={sortDir} onClick={toggleSort}/>
                      <TH label="Status" field="subscriptionStatus" current={sortField} dir={sortDir} onClick={toggleSort}/>
                      <TH label="Aktivität" field="lastActive" current={sortField} dir={sortDir} onClick={toggleSort}/>
                      <TH label="Verifiziert" field="emailVerified" current={sortField} dir={sortDir} onClick={toggleSort}/>
                      <td className="px-4 py-4 sticky right-0 z-10 bg-[#111B15] text-[10px] font-semibold text-[#6B8A7C]">Aktion</td>
                    </tr></thead>
                    <tbody>
                      {filteredUsers.map((u: any) => (
                        <tr key={u.uid} onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; setSelectedUser(u) }} className="cursor-pointer border-b border-[#1A2B22]/40 text-[#C5D9D0] transition hover:bg-[#1A2B22]/40 last:border-0 group">
                          <td className="px-3 py-3.5 sticky left-0 z-10 bg-[#0A0F0D]">
                            <button onClick={(e) => { e.stopPropagation(); toggleSelect(u.uid) }} className="h-4 w-4 rounded border border-[#1A2B22] flex items-center justify-center bg-[#0A0F0D] cursor-pointer hover:border-[#10D6A3]/50 transition-colors">
                              {selectedUids.has(u.uid) && (
                                <svg className="h-3 w-3 text-[#10D6A3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-[#E8F0EC] text-sm">{u.email}</div>
                            <div className="text-[11px] text-[#6B8A7C]">{u.name !== '-' ? u.name : ''}</div>
                          </td>
                          <td className="px-4 py-3.5 text-sm">{u.companyName}</td>
                          <td className="px-4 py-3.5"><StatusBadge status={u.subscriptionStatus}/></td>
                          <td className="px-4 py-3.5 text-xs text-[#6B8A7C]">{fmt(u.lastActive)}</td>
                          <td className="px-4 py-3.5">{u.emailVerified ? <span className="inline-flex items-center gap-1 text-[#10D6A3]"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Ja</span> : <span className="text-[#6B8A7C]">Nein</span>}</td>
                          <td className="px-3 py-3.5 sticky right-0 z-10 bg-[#0A0F0D]">
                              {u.subscriptionStatus === 'active' ? (
                              <button onClick={(e) => { e.stopPropagation(); batchAction('removePro', u.uid) }} disabled={batchLoading} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50 whitespace-nowrap">
                                Pro entfernen
                              </button>
                            ) : u.subscriptionStatus === 'trial' ? (
                              <button onClick={(e) => { e.stopPropagation(); batchAction('endDemo', u.uid) }} disabled={batchLoading} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50 whitespace-nowrap">
                                Demo beenden
                              </button>
                            ) : (
                              <button onClick={(e) => { e.stopPropagation(); batchAction('grantPro', u.uid) }} disabled={batchLoading} className="rounded-md border border-[#087F63]/30 bg-[#087F63]/10 px-2 py-1 text-[10px] font-bold text-[#10D6A3] transition hover:bg-[#087F63]/20 disabled:opacity-50 whitespace-nowrap">
                                Pro
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!filteredUsers.length && <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-[#6B8A7C]">Keine User gefunden</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            {/* ─── Demo Tabelle ─── */}
            <Section title="Demo-Anmeldungen" subtitle={`${data?.demos?.length || 0} insgesamt · ${k?.demoConversionRate || 0}% Conversion zu User`}>
              <div className="rounded-2xl border border-[#1A2B22] bg-[#111B15] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-[#1A2B22] text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">
                      <td className="px-6 py-4">Name</td><td className="px-6 py-4">E-Mail</td><td className="px-6 py-4">Firma</td><td className="px-6 py-4">Status</td><td className="px-6 py-4">Conversion</td><td className="px-6 py-4">Datum</td>
                    </tr></thead>
                    <tbody>
                      {(data?.demos||[]).map((d: any) => (
                        <tr key={d.id} className="border-b border-[#1A2B22]/40 text-[#C5D9D0] last:border-0">
                          <td className="px-6 py-3.5 font-medium text-[#E8F0EC]">{d.name||'-'}</td>
                          <td className="px-6 py-3.5">{d.email||'-'}</td>
                          <td className="px-6 py-3.5">{d.companyName||'-'}</td>
                          <td className="px-6 py-3.5"><StatusBadge status={d.status||'pending'}/></td>
                          <td className="px-6 py-3.5">{d.userExists ? d.hasActivity ? <span className="inline-flex items-center gap-1 text-[#10D6A3]"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Aktiv</span> : <span className="text-amber-400">Registriert</span> : <span className="text-[#6B8A7C]">Offen</span>}</td>
                          <td className="px-6 py-3.5 text-xs text-[#6B8A7C]">{fmtDate(d.createdAt)}</td>
                        </tr>
                      ))}
                      {(!data?.demos || !data.demos.length) && <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-[#6B8A7C]">Keine Demo-Anmeldungen</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>
          </div>
        ) : null}
      </div>

      {selectedUser && <UserModal user={selectedUser} onClose={()=>setSelectedUser(null)} />}
      {batchProgress && <BatchProgressModal progress={batchProgress} />}
    </div>
  )
}

// ─── Components ───

function NeusteUserBox({ signups }: { signups: { name: string; email: string; date: string; type: string }[] }) {
  return (
    <div className="rounded-2xl border border-[#1A2B22] bg-gradient-to-br from-[#111B15] to-[#0A0F0D] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#E8F0EC]">Neue User</h2>
          <p className="text-[10px] text-[#6B8A7C] mt-0.5">Letzte Registrierungen & Demo-Anmeldungen</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {signups.map((s, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#1A2B22] bg-[#0A0F0D]/60 px-4 py-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.type === 'Registrierung' ? 'bg-[#087F63]/20 text-[#10D6A3]' : 'bg-[#8B5CF6]/20 text-[#8B5CF6]'}`}>
              {s.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#E8F0EC]">{s.name}</p>
              <p className="truncate text-[10px] text-[#6B8A7C]">{s.email}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-medium text-[#6B8A7C]">{fmtDate(s.date)}</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase leading-none ${s.type === 'Registrierung' ? 'bg-[#087F63]/15 text-[#10D6A3]' : 'bg-[#8B5CF6]/15 text-[#8B5CF6]'}`}>
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
      <div className="rounded-2xl border border-[#1A2B22] bg-gradient-to-br from-[#111B15] to-[#0A0F0D] p-5">
        <p className="text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">Neue User heute</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-[#E8F0EC]">{today}</span>
          <span className={`flex items-center gap-1 text-sm font-bold ${dayDiff > 0 ? 'text-[#10D6A3]' : dayDiff < 0 ? 'text-red-400' : 'text-[#6B8A7C]'}`}>
            {dayDiff > 0 ? '▲' : dayDiff < 0 ? '▼' : '–'}
            {dayDiff !== 0 ? Math.abs(dayDiff) : ''} {dayDiff > 0 ? 'mehr' : dayDiff < 0 ? 'weniger' : ''} als gestern
          </span>
        </div>
        <p className="mt-1 text-xs text-[#6B8A7C]">gestern: {yesterday}</p>
      </div>
      <div className="rounded-2xl border border-[#1A2B22] bg-gradient-to-br from-[#111B15] to-[#0A0F0D] p-5">
        <p className="text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">Neue User diese Woche</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-[#E8F0EC]">{thisWeek}</span>
          <span className={`flex items-center gap-1 text-sm font-bold ${weekDiff > 0 ? 'text-[#10D6A3]' : weekDiff < 0 ? 'text-red-400' : 'text-[#6B8A7C]'}`}>
            {weekDiff > 0 ? '▲' : weekDiff < 0 ? '▼' : '–'}
            {weekDiff !== 0 ? Math.abs(weekDiff) : ''} {weekDiff > 0 ? 'mehr' : weekDiff < 0 ? 'weniger' : ''} als letzte Woche
          </span>
        </div>
        <p className="mt-1 text-xs text-[#6B8A7C]">letzte Woche: {lastWeek}</p>
      </div>
    </div>
  )
}

function HeroRow({ k }: { k: any }) {
  const hero = [
    { label: 'Aktiv Heute', value: k.activeToday, sub: `${k.dauMau}% Stickiness`, color: 'border-l-[#10D6A3]' },
    { label: 'Echte User', value: k.totalUsers, sub: `${k.verifiedCount} verifiziert · ${k.owners} Inhaber`, color: 'border-l-[#8B5CF6]' },
    { label: 'Stripe-Umsatz', value: eur(k.totalRevenue), sub: `${eur(k.currentMonthRevenue)} diesen Monat`, color: 'border-l-[#F59E0B]' },
    { label: 'Demo → User', value: `${k.demoConversionRate}%`, sub: `${k.demosConverted} von ${k.totalUsers} Usern`, color: 'border-l-[#EC4899]' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {hero.map(h => (
        <div key={h.label} className={`relative rounded-2xl border border-[#1A2B22] bg-gradient-to-br from-[#111B15] to-[#0A0F0D] px-6 py-5 overflow-hidden group hover:border-[#10D6A3]/20 transition-all duration-300 ${h.color} border-l-[3px]`}>
          <p className="text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">{h.label}</p>
          <p className="mt-1 text-3xl font-black text-[#E8F0EC] tracking-tight">{h.value}</p>
          <p className="mt-1 text-xs text-[#6B8A7C]">{h.sub}</p>
          <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full opacity-[0.04] bg-white group-hover:opacity-[0.07] transition-opacity" />
        </div>
      ))}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[#E8F0EC]">{title}</h2>
        <p className="text-xs text-[#6B8A7C] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1A2B22] bg-[#111B15] p-6 hover:border-[#1A2B22]/80 transition-colors">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#E8F0EC]">{title}</h3>
          <p className="text-[10px] text-[#6B8A7C] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex justify-center">{children}</div>
    </div>
  )
}

function Legend({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {data.map((d, i) => (
        <span key={d.name} className="inline-flex items-center gap-1.5 text-[10px] text-[#6B8A7C]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PC[i % PC.length] }} />
          {d.name} <strong className="text-[#C5D9D0]">{Math.round((d.value / total) * 100)}%</strong>
        </span>
      ))}
    </div>
  )
}

function TTip({ active, payload, label, labelKey = 'label', valueKey = 'users', unit = '', isEur }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  return (
    <div className="rounded-xl border border-[#1A2B22] bg-[#0A0F0D]/95 backdrop-blur-md px-4 py-3 text-sm shadow-2xl">
      <p className="font-bold text-[#E8F0EC]">{payload[0]?.payload?.[labelKey] || label}</p>
      <p className="mt-1 font-bold text-[#10D6A3]">{isEur ? eur(val) : val} {unit}</p>
    </div>
  )
}

function Header({ lastUpdated, onRefresh, timeRange, onTimeRangeChange, loading }: any) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#1A2B22] bg-[#0A0F0D]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png?v=2" alt="EarnTrack" className="h-8 w-8 object-contain" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-black tracking-tight text-[#E8F0EC]">Analytics</h1>
              {lastUpdated && <span className="text-[10px] font-medium text-[#6B8A7C]">· aktualisiert {lastUpdated.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}</span>}
            </div>
            <p className="text-[10px] text-[#6B8A7C] -mt-0.5">EarnTrack Zentrale</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[#1A2B22] bg-[#0A0F0D] p-0.5">
            {[7,30,90].map(v => (
              <button key={v} onClick={()=>onTimeRangeChange(v)} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${timeRange===v ? 'bg-[#087F63] text-white shadow-sm' : 'text-[#6B8A7C] hover:text-[#E8F0EC]'}`}>{v}T</button>
            ))}
          </div>
          <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-[#1A2B22] bg-[#0A0F0D] px-3 py-2 text-xs font-semibold text-[#10D6A3] transition hover:bg-[#1A2B22] disabled:opacity-50">
            ⟳ {loading ? 'Lade...' : 'Aktualisieren'}
          </button>
        </div>
      </div>
    </header>
  )
}

function TH({ label, field, current, dir, onClick }: { label: string; field: string; current: string; dir: string; onClick: (f: string) => void }) {
  const active = current === field
  return (
    <td className="px-4 py-4 cursor-pointer select-none" onClick={()=>onClick(field)}>
      <span className="flex items-center gap-1">
        {label}
        {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </td>
  )
}

function FullLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0A0F0D]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#10D6A3]/30 border-t-[#10D6A3]" />
        <p className="text-sm font-medium text-[#6B8A7C]">Wird geladen...</p>
      </div>
    </div>
  )
}

function FullError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0A0F0D]">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
        </div>
        <h2 className="text-lg font-bold text-[#E8F0EC]">Fehler beim Laden</h2>
        <p className="mt-1 text-sm text-[#6B8A7C]">{message}</p>
        <button onClick={onRetry} className="mt-4 rounded-lg bg-[#087F63] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#10D6A3]">Erneut versuchen</button>
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
      <div className="w-full max-w-sm rounded-2xl border border-[#1A2B22] bg-[#111B15] p-8 shadow-2xl shadow-black/40 text-center">
        <div className="mb-5">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#0A0F0D]">
            <svg className={`h-6 w-6 text-[#10D6A3] ${progress.current < progress.total ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <p className="text-sm font-bold text-[#E8F0EC]">{label} User...</p>
          <p className="mt-1 text-xs text-[#6B8A7C]">{progress.current} von {progress.total} · {pct}%</p>
          {progress.email && <p className="mt-2 text-xs font-medium text-[#C5D9D0] truncate max-w-[250px] mx-auto">{progress.email}</p>}
        </div>
        <div className="h-2 w-full rounded-full bg-[#0A0F0D] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#087F63] to-[#10D6A3] transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    active: 'border-[#10D6A3]/30 bg-[#10D6A3]/10 text-[#10D6A3]',
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
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#1A2B22] bg-[#111B15] shadow-2xl shadow-black/40" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#1A2B22] px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#E8F0EC]">{user.name || user.email}</h2>
            <p className="text-xs text-[#6B8A7C]">{user.email} · {user.companyName||'-'}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0A0F0D] text-[#6B8A7C] transition hover:text-[#E8F0EC]">✕</button>
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
          <InfoCard label="E-Mail bestätigt" value={user.emailVerified ? 'Ja ✓' : 'Nein'}/>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-[#1A2B22] bg-[#0A0F0D] px-4 py-3">
      <p className="text-[10px] font-semibold text-[#6B8A7C] uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[#E8F0EC]">{value}</p>
    </div>
  )
}
