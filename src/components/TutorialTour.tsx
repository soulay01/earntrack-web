'use client';

// Interaktive Erste-Schritte-Tour (Spotlight/Coach-Marks) — läuft genau einmal pro Account
// (companies.onboardingSeen). Highlightet echte UI-Elemente über [data-tour]-Selektoren;
// Schritte, deren Ziel nicht existiert (Feature-Flag, mobile Ansicht), werden übersprungen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TourStep {
  selector?: string;          // ohne selector → zentrierte Karte
  title: string;
  text: string;
  emoji: string;
  cta?: { label: string; action: 'first-assignment' };
}

const STEPS: TourStep[] = [
  {
    emoji: '👋',
    title: 'Willkommen bei EarnTrack!',
    text: 'Schön, dass du da bist. In einer Minute zeigen wir dir alles, was du brauchst, um loszulegen — versprochen, es ist einfach.',
  },
  {
    selector: '[data-tour="sidebar"]',
    emoji: '🧭',
    title: 'Deine Navigation',
    text: 'Hier erreichst du jeden Bereich: Termine, Kunden, Rechnungen und mehr. Alles ist maximal einen Klick entfernt.',
  },
  {
    selector: '[data-tour="nav-assignments"]',
    emoji: '📋',
    title: 'Termine — dein Herzstück',
    text: 'Hier legst du Aufträge und Einsätze an: Kunde, Mitarbeiter, Stunden, Material. Daraus entstehen später automatisch Rechnungen und dein Profit Score.',
  },
  {
    selector: '[data-tour="nav-customers"]',
    emoji: '🤝',
    title: 'Kunden',
    text: 'Deine Kundenkartei mit Historie und Score — du siehst sofort, welche Kunden sich wirklich lohnen.',
  },
  {
    selector: '[data-tour="nav-invoices"]',
    emoji: '🧾',
    title: 'Rechnungen & Angebote',
    text: 'Professionelle PDF-Rechnungen und Kostenvoranschläge mit einem Klick — inklusive E-Rechnung (ZUGFeRD).',
  },
  {
    selector: '[data-tour="nav-messenger"]',
    emoji: '💬',
    title: 'Team-Chat',
    text: 'Kommuniziere pro Projekt mit deinem Team: Notizen, Fotos und Zeiterfassung an einem Ort.',
  },
  {
    selector: '[data-tour="kpis"]',
    emoji: '📊',
    title: 'Deine Zahlen — live',
    text: 'Umsatz, Kosten, Gewinn und Termine auf einen Blick. Sobald du Termine anlegst, füllt sich dein Dashboard von selbst.',
  },
  {
    emoji: '🚀',
    title: 'Bereit? Deine ersten Schritte:',
    text: '1. Lege deinen ersten Termin an\n2. Füge einen Kunden hinzu\n3. Hinterlege deine Firmendaten für Rechnungen (Einstellungen → Firmendaten)',
    cta: { label: 'Ersten Termin anlegen →', action: 'first-assignment' },
  },
];

const PAD = 8; // Abstand Spotlight ↔ Element

export default function TutorialTour({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>(STEPS);
  const cardRef = useRef<HTMLDivElement>(null);

  // Schritte ohne sichtbares Ziel-Element aussortieren (Feature-Flags, mobile Ansicht —
  // die Sidebar ist auf Mobile per translate-x aus dem Viewport geschoben, aber im DOM).
  useEffect(() => {
    setVisibleSteps(STEPS.filter(s => {
      if (!s.selector) return true;
      const el = document.querySelector(s.selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > 0;
    }));
  }, []);

  const step = visibleSteps[idx];

  const measure = useCallback(() => {
    if (!step?.selector) { setRect(null); return; }
    const el = document.querySelector(step.selector);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  if (!step) return null;

  const next = () => {
    if (idx < visibleSteps.length - 1) setIdx(idx + 1);
    else onDone();
  };

  const handleCta = () => {
    try { sessionStorage.setItem('et_tour_next', '1'); } catch {}
    onDone();
    router.push('/assignments');
  };

  // Spotlight-Geometrie (rect=null → zentrierter Punkt, Backdrop dimmt alles)
  const sx = rect ? rect.left - PAD : window.innerWidth / 2;
  const sy = rect ? rect.top - PAD : window.innerHeight / 2;
  const sw = rect ? rect.width + PAD * 2 : 0;
  const sh = rect ? rect.height + PAD * 2 : 0;

  // Karte unter dem Spotlight, wenn Platz — sonst darüber; ohne Ziel zentriert.
  const CARD_W = 360;
  const CARD_H_EST = 260;
  const spaceBelow = window.innerHeight - (sy + sh);
  const cardTop = !rect
    ? window.innerHeight / 2 - CARD_H_EST / 2
    : spaceBelow > CARD_H_EST + 16 ? sy + sh + 14 : Math.max(16, sy - CARD_H_EST - 14);
  const cardLeft = !rect
    ? window.innerWidth / 2 - CARD_W / 2
    : Math.min(Math.max(16, sx + sw / 2 - CARD_W / 2), window.innerWidth - CARD_W - 16);

  const isLast = idx === visibleSteps.length - 1;

  return (
    <div className="fixed inset-0 z-[9990]" role="dialog" aria-label="Erste-Schritte-Tour">
      {/* Spotlight: Loch via riesigem Box-Shadow, Klicks gehen durch */}
      <div
        className="absolute rounded-2xl transition-all duration-300 ease-out pointer-events-none"
        style={{
          left: sx, top: sy, width: sw, height: sh,
          boxShadow: '0 0 0 200vmax rgba(15,23,42,0.65)',
          border: rect ? '2px solid rgba(45,212,191,0.9)' : 'none',
        }}
      />
      {/* Tooltip-Karte */}
      <div
        ref={cardRef}
        className="absolute bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 transition-all duration-300 ease-out"
        style={{ top: cardTop, left: cardLeft, width: CARD_W, maxWidth: 'calc(100vw - 32px)' }}
      >
        <button
          onClick={onDone}
          className="absolute top-3 right-4 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
        >
          Überspringen
        </button>
        <div className="text-3xl mb-2">{step.emoji}</div>
        <p className="text-slate-900 font-bold text-lg leading-snug mb-1.5">{step.title}</p>
        <p className="text-slate-500 text-sm leading-relaxed whitespace-pre-line">{step.text}</p>

        <div className="flex items-center justify-between mt-5">
          <div className="flex items-center gap-1.5">
            {visibleSteps.map((_, i) => (
              <span key={i} className={`rounded-full transition-all duration-300 ${i === idx ? 'w-5 h-1.5 bg-teal-500' : 'w-1.5 h-1.5 bg-slate-200'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button onClick={() => setIdx(idx - 1)}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-all">
                Zurück
              </button>
            )}
            {isLast && step.cta ? (
              <button onClick={handleCta}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-bold shadow-lg shadow-teal-200 transition-all active:scale-[0.97]">
                {step.cta.label}
              </button>
            ) : (
              <button onClick={next}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all active:scale-[0.97]">
                {isLast ? 'Fertig' : 'Weiter'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
