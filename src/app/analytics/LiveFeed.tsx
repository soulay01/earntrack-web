'use client'

import { useEffect, useRef, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type FeedEvent = {
  id: string
  kind: 'registrierung' | 'zahlung' | 'demo' | 'upgrade' | 'kuendigung'
  label: string
  sublabel: string
  at: number
}

const KIND_STYLE: Record<FeedEvent['kind'], { bg: string; text: string; dot: string }> = {
  registrierung: { bg: 'bg-[#0F766E]/15', text: 'text-[#0D9488]', dot: '#0D9488' },
  zahlung: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: '#F59E0B' },
  demo: { bg: 'bg-[#8B5CF6]/15', text: 'text-[#8B5CF6]', dot: '#8B5CF6' },
  upgrade: { bg: 'bg-[#0D9488]/15', text: 'text-[#0D9488]', dot: '#0D9488' },
  kuendigung: { bg: 'bg-red-500/15', text: 'text-red-400', dot: '#EF4444' },
}

const KIND_LABEL: Record<FeedEvent['kind'], string> = {
  registrierung: 'Registrierung',
  zahlung: 'Zahlung',
  demo: 'Demo-Anmeldung',
  upgrade: 'Upgrade',
  kuendigung: 'Kündigung',
}

function relTime(ms: number) {
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

function toMs(v: any): number {
  if (!v) return 0
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v?.toMillis === 'function') return v.toMillis()
  const d = new Date(v)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const seenCompanyStatus = useRef<Map<string, string>>(new Map())
  const initialized = useRef(false)

  function pushEvent(ev: FeedEvent) {
    setEvents(prev => {
      if (prev.some(e => e.id === ev.id)) return prev
      const next = [ev, ...prev].sort((a, b) => b.at - a.at).slice(0, 30)
      return next
    })
    if (initialized.current) {
      setNewIds(prev => new Set(prev).add(ev.id))
      setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(ev.id); return n }), 3000)
    }
  }

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `user_${ch.doc.id}`,
            kind: 'registrierung',
            label: d.name || d.email || 'Unbekannt',
            sublabel: d.email || '',
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      query(collection(db, 'payment_requests'), orderBy('submittedAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `payment_${ch.doc.id}`,
            kind: 'zahlung',
            label: d.userEmail || 'Unbekannt',
            sublabel: d.plan || '',
            at: toMs(d.submittedAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      query(collection(db, 'demo_signups'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `demo_${ch.doc.id}`,
            kind: 'demo',
            label: d.name || 'Unbekannt',
            sublabel: d.email || '',
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      collection(db, 'companies'),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added' && ch.type !== 'modified') return
          const d = ch.doc.data()
          const status = d.subscriptionStatus || ''
          const prev = seenCompanyStatus.current.get(ch.doc.id)
          seenCompanyStatus.current.set(ch.doc.id, status)
          if (prev === undefined) return // Initial-Snapshot: keine Historie, kein Event
          if (prev === status) return
          if (status === 'active' && prev !== 'active') {
            pushEvent({ id: `upgrade_${ch.doc.id}_${Date.now()}`, kind: 'upgrade', label: d.name || ch.doc.id, sublabel: d.subscriptionPlan || 'Pro', at: Date.now() })
          } else if ((status === 'expired' || status === 'cancelled') && prev === 'active') {
            pushEvent({ id: `cancel_${ch.doc.id}_${Date.now()}`, kind: 'kuendigung', label: d.name || ch.doc.id, sublabel: '', at: Date.now() })
          }
        })
        initialized.current = true
      },
      () => {}
    ))

    return () => unsubs.forEach(u => u())
  }, [])

  if (!events.length) return null

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0D9488] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0D9488]" />
        </span>
        <h2 className="text-sm font-bold text-[#0F172A]">Live-Aktivität</h2>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {events.map(ev => {
          const s = KIND_STYLE[ev.kind]
          const isNew = newIds.has(ev.id)
          return (
            <div
              key={ev.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-700 ${
                isNew ? 'border-[#0D9488]/50 bg-[#0F766E]/10' : 'border-[#E2E8F0] bg-[#F8FAFC]/60'
              }`}
            >
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${s.bg} ${s.text}`}>
                {KIND_LABEL[ev.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#0F172A]">{ev.label}</p>
                {ev.sublabel && <p className="truncate text-[10px] text-[#64748B]">{ev.sublabel}</p>}
              </div>
              <span className="shrink-0 text-[10px] font-medium text-[#64748B]">{relTime(ev.at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
