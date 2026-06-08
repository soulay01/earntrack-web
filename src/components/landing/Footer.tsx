import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-slate-50 border-t border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-200/50">
                <span className="text-white font-extrabold text-sm">ET</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-slate-900">EarnTrack</span>
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
              Die smarte App für Mitarbeiterverwaltung, Profit-Tracking und 
              Einsatzplanung. Erstelle Kostenvoranschläge und Rechnungen in Sekunden.
            </p>
          </div>

          {/* App Links */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">App</h4>
            <ul className="space-y-3">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Screenshots', href: '#app' },
                { label: 'Preise', href: '#pricing' },
                { label: 'FAQ', href: '#faq' },
              ].map(link => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Rechtliches</h4>
            <ul className="space-y-3">
              {[
                { label: 'Datenschutz', href: '/datenschutz' },
                { label: 'Impressum', href: '/impressum' },
                { label: 'AGB', href: '/agb' },
              ].map(link => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Kontakt</h4>
            <ul className="space-y-3">
              <li>
                <a href="mailto:info@earntrack.de" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  info@earntrack.de
                </a>
              </li>
              <li>
                <a href="tel:0176561234456" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  0176 561234456
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <p className="text-sm text-slate-400 text-center">
            &copy; {new Date().getFullYear()} EarnTrack. Alle Rechte vorbehalten.
          </p>
        </div>
      </div>
    </footer>
  );
}
