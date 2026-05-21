'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useData } from '@/app/Provider';
import { useState } from 'react';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { href: '/assignments', label: 'Einsätze', icon: 'briefcase' },
  { href: '/employees', label: 'Mitarbeiter', icon: 'users' },
  { href: '/customers', label: 'Kunden', icon: 'building' },
  { href: '/settings', label: 'Einstellungen', icon: 'settings' },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const cl = className || 'w-5 h-5';
  const props = { className: cl, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'grid': return <svg {...props}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
    case 'briefcase': return <svg {...props}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>;
    case 'users': return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'building': return <svg {...props}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01" /></svg>;
    case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

export default function Sidebar() {
  const { user, logout } = useData();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed lg:sticky top-0 left-0 z-50 w-64 h-screen bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="px-5 h-16 flex items-center border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white font-black text-sm">E</div>
            <div>
              <p className="text-slate-900 font-bold text-sm tracking-tight">EarnTrack</p>
              <p className="text-slate-400 text-[10px] font-medium uppercase tracking-wider">Business</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Navigation</p>
          {links.map(l => {
            const active = path === l.href || (l.href !== '/dashboard' && path.startsWith(l.href + '/'));
            return (
              <a key={l.href} href={l.href} onClick={e => { e.preventDefault(); router.push(l.href); setOpen(false); }}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className={`shrink-0 ${active ? 'text-teal-600' : 'text-slate-400 group-hover:text-slate-500'}`}>
                  <Icon name={l.icon} />
                </span>
                <span>{l.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-600" />}
              </a>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-slate-200">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-500 text-xs font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => logout()} className="mt-1 w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-150">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white sticky top-0 z-30">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white font-black text-xs">E</div>
          <span className="text-slate-900 font-bold text-sm">EarnTrack</span>
        </div>
      </header>
    </>
  );
}
