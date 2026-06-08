'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const slides = [
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    title: 'Willkommen bei EarnTrack',
    subtitle: 'Deine All-in-One-Lösung für Handwerksbetriebe',
    description: 'EarnTrack hilft dir dabei, deine Mitarbeiter, Projekte, Einsatzplanung und Abrechnung an einem zentralen Ort zu verwalten.',
    gradient: 'from-amber-500 to-orange-500',
    shadow: 'shadow-amber-200',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Dashboard',
    subtitle: 'Behalte den Überblick',
    description: 'Auf dem Dashboard siehst du auf einen Blick deine aktuellen Umsätze, Projekte, offenen Angebote und Rechnungen sowie die Leistung deiner Mitarbeiter – alles in Echtzeit.',
    gradient: 'from-emerald-500 to-teal-500',
    shadow: 'shadow-emerald-200',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: 'Projekte & Termine',
    subtitle: 'Alles rund um deine Projekte',
    description: 'Erstelle Projekte, weise Mitarbeiter zu, setze Fristen und behalte den Fortschritt im Blick. Alle wichtigen Informationen zu jedem Projekt sind zentral gespeichert.',
    gradient: 'from-blue-500 to-indigo-500',
    shadow: 'shadow-blue-200',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    title: 'Team & Kommunikation',
    subtitle: 'Mitarbeiter verwalten & chatten',
    description: 'Lege Mitarbeiter an, weise Zugänge zu Projekten zu und kommuniziere direkt über den integrierten Messenger. Jeder Mitarbeiter sieht nur seine zugewiesenen Projekte.',
    gradient: 'from-violet-500 to-purple-500',
    shadow: 'shadow-violet-200',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Rechnungen & Angebote',
    subtitle: 'Professionelle Dokumente in Sekunden',
    description: 'Erstelle Angebote und Rechnungen auf Knopfdruck – basierend auf den erfassten Stunden und Stundensätzen deiner Projekte. Fertige Dokumente kannst du als PDF exportieren.',
    gradient: 'from-rose-500 to-pink-500',
    shadow: 'shadow-rose-200',
  },
  {
    icon: (
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Bereit für den Start?',
    subtitle: 'Fast geschafft!',
    description: 'Du hast alle wichtigen Funktionen kennengelernt. Lege jetzt los und erstelle dein erstes Projekt.',
    gradient: 'from-emerald-500 to-teal-500',
    shadow: 'shadow-emerald-200',
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

const iconVariants = {
  hidden: { scale: 0, rotate: -180 },
  visible: {
    scale: 1,
    rotate: 0,
    transition: { type: 'spring' as const, stiffness: 200, damping: 12, delay: 0.15 },
  },
};

const textVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    transition: { delay: 0.3 + i * 0.12, duration: 0.4, ease: [0.16, 1, 0.3, 1] } as const,
  }),
};

export default function OnboardingOverlay({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const s = slides[step];
  const isLast = step === slides.length - 1;

  function next() {
    if (isLast) {
      onDismiss();
      return;
    }
    setDirection(1);
    setStep(i => i + 1);
  }

  function prev() {
    setDirection(-1);
    setStep(i => i - 1);
  }

  function skip() {
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 20 }}
        className="w-full max-w-lg"
      >
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className={`bg-gradient-to-br ${s.gradient} p-8 text-center relative overflow-hidden`}>
            <motion.div
              className="absolute inset-0 bg-white/5"
              animate={{ opacity: [0, 0.1, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`icon-${step}`}
                custom={direction}
                variants={iconVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg relative z-10"
              >
                <div className="text-white">{s.icon}</div>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={`title-${step}`}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative z-10"
              >
                <h2 className="text-2xl font-extrabold tracking-tight text-white mb-1">{s.title}</h2>
                <p className="text-white/80 text-sm font-medium">{s.subtitle}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="px-8 pt-6 pb-4 min-h-[80px]">
            <AnimatePresence mode="wait">
              <motion.p
                key={`desc-${step}`}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="text-slate-600 text-sm leading-relaxed"
              >
                {s.description}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="px-8 pb-6">
            <div className="flex items-center justify-center gap-2 mb-5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > step ? 1 : -1); setStep(i); }}
                  className="relative h-2 rounded-full transition-all duration-300"
                  style={{ width: i === step ? 32 : 8 }}
                >
                  <div
                    className={`absolute inset-0 rounded-full transition-all duration-300 ${
                      i === step ? `bg-gradient-to-r ${s.gradient}` : 'bg-slate-200'
                    }`}
                  />
                  {i === step && (
                    <motion.div
                      className={`absolute inset-0 rounded-full bg-gradient-to-r ${s.gradient}`}
                      layoutId="activeDot"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={skip}
                className="px-4 py-3 text-sm text-slate-400 hover:text-slate-600 font-medium transition-colors"
              >
                {isLast ? 'Jetzt starten' : 'Überspringen'}
              </button>
              <div className="flex-1" />
              {step > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={prev}
                  className="px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
                >
                  Zurück
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={next}
                className={`px-6 py-3 text-sm font-bold text-white rounded-xl transition-all bg-gradient-to-r ${s.gradient} shadow-lg`}
              >
                {isLast ? 'Loslegen!' : 'Weiter'}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
