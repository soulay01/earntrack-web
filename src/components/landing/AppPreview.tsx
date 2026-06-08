const screenshots = [
  {
    label: 'Dashboard & Profitscore',
    gradient: 'from-brand-500 to-emerald-400',
  },
  {
    label: 'Mitarbeiter & Einsätze',
    gradient: 'from-brand-600 to-cyan-500',
  },
  {
    label: 'Kostenvoranschlag & Rechnung',
    gradient: 'from-brand-400 to-teal-500',
  },
];

export default function AppPreview() {
  return (
    <section id="app" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-4">
            App Vorschau
          </h2>
          <p className="text-lg text-slate-600">
            Erlebe die smarte Mitarbeiterverwaltung. Modernes Design trifft 
            maximale Funktionalität.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {screenshots.map((item, i) => (
            <div
              key={i}
              className="group relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
            >
              <div className={`aspect-[9/16] bg-gradient-to-br ${item.gradient} flex items-center justify-center p-6`}>
                <div className="w-full h-full rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-white/80 text-xs font-medium">App Screenshot</p>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
