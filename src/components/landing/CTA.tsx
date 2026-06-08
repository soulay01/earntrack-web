import Link from 'next/link';

export default function CTA() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-brand-400/5 rounded-full blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="ctaGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ctaGrid)" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-5">
          Bereit, mehr Profit zu machen?
        </h2>
        <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
           Lade EarnTrack jetzt herunter und starte kostenlos. Upgrade, 
           wenn du bereit bist. Volle Power schon ab <strong className="text-white">27,99&euro;/Monat</strong>!
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-xl shadow-2xl shadow-black/20 active:scale-[0.97] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.7-.83 1.87-1.45 2.86-1.5.07 1.09-.29 2.15-.97 2.94-.68.8-1.81 1.37-2.86 1.38-.06-1.02.31-2.11.97-2.82z"/>
            </svg>
            Im App Store laden
          </Link>
          <a
            href="#"
            className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-bold text-white bg-slate-700/50 hover:bg-slate-700/70 rounded-xl border border-slate-600/50 active:scale-[0.97] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 3v18h18V3H3zm15 5h-2.42v3.33H13v3.34h-2.58V8.33H8V6h10v2z"/>
            </svg>
            Google Play
          </a>
        </div>

        <p className="text-sm text-slate-500">
           ☕ Ab 27,99&euro;/Monat – jederzeit kündbar
        </p>
      </div>
    </section>
  );
}
