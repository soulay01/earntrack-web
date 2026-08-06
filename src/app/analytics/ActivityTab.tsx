'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { Section, ChartCard, TTip, TH, C } from './ui'
import { actionLabel, fmt, PLATFORM_LABELS, PLATFORM_COLORS } from './format'
import type { RecentActivityEntry, PlatformBreakdown, PlatformTrendPoint } from '@/lib/analyticsAggregation'

interface Props {
  timeRange: number
  dauData: { label: string; users: number }[]
  featureData: { name: string; value: number }[]
  platformBreakdown: PlatformBreakdown | undefined
  platformTrend: PlatformTrendPoint[]
  recentActivity: RecentActivityEntry[]
}

const PLATFORM_PIE_COLORS = ['#0D9488', '#8B5CF6', '#F59E0B']

export default function ActivityTab({ timeRange, dauData, featureData, platformBreakdown, platformTrend, recentActivity }: Props) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const platformPieData = useMemo(() => {
    if (!platformBreakdown) return []
    return [
      { name: 'Web', value: platformBreakdown.web },
      { name: 'iOS', value: platformBreakdown.ios },
      { name: 'Android', value: platformBreakdown.android },
    ].filter(d => d.value > 0)
  }, [platformBreakdown])

  const filtered = useMemo(() => {
    let list = [...recentActivity]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e => e.email.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.companyName.toLowerCase().includes(q))
    }
    list.sort((a: any, b: any) => {
      const va = String(a[sortField] || ''), vb = String(b[sortField] || '')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [recentActivity, search, sortField, sortDir])

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  return (
    <div className="space-y-8">
      <Section title="Nutzeraktivität" subtitle={`Letzte ${timeRange} Tage`}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Täglich aktive User (DAU)" subtitle="Unique User pro Tag">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                <XAxis dataKey="label" tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                <Tooltip content={<TTip valueKey="users" unit="aktive User"/>}/>
                <Line type="monotone" dataKey="users" stroke="#0D9488" strokeWidth={3} dot={false} activeDot={{r:6,fill:'#0D9488',stroke:'#F8FAFC',strokeWidth:3}}/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Meistgenutzte Features" subtitle="Top 12 Aktionen">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={featureData} layout="vertical" margin={{left:0,right:16}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5} horizontal={false}/>
                <XAxis type="number" tick={{fill:'#64748B',fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fill:'#334155',fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                <Tooltip content={<TTip valueKey="value" unit="Aufrufe"/>}/>
                <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={20}>
                  {featureData.map((_, i) => <Cell key={i} fill={C[i % C.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      <Section title="Plattformen" subtitle="Web vs. iOS vs. Android">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Verteilung" subtitle="Aktionen im Zeitraum">
            <PieChart height={240} width={300}>
              <Pie data={platformPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                {platformPieData.map((_, i) => <Cell key={i} fill={PLATFORM_PIE_COLORS[i % PLATFORM_PIE_COLORS.length]}/>)}
              </Pie>
              <Tooltip/>
            </PieChart>
          </ChartCard>
          <ChartCard title="Verlauf" subtitle={`Letzte ${timeRange} Tage`}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={platformTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
                <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:10}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}/>
                <Area type="monotone" dataKey="web" name="Web" stackId="p" stroke="#0D9488" fill="#0D9488" fillOpacity={0.25}/>
                <Area type="monotone" dataKey="ios" name="iOS" stackId="p" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25}/>
                <Area type="monotone" dataKey="android" name="Android" stackId="p" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.25}/>
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      <Section title="Zuletzt aktiv" subtitle={`${filtered.length} Ereignisse`}>
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
          <div className="border-b border-[#E2E8F0] px-6 py-4">
            <div className="relative w-56">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="w-56 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 py-2 text-sm text-[#0F172A] placeholder-[#64748B] outline-none focus:border-[#0D9488]/50 transition-colors"/>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                <TH label="Nutzer" field="email" current={sortField} dir={sortDir} onClick={toggleSort}/>
                <td className="px-4 py-4">Aktion</td>
                <TH label="Plattform" field="platform" current={sortField} dir={sortDir} onClick={toggleSort}/>
                <TH label="Zeit" field="at" current={sortField} dir={sortDir} onClick={toggleSort}/>
              </tr></thead>
              <tbody>
                {filtered.slice(0, 200).map((e, i) => (
                  <tr key={`${e.uid}_${e.at}_${i}`} className="border-b border-[#E2E8F0]/40 text-[#334155] last:border-0">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-[#0F172A] text-sm">{e.name !== '-' ? e.name : e.email}</div>
                      <div className="text-[11px] text-[#64748B]">{e.companyName !== '-' ? e.companyName : ''}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">{actionLabel(e.action)}</td>
                    <td className="px-4 py-3.5"><span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PLATFORM_COLORS[e.platform]}`}>{PLATFORM_LABELS[e.platform]}</span></td>
                    <td className="px-4 py-3.5 text-xs text-[#64748B]">{fmt(e.at)}</td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={4} className="px-4 py-16 text-center text-sm text-[#64748B]">Keine Aktivität im Zeitraum</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
