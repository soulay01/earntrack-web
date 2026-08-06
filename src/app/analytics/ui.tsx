'use client'

import { eur } from './format'

export const C = ['#0F766E','#0D9488','#14B8A6','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444','#14B8A6','#F97316','#6366F1','#84CC16']
export const PC = ['#0F766E','#F59E0B','#EF4444','#64748B','#8B5CF6','#EC4899']

export function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[#0F172A]">{title}</h2>
        <p className="text-xs text-[#64748B] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-6 hover:border-[#E2E8F0]/80 transition-colors">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>
          <p className="text-[10px] text-[#64748B] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex justify-center">{children}</div>
    </div>
  )
}

export function Legend({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {data.map((d, i) => (
        <span key={d.name} className="inline-flex items-center gap-1.5 text-[10px] text-[#64748B]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PC[i % PC.length] }} />
          {d.name} <strong className="text-[#334155]">{Math.round((d.value / total) * 100)}%</strong>
        </span>
      ))}
    </div>
  )
}

export function TTip({ active, payload, label, labelKey = 'label', valueKey = 'users', unit = '', isEur }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/95 backdrop-blur-md px-4 py-3 text-sm shadow-2xl">
      <p className="font-bold text-[#0F172A]">{payload[0]?.payload?.[labelKey] || label}</p>
      <p className="mt-1 font-bold text-[#0D9488]">{isEur ? eur(val) : val} {unit}</p>
    </div>
  )
}

export function TH({ label, field, current, dir, onClick }: { label: string; field: string; current: string; dir: string; onClick: (f: string) => void }) {
  const active = current === field
  return (
    <td className="px-4 py-4 cursor-pointer select-none" onClick={() => onClick(field)}>
      <span className="flex items-center gap-1">
        {label}
        {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </td>
  )
}
