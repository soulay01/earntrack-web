'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function ExpiredTrialOverlay() {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 animate-zoomIn">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-8 py-10 text-center">
            <motion.div
              className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 70%)' }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <svg className="w-[72px] h-[72px]" viewBox="0 0 80 80" fill="none">
                <motion.path
                  d="M26 38V24C26 16.5 32.5 11 40 11C47.5 11 54 16.5 54 24V38"
                  stroke="white"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.path
                  d="M20 38C20 34.7 22.7 32 26 32H54C57.3 32 60 34.7 60 38V60C60 63.3 57.3 66 54 66H26C22.7 66 20 63.3 20 60V38Z"
                  fill="white"
                  fillOpacity="0.9"
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.5 }}
                />
                <motion.g
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.9, type: 'spring', stiffness: 300, damping: 12 }}
                >
                  <circle cx="40" cy="48" r="5" fill="#1e293b" />
                  <path d="M38 48H42V56C42 57.1 41.1 58 40 58C38.9 58 38 57.1 38 56V48Z" fill="#1e293b" />
                </motion.g>
                <motion.circle
                  cx="40" cy="24"
                  r="2"
                  fill="white"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ delay: 1.3, duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                />
              </svg>
            </motion.div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Zugriff abgelaufen</h1>
            <p className="text-amber-100 text-sm mt-2">
              Dein Abonnement ist abgelaufen.
            </p>
          </div>

          <div className="px-8 py-6 space-y-4">
            <p className="text-slate-600 text-sm leading-relaxed">
              Um weiterhin alle Funktionen von EarnTrack nutzen zu können, wähle bitte einen Plan aus.
            </p>

            <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0">✓</span>
                <div>
                  <span className="text-sm font-bold text-slate-800">Bis zu 30 % mehr Gewinn</span>
                  <p className="text-xs text-slate-500 mt-0.5">Dank smarter Kostenanalyse, Auswertungen & optimierter Einsatzplanung</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0">✓</span>
                <div>
                  <span className="text-sm font-bold text-slate-800">Kalender für volle Übersicht</span>
                  <p className="text-xs text-slate-500 mt-0.5">Termine, Einsätze, Fristen & Projekte auf einen Blick</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0">✓</span>
                <div>
                  <span className="text-sm font-bold text-slate-800">Automatisches Mahnwesen</span>
                  <p className="text-xs text-slate-500 mt-0.5">Professionelle Rechnungen, Angebote & PDF-Export inkl. ZUGFeRD</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0">✓</span>
                <div>
                  <span className="text-sm font-bold text-slate-800">Mitarbeiter-Zeiterfassung</span>
                  <p className="text-xs text-slate-500 mt-0.5">Echtzeit-Kennzahlen zu Umsatz, Auslastung & Produktivität</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0">✓</span>
                <div>
                  <span className="text-sm font-bold text-slate-800">Jederzeit kündbar</span>
                  <p className="text-xs text-slate-500 mt-0.5">Alle Daten bleiben erhalten – keine versteckten Kosten</p>
                </div>
              </div>
            </div>

            <Link
              href="/settings/subscription"
              className="block w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all text-sm shadow-lg shadow-teal-200/50 text-center"
            >
              Jetzt Angebot ansehen
            </Link>

            <a
              href="mailto:info@earntrack.de"
              className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 font-medium transition-all py-2"
            >
              Fragen? <span className="text-teal-600 font-semibold">info@earntrack.de</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
