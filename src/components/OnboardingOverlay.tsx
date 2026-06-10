'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Slide {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  tips: string[];
  timeSaving: string;
  gradient: string;
  bg: string;
}

const slides: Slide[] = [
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    title: 'Willkommen bei EarnTrack',
    subtitle: 'Deine All-in-One-Lösung für Handwerksbetriebe',
    description: 'EarnTrack vereint Projekte, Mitarbeiter, Zeiterfassung und Abrechnung in einer Plattform. Keine Zettel, keine verstreuten Excel-Tabellen, keine doppelte Buchführung mehr.',
    tips: [
      'Starte auf dem Dashboard – dort siehst du sofort deine wichtigsten Kennzahlen',
      'Erstelle als Erstes ein Projekt und weise einen Mitarbeiter zu',
      'Lade die mobile App herunter für die Zeiterfassung vor Ort',
    ],
    timeSaving: 'Bis zu 10 Stunden pro Woche durch automatisierte Abläufe',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Dashboard',
    subtitle: 'Deine Finanzen auf einen Blick',
    description: 'Das Dashboard zeigt dir Umsatz, Kosten, Gewinn und die Anzahl deiner Aufträge in Echtzeit. Du siehst sofort, ob ein Projekt profitabel ist oder ob du nachsteuern musst – ohne selbst Tabellen zu führen.',
    tips: [
      'Der Profit-Score (A+ bis F) zeigt dir auf einen Blick, wie es läuft',
      'Die monatliche Übersicht hilft dir, Trends frühzeitig zu erkennen',
      'Prüfe regelmäßig das Dashboard – es ersetzt deine tägliche Excel-Routine',
    ],
    timeSaving: 'Spare 2–3 Stunden pro Woche, die du sonst für Zusammenstellungen brauchst',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: 'Projekte & Termine',
    subtitle: 'Immer den Überblick über deine Aufträge',
    description: 'Lege Projekte an, weise Mitarbeiter zu und setze Fristen – alles an einem Ort. Dein Team sieht alle Einsätze direkt in der App und bekommt Push-Benachrichtigungen bei neuen Terminen.',
    tips: [
      'Nutze die Kalender-Ansicht für die Wochenplanung deiner Teams',
      'Füge Fristen hinzu – EarnTrack erinnert automatisch an bevorstehende Termine',
      'Weise pro Projekt feste Mitarbeiter zu, damit jeder genau weiß, was zu tun ist',
    ],
    timeSaving: 'Einsatzplanung in 2 Minuten statt 30 Minuten Telefonate',
    gradient: 'from-blue-500 to-indigo-500',
    bg: 'bg-blue-50',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    title: 'Team & Mitarbeiter',
    subtitle: 'Zeiterfassung ohne Zettelwirtschaft',
    description: 'Jeder Mitarbeiter bekommt einen persönlichen Zugang zur mobilen App und kann seine Arbeitszeit direkt auf der Baustelle stempeln. Keine handschriftlichen Stundenzettel mehr – alles digital, nachvollziehbar und sofort abrechenbar.',
    tips: [
      'Lade Mitarbeiter per Einladungscode in die App ein – dauert 1 Minute',
      'Jeder Mitarbeiter sieht nur seine zugewiesenen Projekte',
      'Die Stempel-Funktion erfasst Arbeitszeiten sekundengenau vor Ort',
    ],
    timeSaving: 'Kein mühsames Zusammensuchen von Stundenzetteln – alle Zeiten sind sofort da',
    gradient: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-50',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Kostenvoranschlag & Rechnungen',
    subtitle: 'Fakturierung in unter 30 Sekunden',
    description: 'Erstelle Rechnungen und Kostenvoranschläge automatisch aus den erfassten Stunden und Stundensätzen. Mit ZUGFeRD E-Rechnung, PDF-Export und Briefversand. Kein manuelles Abtippen von Stundenzetteln mehr.',
    tips: [
      'Rechnungen werden direkt aus den erfassten Arbeitszeiten generiert',
      'Wandele einen Kostenvoranschlag per Klick in eine Rechnung um (Button "In Rechnung")',
      'PDF-Wasserzeichen in der Testphase – nach Upgrade vollständig entfernbar',
    ],
    timeSaving: 'Rechnungsstellung in 30 Sekunden statt 1 Stunde Zusammenstellung',
    gradient: 'from-rose-500 to-pink-500',
    bg: 'bg-rose-50',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Testphase – 14 Tage kostenlos',
    subtitle: 'Alle Funktionen freigeschaltet',
    description: 'Du kannst EarnTrack 14 Tage lang komplett kostenlos testen – ohne Einschränkungen, kein Limit bei Projekten, Mitarbeitern oder Rechnungen. Lediglich ein kleines Wasserzeichen auf PDFs erinnert dich daran, dass du in der Testphase bist. Nach Ablauf musst du ein Abo abschließen, um EarnTrack weiterzunutzen.',
    tips: [
      'Keine versteckten Kosten – kein Limit bei Projekten, Mitarbeitern oder Rechnungen',
      'Einzige Einschränkung: kleines Wasserzeichen auf PDFs während der Testphase',
      'Fragen oder Feedback? Schreib mir einfach: info@earntrack.de',
    ],
    timeSaving: 'Jetzt starten und in 2 Minuten das erste Projekt anlegen',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50',
  },
];

