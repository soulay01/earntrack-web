'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setIsAdmin(false); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  return isAdmin;
}
