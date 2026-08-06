'use client'

import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Platform } from '@/lib/analyticsAggregation'

export interface LiveActivityEntry {
  id: string
  uid: string
  action: string
  platform: Platform
  at: number
}

function toMs(v: any): number {
  if (!v) return 0
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v?.toMillis === 'function') return v.toMillis()
  return 0
}

export function useRecentActivity(limitCount: number): LiveActivityEntry[] {
  const [entries, setEntries] = useState<LiveActivityEntry[]>([])

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'activity_events'), orderBy('createdAt', 'desc'), limit(limitCount)),
      snap => {
        setEntries(snap.docs.map(d => {
          const data = d.data()
          const platform: Platform = data.platform === 'ios' || data.platform === 'android' ? data.platform : 'web'
          return {
            id: d.id,
            uid: data.uid || '',
            action: data.action || '-',
            platform,
            at: toMs(data.createdAt),
          }
        }))
      },
      () => {}
    )
    return unsub
  }, [limitCount])

  return entries
}
