import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Muster-Widerrufsformular',
  description: 'Muster-Widerrufsformular für EarnTrack-Abonnements gemäß Art. 246a § 1 Abs. 2 EGBGB',
};

export default function WiderrufsformularPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-teal-600 text-sm font-semibold hover:text-teal-700 mb-8 inline-block">
          ← Zurück zur Startseite
        </Link>

        <div className="bg-white rounded-3xl shadow-xl border border-teal-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Muster-Widerrufsformular</h1>
          <p className="text-slate-500 text-sm mb-8 border-b border-slate-200 pb-4">
            gemäß Art. 246a § 1 Abs. 2 EGBGB. Wenn du den Vertrag widerrufen willst, fülle
            dieses Formular aus und sende es per E-Mail an{' '}
            <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700">info@earntrack.de</a>.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-700 leading-relaxed space-y-3">
            <p>An:</p>
            <p>
              Solaiman Tanjaoui<br />
              EarnTrack – App + Web für Handwerker &amp; Selbstständige<br />
              Gabelsbergstraße 5<br />
              55118 Mainz<br />
              E-Mail: info@earntrack.de
            </p>
            <p className="pt-3">
              Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über
              die Nutzung des folgenden Abonnements:
            </p>
            <p>_________________________________________________</p>
            <p className="pt-2">Bestellt am (*) / erhalten am (*):</p>
            <p>_________________________________________________</p>
            <p className="pt-2">Name des/der Verbraucher(s):</p>
            <p>_________________________________________________</p>
            <p className="pt-2">Anschrift des/der Verbraucher(s):</p>
            <p>_________________________________________________</p>
            <p className="pt-2">Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):</p>
            <p>_________________________________________________</p>
            <p className="pt-2">Datum:</p>
            <p>_________________________________________________</p>
            <p className="pt-4 text-xs text-slate-400">(*) Unzutreffendes streichen.</p>
          </div>

          <p className="text-slate-500 text-xs mt-6">
            Die Nutzung dieses Formulars ist freiwillig — ein formloser Widerruf per E-Mail an{' '}
            <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700">info@earntrack.de</a>{' '}
            genügt ebenfalls, solange er eindeutig erklärt wird. Details zum Widerrufsrecht
            findest du in unseren <Link href="/agb" className="text-teal-600 hover:text-teal-700">AGB</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
