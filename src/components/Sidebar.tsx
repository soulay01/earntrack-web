'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useData } from '@/app/Provider';
import { useState } from 'react';

const mainLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { href: '/assignments', label: 'Termine', icon: 'briefcase' },
  { href: '/employees', label: 'Mitarbeiter', icon: 'users' },
  { href: '/customers', label: 'Kunden', icon: 'building' },
];

const projectLinks = [
  { href: '/projects', label: 'Meine Projekte', icon: 'folder' },
  { href: '/estimates', label: 'Kostenvoranschlag', icon: 'file' },
];

const settingsLinks = [
  { href: '/settings', label: 'Einstellungen', icon: 'settings' },
];

const extraLinks = [
  { href: '/settings/employee-credentials', label: 'Zugangsdaten', icon: 'key' },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const cl = className || 'w-5 h-5';
  const p = { className: cl, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'grid': return <svg {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
    case 'briefcase': return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>;
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'building': return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01" /></svg>;
    case 'settings': return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'file': return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'folder': return <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    case 'key': return <svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

function NavSection({ label }: { label: string }) {
  return <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>;
}

function NavLink({ href, label, icon, path, onNavigate }: { href: string; label: string; icon: string; path: string; onNavigate: () => void }) {
  const active = path === href || (href !== '/dashboard' && href !== '/projects' && path.startsWith(href + '/'));
  return (
    <a href={href} onClick={e => { e.preventDefault(); onNavigate(); }}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
        active
          ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 shadow-sm border border-teal-200'
          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 hover:shadow-sm border border-transparent'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-gradient-to-b from-teal-500 to-emerald-400" />}
      <span className={`shrink-0 transition-transform duration-200 ${active ? 'text-teal-600 scale-110' : 'text-slate-400 group-hover:text-slate-500 group-hover:scale-110'}`}>
        <Icon name={icon} />
      </span>
      <span>{label}</span>
    </a>
  );
}

export default function Sidebar() {
  const { user, logout } = useData();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (href: string) => { router.push(href); setOpen(false); };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden animate-fadeIn" onClick={() => setOpen(false)} />}

      <aside className={`fixed lg:sticky top-0 left-0 z-50 w-64 h-screen bg-white/95 backdrop-blur-sm border-r border-slate-200 flex flex-col transition-all duration-300 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0 lg:shadow-none'}`}>
        {/* Logo */}
        <div className="px-5 h-16 flex items-center border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="EarnTrack" className="w-9 h-9 rounded-full object-cover shadow-md shadow-teal-200" />
            <div>
              <p className="text-slate-900 font-bold text-sm tracking-tight">EarnTrack</p>
              <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest">Business</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <NavSection label="Navigation" />
          {mainLinks.map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
          <NavSection label="Projekte" />
          {projectLinks.map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
          <NavSection label="Account" />
          {extraLinks.map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
          <NavSection label="System" />
          {settingsLinks.map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-500 text-xs font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => logout()} className="mt-1.5 w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-600 hover:bg-red-50 hover:shadow-sm transition-all duration-150 active:scale-[0.97]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-30">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-100 active:scale-[0.9] transition-all">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="EarnTrack" className="w-7 h-7 rounded-full object-cover" />
          <span className="text-slate-900 font-bold text-sm">EarnTrack</span>
        </div>
      </header>
    </>
  );
}
