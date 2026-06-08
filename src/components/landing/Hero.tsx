import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative min-h-[70vh] md:min-h-[90vh] flex items-center overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white pt-16 md:pt-28">
      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-brand-200/30 to-brand-100/10 blur-3xl animate-floatSlow" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-brand-100/20 to-cyan-100/10 blur-3xl animate-float" />
        <div className="absolute top-1/3 left-1/6 w-64 h-64 rounded-full bg-gradient-to-br from-accent-200/10 to-accent-100/5 blur-3xl" />
        {/* Grid pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0d9488" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 md:py-24">
          <div className="grid lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
          {/* Left: Text */}
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-200/50 text-sm font-medium text-brand-700 mb-6 ">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              Jetzt gratis testen – keine Zahlungsdaten nötig
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-4 md:mb-5">
              <span className="block">Deine Mitarbeiter.</span>
              <span className="block">Dein Profit.</span>
              <span className="block gradient-text">Volle Kontrolle.</span>
            </h1>

            <p className="text-base md:text-xl text-slate-600 leading-relaxed mb-6 md:mb-8 max-w-lg">
              Verdiene mehr mit smarter Mitarbeiterverwaltung. Profitscores, 
              Kostenvoranschläge & Rechnungen in Sekunden. 
               Starte jetzt gratis – volle Power schon ab <strong className="text-slate-900">27,99&euro;/Monat</strong>!
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-xl shadow-xl shadow-brand-200/40 hover:shadow-2xl hover:shadow-brand-200/50 active:scale-[0.97] transition-all"
              >
                Kostenlos starten
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-xl active:scale-[0.97] transition-all"
              >
                Mehr erfahren
              </a>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 ring-2 ring-white flex items-center justify-center text-white text-[10px] font-bold">
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <span className="font-medium text-slate-600">Von 100+ Unternehmern genutzt</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-accent-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="font-medium text-slate-600">4.9/5 Sterne</span>
              </div>
            </div>
          </div>

          {/* Right: Visual / Phone mockup */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative">
              <div className="phone-frame animate-floatSlow">
                <div className="phone-screen flex flex-col">
                  {/* Mockup header */}
                  <div className="bg-white px-4 pt-8 pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400" />
                        <span className="text-sm font-bold text-slate-900">EarnTrack</span>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-slate-100" />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 h-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center px-3">
                        <span className="text-xs font-medium text-brand-700">Profitscore: A+</span>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  {/* Mockup content */}
                  <div className="flex-1 bg-slate-50 p-4 space-y-3">
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-500">HEUTIGE EINSÄTZE</span>
                        <span className="text-[10px] text-brand-600 font-semibold">+12%</span>
                      </div>
                      <div className="text-xl font-bold text-slate-900">3.240 €</div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-brand-400 to-brand-600" />
                      </div>
                    </div>
                    {[
                      { name: 'Bäder Renovierung', profit: '+840€', grade: 'A+' },
                      { name: 'Wohnung Streichen', profit: '+320€', grade: 'B' },
                      { name: 'Heizungsmontage', profit: '+1.240€', grade: 'A' },
                    ].map((item, i) => (
                      <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.profit}</div>
                        </div>
                        <div className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                          item.grade === 'A+' ? 'bg-green-100 text-green-700' :
                          item.grade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {item.grade}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Decorative blur behind phone */}
              <div className="absolute -top-10 -right-10 w-48 h-48 bg-brand-300/20 rounded-full blur-3xl -z-10" />
              <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-accent-300/10 rounded-full blur-3xl -z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
