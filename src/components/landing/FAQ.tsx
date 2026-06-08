'use client';

import { useState } from 'react';

const faqs = [
  {
    q: 'Ist EarnTrack wirklich kostenlos?',
    a: 'EarnTrack kannst du 14 Tage lang kostenlos und unverbindlich testen – ohne Kreditkarte. Danach gibt es drei Tarife: Solo (27,99€/Monat), Team (49,99€/Monat) und Business (79,99€/Monat). Es gibt keinen dauerhaft kostenlosen Plan, nur die 14-tägige Testversion.',
  },
  {
    q: 'Wie funktioniert das Pro-Abo?',
    a: 'EarnTrack bietet drei Tarife: Solo (27,99€/Monat), Team (49,99€/Monat) und Business (79,99€/Monat). Alle Abos verlängern sich automatisch und können jederzeit über die App oder deine Store-Einstellungen gekündigt werden. Es gibt keine versteckten Kosten oder Mindestlaufzeiten.',
  },
  {
    q: 'Kann ich mein Abo kündigen?',
    a: 'Ja, du kannst dein Abo jederzeit kündigen. Die Kündigung erfolgt direkt in der App oder in deinen Store-Einstellungen. Nach Kündigung läuft das Abo bis zum Ende der aktuellen Periode weiter – du verlierst also keine bereits bezahlte Zeit.',
  },
  {
    q: 'Sind meine Daten sicher?',
    a: 'Ja. EarnTrack nutzt Google Firestore für die Datenspeicherung mit Ende-zu-Ende-Verschlüsselung. Deine Daten werden ausschließlich in der EU verarbeitet. Zusätzlich schützt eine SSL/TLS-Verschlüsselung alle übertragenen Daten. Mehr Details findest du in unserer Datenschutzerklärung.',
  },
  {
    q: 'Für wen ist EarnTrack geeignet?',
    a: 'EarnTrack ist perfekt für Unternehmer, Handwerksbetriebe und Dienstleister, die ihre Mitarbeiter und Einsätze profitabel verwalten wollen. Die Profitscore-Funktion hilft dir, die rentabelsten Einsätze zu identifizieren und dein Business gezielt zu optimieren.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-4">
            Häufige Fragen
          </h2>
          <p className="text-lg text-slate-600">
            Hier findest du Antworten auf die wichtigsten Fragen rund um EarnTrack.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 overflow-hidden transition-all duration-200 hover:border-slate-300"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left transition-colors hover:bg-slate-50/50"
                aria-expanded={openIndex === i}
              >
                <span className="text-base font-semibold text-slate-900 pr-4">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                    openIndex === i ? 'rotate-45' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  openIndex === i ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed">
                  {faq.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
