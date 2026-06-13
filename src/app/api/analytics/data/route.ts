import { NextRequest, NextResponse } from 'next/server'
import admin from '@/lib/firebase-admin'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').filter(Boolean)

function daysAgo(d: number) {
  return new Date(Date.now() - d * 86400000).toISOString().split('T')[0]
}

function toObj(snap: any) {
  return snap.docs.map((d: any) => {
    const data = d.data()
    const obj: any = { id: d.id }
    for (const key of Object.keys(data)) {
      const val = data[key]
      if (val && typeof val === 'object' && val.toDate) {
        obj[key] = val.toDate().toISOString()
      } else if (val && typeof val === 'object' && val.seconds) {
        obj[key] = new Date(val.seconds * 1000).toISOString()
      } else {
        obj[key] = val
      }
    }
    return obj
  })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await admin.auth.verifyIdToken(authHeader)
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const timeRange = typeof body.timeRange === 'number' && body.timeRange > 0 ? Math.floor(body.timeRange) : 30
    const startDate = new Date(Date.now() - timeRange * 86400000)
    const start = daysAgo(timeRange)
    const db = admin.db

    const [
      usersSnap, companiesSnap, demosSnap, usageSnap,
      invoicesSnap, assignmentsSnap, employeesSnap,
      customersSnap, clockEntriesSnap, paymentRequestsSnap, estimatesSnap,
      pageViewsSnap,
    ] = await Promise.all([
      db.collection('users').where('createdAt', '>=', startDate).get(),
      db.collection('companies').where('createdAt', '>=', startDate).get(),
      db.collection('demo_signups').where('createdAt', '>=', startDate).get(),
      db.collection('usage_log').where('date', '>=', start).get(),
      db.collection('invoices').where('createdAt', '>=', startDate).get(),
      db.collection('assignments').where('createdAt', '>=', startDate).get(),
      db.collection('employees').where('createdAt', '>=', startDate).get(),
      db.collection('customers').where('createdAt', '>=', startDate).get(),
      db.collection('clock_entries').where('clockIn', '>=', startDate).get(),
      db.collection('payment_requests').where('createdAt', '>=', startDate).get(),
      db.collection('estimates').where('createdAt', '>=', startDate).get(),
      db.collection('page_views').where('date', '>=', start).get(),
    ])

    const users = toObj(usersSnap)
    const companies = toObj(companiesSnap)
    const demos = toObj(demosSnap)
    const usageLogs = toObj(usageSnap)
    const invoices = toObj(invoicesSnap)
    const assignments = toObj(assignmentsSnap)
    const employees = toObj(employeesSnap)
    const customers = toObj(customersSnap)
    const clockEntries = toObj(clockEntriesSnap)
    const paymentRequests = toObj(paymentRequestsSnap)
    const estimates = toObj(estimatesSnap)

    // ─── Alle User (dedupliziert) ───
    const realUsers = users.filter((u: any) => u.email)
    const seenEmails = new Set<string>()
    const allDeduped = realUsers.filter((u: any) => {
      const email = u.email.toLowerCase().trim()
      if (seenEmails.has(email)) return false
      seenEmails.add(email)
      return true
    })

    // ─── @earntrack.de User separieren ───
    const earntrackUsers = allDeduped.filter((u: any) => u.email.toLowerCase().endsWith('@earntrack.de'))
    const earntrackEmails = new Set(earntrackUsers.map((u: any) => u.email.toLowerCase().trim()))
    const dedupedUsers = allDeduped.filter((u: any) => !earntrackEmails.has(u.email.toLowerCase().trim()))

    // ─── User KPIs ───
    const verifiedReal = dedupedUsers.filter((u: any) => u.emailVerified === true).length
    const owners = dedupedUsers.filter((u: any) => u.role === 'owner').length
    const employees_role = dedupedUsers.filter((u: any) => u.role === 'employee').length
    const noCompany = dedupedUsers.filter((u: any) => !u.companyId).length
    const withPhoto = dedupedUsers.filter((u: any) => u.photoURL).length

    // ─── Usage KPIs ───
    const today = daysAgo(0)
    const weekAgo = daysAgo(7)
    const todayLogs = usageLogs.filter((l: any) => l.date === today)
    const todayUids = new Set(todayLogs.map((l: any) => l.uid))
    const weekUids = new Set(usageLogs.filter((l: any) => l.date >= weekAgo).map((l: any) => l.uid))
    const monthUids = new Set(usageLogs.map((l: any) => l.uid))
    const totalActionsAll = usageLogs.reduce((s: number, l: any) => s + (l.actions || 0), 0)
    const avgActionsPerUser = monthUids.size > 0 ? Math.round(totalActionsAll / monthUids.size) : 0
    const dauMau = monthUids.size > 0 ? Math.round((todayUids.size / monthUids.size) * 100) : 0

    // ─── Company KPIs ───
    const subs: Record<string, number> = { trial: 0, active: 0, expired: 0, cancelled: 0, past_due: 0, paused: 0 }
    const plans: Record<string, number> = {}
    let onboardingComplete = 0
    companies.forEach((c: any) => {
      const s = c.subscriptionStatus || 'trial'
      if (s in subs) subs[s]++
      const p = c.subscriptionPlan || 'none'
      plans[p] = (plans[p] || 0) + 1
      if (c.onboardingSeen === true) onboardingComplete++
    })
    const trialConversion = companies.length > 0
      ? Math.round((subs.active / companies.length) * 100)
      : 0

    // ─── Invoice KPIs (status only) ───
    const totalInvoices = invoices.length
    const invoiceStatuses: Record<string, number> = {}
    invoices.forEach((inv: any) => {
      const s = inv.status || 'unbekannt'
      invoiceStatuses[s] = (invoiceStatuses[s] || 0) + 1
    })

    // ─── Revenue from Stripe (approved payment_requests) ───
    const approvedPayments = paymentRequests.filter((pr: any) => pr.status === 'approved')
    const currentMonth = new Date().toISOString().slice(0, 7)
    let totalRevenue = 0
    let currentMonthRevenue = 0
    approvedPayments.forEach((pr: any) => {
      const amount = Number(pr.amount || 0) / 100
      totalRevenue += amount
      const ca = pr.createdAt ? String(pr.createdAt) : ''
      if (ca.startsWith(currentMonth)) currentMonthRevenue += amount
    })
    const openRevenue = paymentRequests
      .filter((pr: any) => pr.status === 'pending' || pr.status === 'open')
      .reduce((sum: number, pr: any) => sum + ((parseFloat(pr.amount) || 0) / 100), 0)

    // ─── Invoice revenue from invoices collection ───
    let totalInvoiceRevenue = 0
    invoices.forEach((inv: any) => {
      const v = inv.umsatz
      if (v != null) {
        const num = typeof v === 'string'
          ? parseFloat(v.replace(/\./g, '').replace(',', '.'))
          : Number(v)
        if (!isNaN(num)) totalInvoiceRevenue += num
      }
    })

    // ─── Assignment KPIs ───
    const totalAssignments = assignments.length
    const assignmentStatuses: Record<string, number> = {}
    let assignmentRevenue = 0
    assignments.forEach((a: any) => {
      const s = a.status || 'unbekannt'
      assignmentStatuses[s] = (assignmentStatuses[s] || 0) + 1
      const v = a.umsatz
      if (v != null) {
        const num = typeof v === 'string'
          ? parseFloat(v.replace(/\./g, '').replace(',', '.'))
          : Number(v)
        if (!isNaN(num)) assignmentRevenue += num
      }
    })

    // ─── Employee KPIs ───
    const totalEmployees = employees.length
    const companiesWithEmployees = new Set(employees.map((e: any) => e.companyId)).size
    const avgEmployeesPerCompany = companiesWithEmployees > 0 ? (totalEmployees / companiesWithEmployees).toFixed(1) : '0'
    const berufsfelder: Record<string, number> = {}
    employees.forEach((e: any) => {
      const b = e.berufsfeld || 'unbekannt'
      berufsfelder[b] = (berufsfelder[b] || 0) + 1
    })

    // ─── Customer KPIs ───
    const totalCustomers = customers.length
    const companiesWithCustomers = new Set(customers.map((c: any) => c.companyId)).size
    const avgCustomersPerCompany = companiesWithCustomers > 0 ? (totalCustomers / companiesWithCustomers).toFixed(1) : '0'

    // ─── Clock Entry KPIs ───
    const totalClockEntries = clockEntries.length
    let totalHoursTracked = 0
    clockEntries.forEach((e: any) => {
      if (e.clockIn && e.clockOut) {
        const start = new Date(e.clockIn).getTime()
        const end = new Date(e.clockOut).getTime()
        const breakMs = e.totalBreakMs ?? (e.breakMinutes ?? e.totalBreakMinutes ?? 0) * 60000
        totalHoursTracked += Math.max(0, (end - start - breakMs) / 3600000)
      }
    })
    const avgHoursPerEntry = clockEntries.length > 0 ? (totalHoursTracked / clockEntries.length).toFixed(1) : '0'
    const usersWithClockEntries = new Set(clockEntries.map((e: any) => e.userId)).size

    // ─── Payment Request KPIs ───
    const totalPaymentRequests = paymentRequests.length
    const paymentStatuses: Record<string, number> = {}
    let totalPaymentAmount = 0
    paymentRequests.forEach((pr: any) => {
      const s = pr.status || 'unbekannt'
      paymentStatuses[s] = (paymentStatuses[s] || 0) + 1
      totalPaymentAmount += (Number(pr.amount || 0) / 100)
    })

    // ─── Estimate KPIs ───
    const totalEstimates = estimates.length
    const convertedToInvoice = estimates.filter((e: any) => e.status === 'rechnung_erstellt' || e.invoiceId).length
    const estimateConversion = totalEstimates > 0 ? Math.round((convertedToInvoice / totalEstimates) * 100) : 0
    const estimateStatuses: Record<string, number> = {}
    estimates.forEach((e: any) => {
      const s = e.status || 'entwurf'
      estimateStatuses[s] = (estimateStatuses[s] || 0) + 1
    })

    // ─── Demo KPIs ───
    const demosConverted = demos.filter((d: any) =>
      dedupedUsers.some((u: any) => u.uid === d.uid || u.email === d.email)
    ).length
    const demoConversionRate = demos.length > 0 ? Math.round((demosConverted / demos.length) * 100) : 0

    // ─── DAU Chart ───
    const dauMap: Record<string, Set<string>> = {}
    usageLogs.forEach((l: any) => {
      if (!dauMap[l.date]) dauMap[l.date] = new Set()
      dauMap[l.date].add(l.uid)
    })
    const dauData = []
    for (let i = timeRange - 1; i >= 0; i--) {
      const d = daysAgo(i)
      dauData.push({
        label: new Date(Date.now() - i * 86400000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        users: dauMap[d]?.size || 0,
      })
    }

    // ─── Feature Chart ───
    const actionTotals: Record<string, number> = {}
    usageLogs.forEach((l: any) => {
      const counts = l.actionCounts
      if (counts && typeof counts === 'object') {
        Object.entries(counts).forEach(([a, c]) => {
          actionTotals[a] = (actionTotals[a] || 0) + (c as number)
        })
      } else if (l.lastAction) {
        actionTotals[l.lastAction] = (actionTotals[l.lastAction] || 0) + 1
      }
    })
    const featureData = Object.entries(actionTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, value]) => ({ name, value }))

    // ─── User Growth ───
    const sorted = dedupedUsers
      .map((u: any) => ({ date: u.createdAt ? new Date(u.createdAt) : null }))
      .filter((u: any) => u.date && !isNaN(u.date.getTime()))
      .sort((a: any, b: any) => a.date!.getTime() - b.date!.getTime())
    const growthData: { label: string; users: number }[] = []
    let count = 0
    let dayIndex = 0
    for (let i = timeRange - 1; i >= 0; i--) {
      const dayEnd = Date.now() - i * 86400000
      while (dayIndex < sorted.length && sorted[dayIndex].date.getTime() < dayEnd) {
        count++
        dayIndex++
      }
      growthData.push({
        label: new Date(dayEnd).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        users: count,
      })
    }

    // ─── Revenue over time ───
    const revenueByMonth: Record<string, number> = {}
    approvedPayments.forEach((pr: any) => {
      const ca = pr.createdAt ? String(pr.createdAt) : ''
      if (ca) {
        const month = ca.slice(0, 7)
        const amount = Number(pr.amount || 0) / 100
        revenueByMonth[month] = (revenueByMonth[month] || 0) + amount
      }
    })
    const revenueData = Object.entries(revenueByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }))

    // ─── Invoice status breakdown ───
    const invoiceStatusData = Object.entries(invoiceStatuses)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))

    // ─── Plan distribution ───
    const planData = Object.entries(plans)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))

    // ─── Top companies by revenue ───
    const revenueByCompany: Record<string, number> = {}
    approvedPayments.forEach((pr: any) => {
      if (pr.companyId) {
        const amount = Number(pr.amount || 0) / 100
        revenueByCompany[pr.companyId] = (revenueByCompany[pr.companyId] || 0) + amount
      }
    })
    const topCompaniesData = Object.entries(revenueByCompany)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([companyId, revenue]) => {
        const company = companies.find((c: any) => c.id === companyId)
        return { name: company?.name || companyId, revenue }
      })

    // ─── Subscription status breakdown ───
    const subscriptionStatusData = Object.entries(subs)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))

    // ─── Role split ───
    const roleData = [
      { name: 'Inhaber', value: owners },
      { name: 'Angestellte', value: employees_role },
    ]

    // ─── Usage map per uid ───
    const usageMap: Record<string, { lastActive: string | null; totalActions: number }> = {}
    usageLogs.forEach((l: any) => {
      if (!usageMap[l.uid]) usageMap[l.uid] = { lastActive: null, totalActions: 0 }
      const e = usageMap[l.uid]
      if (l.lastActive && (!e.lastActive || l.lastActive > e.lastActive)) e.lastActive = l.lastActive
      e.totalActions += (l.actions || 0)
    })

    // ─── Counts per company ───
    const empCountMap: Record<string, number> = {}
    employees.forEach((e: any) => { if (e.companyId) empCountMap[e.companyId] = (empCountMap[e.companyId] || 0) + 1 })
    const asgCountMap: Record<string, number> = {}
    assignments.forEach((a: any) => { if (a.companyId) asgCountMap[a.companyId] = (asgCountMap[a.companyId] || 0) + 1 })
    const custCountMap: Record<string, number> = {}
    customers.forEach((c: any) => { if (c.companyId) custCountMap[c.companyId] = (custCountMap[c.companyId] || 0) + 1 })

    // ─── Demos with activity ───
    const demosWithActivity = demos.map((d: any) => ({
      ...d,
      hasActivity: usageLogs.some((l: any) => l.uid === d.uid || l.uid === d.id),
      userExists: dedupedUsers.some((u: any) => u.uid === d.uid || u.email === d.email),
    }))

    // ─── Recent Signups (Top 10) ───
    const recentSignups = [
      ...dedupedUsers
        .filter((u: any) => u.createdAt)
        .map((u: any) => ({
          name: u.displayName || u.email?.split('@')[0] || 'Unbekannt',
          email: u.email || '-',
          date: u.createdAt,
          type: 'Registrierung' as const,
        })),
      ...demos
        .filter((d: any) => d.createdAt)
        .map((d: any) => ({
          name: d.name || d.email?.split('@')[0] || 'Unbekannt',
          email: d.email || '-',
          date: d.createdAt,
          type: 'Demo' as const,
        })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)

    // ─── New user comparisons ───
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6)
    const lastWeekStart = new Date(todayStart); lastWeekStart.setDate(lastWeekStart.getDate() - 13)
    const lastWeekEnd = new Date(todayStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)
    let newUsersToday = 0, newUsersYesterday = 0, newUsersThisWeek = 0, newUsersLastWeek = 0
    dedupedUsers.forEach((u: any) => {
      const created = u.createdAt ? new Date(u.createdAt) : null
      if (!created || isNaN(created.getTime())) return
      if (created >= todayStart) newUsersToday++
      if (created >= yesterdayStart && created < todayStart) newUsersYesterday++
      if (created >= weekStart) newUsersThisWeek++
      if (created >= lastWeekStart && created < lastWeekEnd) newUsersLastWeek++
    })

    // ─── Page view KPIs ───
    const pageViews = toObj(pageViewsSnap)
    const totalPageViews = pageViews.length
    const pageViewsToday = pageViews.filter((pv: any) => pv.date === today).length
    const pageViewsThisWeek = pageViews.filter((pv: any) => pv.date >= weekAgo).length
    const pageViewsByDate: Record<string, number> = {}
    const pageViewsByPath: Record<string, number> = {}
    pageViews.forEach((pv: any) => {
      pageViewsByDate[pv.date] = (pageViewsByDate[pv.date] || 0) + 1
      const p = pv.path || '/'
      pageViewsByPath[p] = (pageViewsByPath[p] || 0) + 1
    })
    const pageViewsChartData = Object.entries(pageViewsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, views: count }))
    const topPages = Object.entries(pageViewsByPath)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }))
    const uniqueDays = Object.keys(pageViewsByDate).length
    const avgViewsPerDay = uniqueDays > 0 ? Math.round(totalPageViews / uniqueDays) : 0

    return NextResponse.json({
      kpis: {
        pageViews: { total: totalPageViews, today: pageViewsToday, thisWeek: pageViewsThisWeek, avgPerDay: avgViewsPerDay },
        pageViewsChartData,
        topPages,
        newUsersToday,
        newUsersYesterday,
        newUsersThisWeek,
        newUsersLastWeek,
        activeToday: todayUids.size,
        activeWeek: weekUids.size,
        activeMonth: monthUids.size,
        totalUsers: dedupedUsers.length,
        verifiedRate: dedupedUsers.length > 0 ? Math.round((verifiedReal / dedupedUsers.length) * 100) : 0,
        verifiedCount: verifiedReal,
        subs,
        totalCompanies: companies.length,
        owners,
        employees_role,
        noCompany,
        withPhoto: withPhoto,
        totalInvoices,
        totalInvoiceRevenue: Math.round(totalInvoiceRevenue),
        totalRevenue: Math.round(totalRevenue),
        openRevenue: Math.round(openRevenue),
        currentMonthRevenue: Math.round(currentMonthRevenue),
        totalAssignments,
        assignmentRevenue: Math.round(assignmentRevenue),
        totalEmployees,
        avgEmployeesPerCompany,
        totalCustomers,
        avgCustomersPerCompany,
        totalClockEntries,
        totalHoursTracked: Math.round(totalHoursTracked * 10) / 10,
        avgHoursPerEntry,
        usersWithClockEntries,
        totalPaymentRequests,
        totalPaymentAmount: Math.round(totalPaymentAmount),
        totalEstimates,
        estimateConversion,
        demosConverted,
        demoConversionRate,
        trialConversion,
        dauMau,
        avgActionsPerUser,
        totalActionsAll,
        onboardingComplete,
        berufsfelder,
        invoiceStatuses,
        paymentStatuses,
        assignmentStatuses,
        estimateStatuses,
      },
      charts: {
        revenueData,
        invoiceStatusData,
        planData,
        subscriptionStatusData,
        topCompaniesData,
        roleData,
      },
      dauData,
      featureData,
      growthData,
      users: dedupedUsers.map((u: any) => {
        const uid = u.id || u.uid
        const company = companies.find((c: any) => c.id === u.companyId || c.id === uid)
        const usage = usageMap[uid]
        return {
          uid,
          email: u.email || '-',
          name: u.displayName || '-',
          emailVerified: u.emailVerified === true,
          lastActive: usage?.lastActive || null,
          totalActions: usage?.totalActions || 0,
          subscriptionStatus: company?.subscriptionStatus || 'trial',
          subscriptionPlan: company?.subscriptionPlan || '-',
          companyName: company?.name || '-',
          companyId: u.companyId || uid,
          employeesCount: empCountMap[u.companyId || uid] || 0,
          assignmentsCount: asgCountMap[u.companyId || uid] || 0,
          customersCount: custCountMap[u.companyId || uid] || 0,
          createdAt: u.createdAt || null,
          role: u.role || 'employee',
        }
      }),
      earntrackUsers: earntrackUsers.map((u: any) => {
        const uid = u.id || u.uid
        const company = companies.find((c: any) => c.id === u.companyId || c.id === uid)
        return {
          uid,
          email: u.email || '-',
          name: u.displayName || '-',
          emailVerified: u.emailVerified === true,
          companyName: company?.name || '-',
          createdAt: u.createdAt || null,
          role: u.role || 'employee',
        }
      }),
      demos: demosWithActivity,
      recentSignups,
    })
  } catch (e: any) {
    console.error('Analytics API error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
