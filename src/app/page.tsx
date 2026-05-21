'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from './Provider';

export default function Home() {
  const { user, loading } = useData();
  const router = useRouter();
  useEffect(() => { if (!loading) router.replace(user ? '/dashboard' : '/login'); }, [user, loading, router]);
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100">
      <div className="text-slate-400 text-sm animate-pulse">Laden...</div>
    </div>
  );
}
