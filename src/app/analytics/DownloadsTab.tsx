'use client'

import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { ChartCard } from './ui'
import type { DownloadsSummary } from '@/lib/analyticsAggregation'

const RANGE_OPTIONS = [1, 7, 30, 90] as const
const RANGE_LABELS: Record<number, string> = { 1: 'Heute', 7: '7T', 30: '30T', 90: '90T' }

interface Props {
  downloads: DownloadsSummary | undefined
  range: number
  onRangeChange: (days: number) => void
  loading: boolean
}

export default function DownloadsTab({ downloads, range, onRangeChange, loading }: Props) {
  if (!downloads?.configured) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-10 text-center">
        <h2 className="text-base font-bold text-[#0F172A]">Downloads noch nicht verbunden</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#64748B]">
          Es liegen noch keine Downloadzahlen vor. Dafür braucht es einen API Key aus App Store Connect
          und einen Service Account aus der Google Play Console.
        </p>
        <ol className="mx-auto mt-6 max-w-md space-y-2 text-left text-xs text-[#64748B] list-decimal list-inside">
          <li>In App Store Connect unter &bdquo;Nutzer und Zugriff → Integrationen&ldquo; einen API Key mit Rolle &bdquo;Finance&ldquo; oder &bdquo;Sales&ldquo; erstellen.</li>
          <li>In der Google Play Console unter &bdquo;Setup → API-Zugriff&ldquo; einen Service Account mit Zugriff auf &bdquo;Statistiken&ldquo; anlegen.</li>
          <li>Beide Zugangsdaten als Firebase-Functions-Secrets hinterlegen (APPSTORE_CONNECT_KEY_ID/ISSUER_ID/PRIVATE_KEY, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).</li>
        </ol>
      </div>
    )
  }

  const deltaLabel = downloads.deltaPct === null ? 'neu' : `${downloads.deltaPct > 0 ? '+' : ''}${downloads.deltaPct}%`
  const deltaColor = downloads.deltaPct === null ? 'text-[#64748B]' : downloads.deltaPct >= 0 ? 'text-[#0D9488]' : 'text-red-500'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Downloads</h2>
        <div className="flex rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
          {RANGE_OPTIONS.map(v => (
            <button key={v} onClick={() => onRangeChange(v)} disabled={loading} className={`rounded-md px-4 py-2 text-xs font-bold transition ${range === v ? 'bg-[#0F766E] text-white shadow-sm' : 'text-[#64748B] hover:text-[#0F172A]'}`}>
              {RANGE_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5 border-l-[3px] border-l-[#0D9488]">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Downloads gesamt</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.totalCurrent.toLocaleString('de-DE')}</p>
          <p className={`mt-1 text-xs font-bold ${deltaColor}`}>{deltaLabel} ggü. Vorperiode</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">iOS</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.ios.toLocaleString('de-DE')}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Android</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.android.toLocaleString('de-DE')}</p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] px-6 py-5">
          <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Vorperiode</p>
          <p className="mt-1 text-3xl font-black text-[#0F172A] tracking-tight">{downloads.totalPrevious.toLocaleString('de-DE')}</p>
        </div>
      </div>

      <ChartCard title="Downloads pro Tag" subtitle="Nach Plattform">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={downloads.chartData}>
            <defs>
              <linearGradient id="iosG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={0.25}/><stop offset="100%" stopColor="#0D9488" stopOpacity={0}/></linearGradient>
              <linearGradient id="androidG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25}/><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5}/>
            <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:10}} axisLine={{stroke:'#E2E8F0'}} tickLine={false}/>
            <YAxis allowDecimals={false} tick={{fill:'#64748B',fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}/>
            <Area type="monotone" dataKey="ios" name="iOS" stackId="dl" stroke="#0D9488" strokeWidth={2} fill="url(#iosG)"/>
            <Area type="monotone" dataKey="android" name="Android" stackId="dl" stroke="#8B5CF6" strokeWidth={2} fill="url(#androidG)"/>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
