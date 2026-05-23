'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from './Provider';

export default function Home() {
  const { user, loading } = useData();
  const router = useRouter();
  useEffect(() => { if (!loading) router.replace(user ? '/dashboard' : '/login'); }, [user, loading, router]);
  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50 to-emerald-50">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.png" alt="EarnTrack" className="w-12 h-12 rounded-full object-cover shadow-xl shadow-teal-200/30" />
        <div className="flex gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
