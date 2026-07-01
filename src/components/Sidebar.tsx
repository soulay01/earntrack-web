'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useData } from '@/app/Provider';
import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useDirtyGuard } from '@/contexts/DirtyGuardContext';
import Tooltip from '@/components/Tooltip';
import { getFeatureFlag } from '@/lib/plans';
import { useIsAdmin } from '@/lib/useIsAdmin';
import FeedbackModal from '@/components/FeedbackModal';

const mainLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { href: '/assignments', label: 'Termine', icon: 'briefcase' },
  { href: '/calendar', label: 'Kalender', icon: 'calendar' },
  { href: '/team', label: 'Mitarbeiter Zugangsdaten', icon: 'users' },
  { href: '/messenger', label: 'Team', icon: 'message' },
];

const peopleLinks = [
  { href: '/employees', label: 'Mitarbeiter', icon: 'users' },
  { href: '/customers', label: 'Kunden', icon: 'building' },
  { href: '/suppliers', label: 'Lieferanten', icon: 'box' },
];

  const projectLinks = [
    { href: '/projects', label: 'Meine Projekte', icon: 'folder' },
    { href: '/invoices', label: 'Rechnungen', icon: 'file' },
    { href: '/estimates', label: 'Kostenvoranschlag', icon: 'file' },
    { href: '/inventory', label: 'Lager', icon: 'package' },
  ];

  const settingsLinks = [
  { href: '/settings/articles', label: 'Artikelkatalog', icon: 'folder' },
  { href: '/settings/export', label: 'Datenexport', icon: 'file' },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const cl = className || 'w-5 h-5';
  const p = { className: cl, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'grid': return <svg {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
    case 'briefcase': return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>;
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'building': return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01" /></svg>;
    case 'calendar': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><text x="12" y="18" textAnchor="middle" fontSize="7" fill="currentColor" fontWeight="bold">W</text></svg>;
    case 'settings': return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'file': return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'folder': return <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    case 'key': return <svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>;
    case 'message': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'chart': return <svg {...p}><path d="M18 20V10M12 20V4M6 20v-6" strokeWidth="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="2" r="2" /><circle cx="6" cy="8" r="2" /></svg>;
    case 'box': return <svg {...p}><path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" strokeWidth="1.5" /><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" strokeWidth="1.5" /><path d="M12 12v4" strokeWidth="1.5" /><path d="M8 12h8" strokeWidth="1.5" /></svg>;
    case 'credit': return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" strokeWidth="1.5"/><path d="M2 10h20" strokeWidth="1.5"/><path d="M8 16h8" strokeWidth="1.5"/></svg>;
    case 'package': return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

function NavSection({ label }: { label: string }) {
  return <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>;
}

function NavLink({ href, label, icon, path, onNavigate, badge }: { href: string; label: string; icon: string; path: string; onNavigate: () => void; badge?: number }) {
  const active = path === href || (href !== '/dashboard' && href !== '/projects' && path.replace(/\/+$/, '').startsWith(href));
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
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </a>
  );
}

export default function Sidebar() {
  const { user, company, unreadCounts, photoUnreadCounts, clockUnreadCounts, logout } = useData();
  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0) + Object.values(photoUnreadCounts).reduce((s, n) => s + n, 0) + Object.values(clockUnreadCounts).reduce((s, n) => s + n, 0);
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { isAdmin } = useIsAdmin();
  const { guard } = useDirtyGuard();

  const nav = (href: string) => { guard(() => { router.push(href); setOpen(false); }); };

  useEffect(() => {
    if (isAdmin) {
      auth.currentUser?.getIdToken().then(token => {
        if (token) fetch('/api/auth/session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken: token }) }).catch(()=>{})
      })
    }
  }, [isAdmin])

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 md:hidden " onClick={() => setOpen(false)} />}

      <aside className={`fixed md:sticky top-0 left-0 z-50 w-64 h-screen bg-white/95 backdrop-blur-sm border-r border-slate-200 flex flex-col overflow-hidden transition-all duration-300 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0 md:shadow-none'}`}>
        {/* Logo */}
        <div className="px-5 h-16 flex items-center border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src="/logo.png?v=2" alt="EarnTrack" className="w-9 h-9 rounded-full object-cover shadow-md shadow-teal-200" />
            <div>
              <p className="text-slate-900 font-bold text-sm tracking-tight">EarnTrack</p>
              <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest">Business Manager</p>
            </div>
          </div>
        </div>

        {/* Subscription prompt – compact tab-sized banner when on trial */}
        {(!company?.subscriptionStatus) && (
          <div className="relative mx-3 mt-3 mb-0.5 overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 shadow-sm shadow-orange-200/40 animate-[fadeIn_0.6s_ease-out] group">
            <div className="absolute inset-0 animate-shimmer opacity-40"
              style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.2) 50%, transparent 75%)', backgroundSize: '200% 100%' }} />
            <div className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-white/30 animate-ping" style={{ animationDuration: '2s' }} />

            <a href="/settings/subscription" onClick={e => { e.preventDefault(); router.push('/settings/subscription'); }}
              className="relative flex items-center gap-2 px-3 py-2.5 active:scale-[0.97] transition-all"
            >
              <svg className="w-4 h-4 text-white shrink-0 animate-bounce" style={{ animationDuration: '1.5s' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="text-white font-bold text-xs drop-shadow-sm flex-1">Hol dir die Freiheit, die dein Business verdient</span>
              <span className="text-[10px] font-semibold text-white/80 group-hover:text-white transition-colors whitespace-nowrap">Features →</span>
            </a>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 min-h-0 px-3 py-4 space-y-0.5 overflow-y-auto">
          <NavSection label="Navigation" />
          {mainLinks
            .filter(l =>
              (l.href !== '/team' || getFeatureFlag(company?.subscriptionPlan, 'employeeCredentials')) &&
              (l.href !== '/messenger' || getFeatureFlag(company?.subscriptionPlan, 'employeeCredentials'))
            )
            .map(l => (
            <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)}
              badge={l.href === '/messenger' ? totalUnread : undefined} />
          ))}
          <NavSection label="Mitarbeiter &amp; Kunden" />
          {peopleLinks.map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
          <NavSection label="Projekte &amp; Finanzen" />
          {projectLinks.map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
          {settingsLinks
            .filter(l => l.href !== '/settings/articles' || getFeatureFlag(company?.subscriptionPlan, 'articleCatalog'))
            .map(l => <NavLink key={l.href} {...l} path={path} onNavigate={() => nav(l.href)} />)}
          {isAdmin && (
            <>
              <NavSection label="Admin" />
              <NavLink href="/analytics" label="Analytics" icon="chart" path={path} onNavigate={() => nav('/analytics')} />
            </>
          )}
        </nav>

        {/* Past-due banner */}
        {company?.subscriptionStatus === 'past_due' && (
          <div className="relative mx-3 mt-3 mb-0.5 overflow-hidden rounded-xl bg-gradient-to-r from-red-500 to-rose-600 shadow-sm shadow-red-200/40 animate-[fadeIn_0.6s_ease-out] group">
            <a href="/settings/subscription" onClick={e => { e.preventDefault(); router.push('/settings/subscription'); }}
              className="relative flex items-center gap-2 px-3 py-2.5 active:scale-[0.97] transition-all"
            >
              <svg className="w-4 h-4 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-white font-bold text-xs drop-shadow-sm flex-1">Zahlung fehlgeschlagen – bitte Zahlungsmethode aktualisieren</span>
              <span className="text-[10px] font-semibold text-white/80 group-hover:text-white transition-colors whitespace-nowrap">Jetzt fixen →</span>
            </a>
          </div>
        )}

        {/* Trial countdown */}
        {company?.subscriptionStatus === 'trial' && company?.trialEndsAt?.toDate && (() => {
          const now = new Date();
          const end = company.trialEndsAt.toDate();
          const totalDays = 14;
          const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          const progress = Math.max(0, Math.min(1, daysLeft / totalDays));
          const r = Math.round(16 + 169 * (1 - progress));
          const g = Math.round(185 - 157 * (1 - progress));
          const b = Math.round(129 - 101 * (1 - progress));
          return (
            <div className="px-3 pt-0 pb-1">
              <a href="/settings/subscription"
                className="block rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 hover:shadow-sm transition-all active:scale-[0.97]"
              >
                <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="flex-1">Testphase</span>
                  <span className="font-bold">{daysLeft} {daysLeft === 1 ? 'Tag' : 'Tage'}</span>
                </div>
                <div className="px-3 pb-2.5">
                  <div className="h-1.5 w-full rounded-full bg-amber-200/60">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progress * 100}%`,
                        background: `rgb(${r}, ${g}, ${b})`,
                      }}
                    />
                  </div>
                </div>
              </a>
            </div>
          );
        })()}

        {/* Feedback button */}
        <div className="px-3 pb-1 shrink-0">
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:shadow-sm transition-all duration-150 active:scale-[0.97]"
          >
            <svg className="w-5 h-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="flex-1 text-left">Feedback geben</span>
          </button>
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50">
            {company?.profileImage && (company.profileImage.startsWith('https://') || company.profileImage.startsWith('data:image/')) ? (
              <img src={company.profileImage} alt="" className="w-8 h-8 rounded-xl object-cover shrink-0 shadow-sm" />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-slate-500 text-xs font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-1.5">
            <a href="/settings" onClick={e => { e.preventDefault(); nav('/settings'); }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs text-slate-400 hover:text-teal-600 hover:bg-teal-50 hover:shadow-sm transition-all duration-150 active:scale-[0.97]">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="truncate">Einstellungen</span>
            </a>
            <button onClick={async () => { try { await logout(); } catch (e) { console.error('Logout failed:', e); } }} className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 hover:shadow-sm transition-all duration-150 active:scale-[0.97]">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="truncate">Abmelden</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-30">
        <Tooltip text="Menü öffnen">
        <button onClick={() => setOpen(true)} className="p-2.5 -ml-2.5 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-100 active:scale-[0.9] transition-all">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        </Tooltip>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png?v=2" alt="EarnTrack" className="w-7 h-7 rounded-full object-cover" />
          <span className="text-slate-900 font-bold text-sm">EarnTrack</span>
        </div>
      </header>
      <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />
    </>
  );
}
