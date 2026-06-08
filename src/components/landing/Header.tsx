'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const navItems = [
  { label: 'Features', href: '#features' },
  { label: 'App', href: '#app' },
  { label: 'FAQ', href: '#faq' },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 md:h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-200/50">
              <span className="text-white font-extrabold text-sm">ET</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              EarnTrack
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <a
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100/60 transition-all"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              className="ml-3 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-xl shadow-lg shadow-brand-200/50 hover:shadow-xl hover:shadow-brand-200/60 active:scale-[0.97] transition-all"
            >
              Gratis testen
            </Link>
          </nav>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Menü"
          >
            <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200/50 bg-white/95 backdrop-blur-xl animate-slideDown">
          <nav className="px-4 py-4 space-y-1">
            {navItems.map(item => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block mt-3 px-4 py-3 text-sm font-semibold text-center text-white bg-gradient-to-r from-brand-600 to-brand-500 rounded-xl shadow-lg"
            >
              Gratis testen
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
