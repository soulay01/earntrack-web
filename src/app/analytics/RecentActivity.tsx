'use client'

import { useMemo } from 'react'
import { useRecentActivity } from './useRecentActivity'
import { relTime, PLATFORM_LABELS, PLATFORM_COLORS } from './format'

interface UserLite {
  uid: string
  email: string
  name: string
  companyName?: string
}

function joinUser(uid: string, users: UserLite[]): UserLite {
  return users.find(u => u.uid === uid) || { uid, email: '-', name: 'Unbekannt', companyName: '-' }
}

function initial(u: UserLite): string {
  const source = u.name !== '-' && u.name ? u.name : u.email
  return (source || '?').charAt(0).toUpperCase()
}

const FIVE_MIN_MS = 5 * 60 * 1000

export function LiveNowBar({ users }: { users: UserLite[] }) {
  const activity = useRecentActivity(50)
  const activeNow = useMemo(() => {
    const cutoff = Date.now() - FIVE_MIN_MS
    const seen = new Set<string>()
    return activity.filter(e => {
      if (e.at < cutoff || seen.has(e.uid)) return false
      seen.add(e.uid)
      return true
    })
  }, [activity])

  if (!activeNow.length) return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-gradient-to-r from-[#0F766E]/10 to-transparent px-5 py-3">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0D9488] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0D9488]" />
      </span>
      <p className="text-sm font-semibold text-[#0F172A]">{activeNow.length} Nutzer gerade aktiv</p>
      <div className="flex -space-x-2">
        {activeNow.slice(0, 8).map(e => {
          const u = joinUser(e.uid, users)
          return (
            <div
              key={e.uid}
              title={u.name !== '-' ? u.name : u.email}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#F8FAFC] bg-[#0F766E]/20 text-[10px] font-bold text-[#0D9488]"
            >
              {initial(u)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RecentActivityCard({ users }: { users: UserLite[] }) {
  const activity = useRecentActivity(50)
  const latestPerUser = useMemo(() => {
    const seen = new Set<string>()
    return activity.filter(e => {
      if (seen.has(e.uid)) return false
      seen.add(e.uid)
      return true
    }).slice(0, 8)
  }, [activity])

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-6">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-[#0F172A]">Zuletzt aktive Nutzer</h2>
        <p className="text-[10px] text-[#64748B] mt-0.5">Live, nach letzter Aktion sortiert</p>
      </div>
      {!latestPerUser.length ? (
        <p className="py-6 text-center text-xs text-[#64748B]">Noch keine Aktivität erfasst</p>
      ) : (
        <div className="space-y-2">
          {latestPerUser.map(e => {
            const u = joinUser(e.uid, users)
            return (
              <div key={e.uid} className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/60 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F766E]/15 text-xs font-bold text-[#0D9488]">
                  {initial(u)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0F172A]">{u.name !== '-' ? u.name : u.email}</p>
                  <p className="truncate text-[10px] text-[#64748B]">{u.companyName && u.companyName !== '-' ? u.companyName : u.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PLATFORM_COLORS[e.platform]}`}>
                    {PLATFORM_LABELS[e.platform]}
                  </span>
                  <p className="mt-1 text-[10px] text-[#64748B]">{relTime(e.at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
