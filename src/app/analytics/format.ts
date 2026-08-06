import type { Platform } from '@/lib/analyticsAggregation'

export function fmt(d: string | undefined | null): string {
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
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDate(d: string | undefined | null): string {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function fmtK(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toLocaleString()
}

export function relTime(ms: number): string {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'Gerade eben'
  if (s < 60) return `Vor ${s} Sek.`
  const m = Math.floor(s / 60)
  if (m < 60) return `Vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `Vor ${h} Std.`
  return `Vor ${Math.floor(h / 24)} Tagen`
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Angemeldet',
  dashboard_view: 'App geöffnet',
  assignment_created: 'Termin erstellt',
  assignment_updated: 'Termin bearbeitet',
  assignment_deleted: 'Termin gelöscht',
  assignment_status_changed: 'Termin-Status geändert',
  employee_created: 'Mitarbeiter angelegt',
  employee_updated: 'Mitarbeiter bearbeitet',
  employee_deleted: 'Mitarbeiter gelöscht',
  customer_created: 'Kunde angelegt',
  customer_updated: 'Kunde bearbeitet',
  customer_deleted: 'Kunde gelöscht',
  invoice_created: 'Rechnung erstellt',
  invoice_status_changed: 'Rechnungsstatus geändert',
  estimate_created: 'Kostenvoranschlag erstellt',
  estimate_updated: 'Kostenvoranschlag bearbeitet',
  estimate_deleted: 'Kostenvoranschlag gelöscht',
  clock_in: 'Eingestempelt',
  clock_out: 'Ausgestempelt',
  clock_entry_created: 'Zeiteintrag erfasst',
  clock_entry_updated: 'Zeiteintrag korrigiert',
}

const ACTION_COLORS: Record<string, string> = {
  created: 'text-[#0D9488]',
  updated: 'text-blue-600',
  deleted: 'text-red-600',
  changed: 'text-amber-600',
  in: 'text-[#0D9488]',
  out: 'text-slate-600',
  view: 'text-slate-500',
  login: 'text-[#0D9488]',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action
}

export function actionColor(action: string): string {
  const suffix = action.split('_').pop() || ''
  return ACTION_COLORS[suffix] || 'text-[#334155]'
}

export const PLATFORM_LABELS: Record<Platform, string> = { web: 'Web', ios: 'iOS', android: 'Android' }

export const PLATFORM_COLORS: Record<Platform, string> = {
  web: 'bg-[#0D9488]/15 text-[#0D9488]',
  ios: 'bg-[#8B5CF6]/15 text-[#8B5CF6]',
  android: 'bg-amber-500/15 text-amber-600',
}