export default function OnboardingOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const s = slides[step];
  const isLast = step === slides.length - 1;

  function goTo(i: number) {
    setDirection(i > step ? 1 : -1);
    setStep(i);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/60 overflow-hidden">
          <div className={`bg-gradient-to-br ${s.gradient} px-8 pt-8 pb-6 text-center relative overflow-hidden`}>
            <div className="absolute inset-0 bg-white/5" />
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`icon-${step}`}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ scale: 0, rotate: d > 0 ? 120 : -120, opacity: 0 }),
                  center: { scale: 1, rotate: 0, opacity: 1 },
                }}
                initial="enter"
                animate="center"
                transition={{ type: 'spring', stiffness: 180, damping: 12 }}
                className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg relative z-10"
              >
                <div className="text-white">{s.icon}</div>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={`title-${step}`}
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative z-10"
              >
                <h2 className="text-2xl font-extrabold tracking-tight text-white mb-1">{s.title}</h2>
                <p className="text-white/70 text-sm font-medium">{s.subtitle}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="px-8 py-5 space-y-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={`desc-${step}`}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="text-slate-600 text-sm leading-relaxed"
              >
                {s.description}
              </motion.p>
            </AnimatePresence>

            <div className="space-y-2">
              {s.tips.map((tip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.3 }}
                  className="flex items-start gap-2.5"
                >
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-xs text-slate-500 leading-relaxed">{tip}</span>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.3 }}
              className="flex items-center gap-2 bg-teal-50 rounded-xl px-4 py-3 border border-teal-100"
            >
              <svg className="w-5 h-5 shrink-0 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs font-semibold text-teal-700">{s.timeSaving}</span>
            </motion.div>
          </div>

          <div className="px-8 pb-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              {Array.from({ length: slides.length }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === step ? 'w-8' : 'w-2'
                  } ${i <= step ? `bg-gradient-to-r ${s.gradient}` : 'bg-slate-200'}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onDismiss}
                className="px-4 py-3 text-sm text-slate-400 hover:text-slate-600 font-medium transition-all"
              >
                Überspringen
              </button>
              <div className="flex-1" />
              {step > 0 && (
                <button
                  onClick={() => goTo(step - 1)}
                  className="px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
                >
                  Zurück
                </button>
              )}
              <button
                onClick={() => { if (isLast) onDismiss(); else goTo(step + 1); }}
                className={`px-6 py-3 text-sm font-bold text-white rounded-xl bg-gradient-to-r ${s.gradient} shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.97]`}
              >
                {isLast ? 'Loslegen!' : 'Weiter'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
