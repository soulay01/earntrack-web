'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setIsAdmin(false); setLoading(false); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return { isAdmin, loading };
}
