export type Platform = 'web' | 'ios' | 'android'

export interface ActivityEventInput {
  uid: string
  action: string
  platform: Platform
  createdAt: string
}

export interface UserLite {
  uid: string
  email: string
  name: string
  companyName: string
}

export interface RecentActivityEntry {
  uid: string
  email: string
  name: string
  companyName: string
  action: string
  platform: Platform
  at: string
}

function normalizePlatform(platform: unknown): Platform {
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

function sortByCreatedAtDesc(events: ActivityEventInput[]): ActivityEventInput[] {
  return [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function buildRecentActivity(
  events: ActivityEventInput[],
  users: UserLite[],
  limitCount: number,
): RecentActivityEntry[] {
  const byUid = new Map(users.map(u => [u.uid, u]))
  return sortByCreatedAtDesc(events)
    .slice(0, limitCount)
    .map(e => {
      const u = byUid.get(e.uid)
      return {
        uid: e.uid,
        email: u?.email || '-',
        name: u?.name || '-',
        companyName: u?.companyName || '-',
        action: e.action,
        platform: normalizePlatform(e.platform),
        at: e.createdAt,
      }
    })
}

export interface PlatformBreakdown {
  web: number
  ios: number
  android: number
}

export function buildPlatformBreakdown(events: ActivityEventInput[]): PlatformBreakdown {
  const result: PlatformBreakdown = { web: 0, ios: 0, android: 0 }
  events.forEach(e => { result[normalizePlatform(e.platform)]++ })
  return result
}

export interface PlatformTrendPoint {
  date: string
  web: number
  ios: number
  android: number
}

function isoDaysAgo(fromIso: string, n: number): string {
  const d = new Date(`${fromIso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

export function buildPlatformTrend(events: ActivityEventInput[], days: number): PlatformTrendPoint[] {
  const today = new Date().toISOString().split('T')[0]
  const byDate: Record<string, PlatformBreakdown> = {}
  events.forEach(e => {
    const date = e.createdAt.slice(0, 10)
    if (!byDate[date]) byDate[date] = { web: 0, ios: 0, android: 0 }
    byDate[date][normalizePlatform(e.platform)]++
  })
  const trend: PlatformTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDaysAgo(today, i)
    const counts = byDate[date] || { web: 0, ios: 0, android: 0 }
    trend.push({ date, ...counts })
  }
  return trend
}

export function lastPlatformByUid(events: ActivityEventInput[]): Record<string, Platform> {
  const latest: Record<string, ActivityEventInput> = {}
  events.forEach(e => {
    const current = latest[e.uid]
    if (!current || e.createdAt > current.createdAt) latest[e.uid] = e
  })
  const result: Record<string, Platform> = {}
  Object.entries(latest).forEach(([uid, e]) => { result[uid] = normalizePlatform(e.platform) })
  return result
}

export interface StoreDownloadDoc {
  date: string
  platform: 'ios' | 'android'
  downloads: number
}

export interface DownloadsChartPoint {
  date: string
  ios: number
  android: number
}

export interface DownloadsSummary {
  configured: boolean
  totalCurrent: number
  totalPrevious: number
  deltaPct: number | null
  ios: number
  android: number
  chartData: DownloadsChartPoint[]
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

export function buildDownloadsSummary(
  docs: StoreDownloadDoc[],
  timeRangeDays: number,
  todayIso: string,
): DownloadsSummary {
  const configured = docs.length > 0
  const currentStart = isoDaysAgo(todayIso, timeRangeDays - 1)
  const previousEnd = isoDaysAgo(currentStart, 1)
  const previousStart = isoDaysAgo(currentStart, timeRangeDays)

  const currentDocs = docs.filter(d => inRange(d.date, currentStart, todayIso))
  const previousDocs = docs.filter(d => inRange(d.date, previousStart, previousEnd))

  const sum = (list: StoreDownloadDoc[]) => list.reduce((s, d) => s + d.downloads, 0)
  const sumPlatform = (list: StoreDownloadDoc[], platform: 'ios' | 'android') =>
    sum(list.filter(d => d.platform === platform))

  const totalCurrent = sum(currentDocs)
  const totalPrevious = sum(previousDocs)
  const deltaPct = totalPrevious === 0 ? null : Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100)

  const chartMap: Record<string, DownloadsChartPoint> = {}
  currentDocs.forEach(d => {
    if (!chartMap[d.date]) chartMap[d.date] = { date: d.date, ios: 0, android: 0 }
    chartMap[d.date][d.platform] += d.downloads
  })
  const chartData: DownloadsChartPoint[] = []
  for (let i = timeRangeDays - 1; i >= 0; i--) {
    const date = isoDaysAgo(todayIso, i)
    chartData.push(chartMap[date] || { date, ios: 0, android: 0 })
  }

  return {
    configured,
    totalCurrent,
    totalPrevious,
    deltaPct,
    ios: sumPlatform(currentDocs, 'ios'),
    android: sumPlatform(currentDocs, 'android'),
    chartData,
  }
}
