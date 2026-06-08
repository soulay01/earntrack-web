import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Impressum der EarnTrack App – Angaben nach §5 TMG',
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-teal-600 text-sm font-semibold hover:text-teal-700 mb-8 inline-block">
          ← Zurück zur Startseite
        </Link>

        <div className="bg-white rounded-3xl shadow-xl border border-teal-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-8">Impressum</h1>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Angaben gemäß §5 TMG</h2>
          <p className="text-slate-600 mb-4">
            Solaiman Tanjaoui<br />
            EarnTrack – App + Web für Handwerker & Selbstständige<br />
            Gabelsbergstraße 5<br />
            55118 Mainz
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Kontakt</h2>
          <p className="text-slate-600 mb-4">
            Telefon: [Telefonnummer]<br />
            E-Mail: <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700">info@earntrack.de</a>
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Verbraucherstreitbeilegung/Universalschlichtungsstelle</h2>
          <p className="text-slate-600 mb-4">
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>

          <p className="text-slate-500 text-xs mt-8 border-t border-slate-200 pt-6">
            Quelle: <a href="https://e-recht24.de" className="text-teal-600 hover:text-teal-700">e-recht24.de</a>
          </p>
        </div>
      </div>
    </div>
  );
}
