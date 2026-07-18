import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Auftragsverarbeitungsvertrag (AVV)',
  description: 'Auftragsverarbeitungsvertrag nach Art. 28 DSGVO zwischen EarnTrack und dem Kunden',
};

export default function AVVPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-teal-600 text-sm font-semibold hover:text-teal-700 mb-8 inline-block">
          ← Zurück zur Startseite
        </Link>

        <div className="bg-white rounded-3xl shadow-xl border border-teal-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Auftragsverarbeitungsvertrag (AVV)</h1>
          <p className="text-slate-500 text-sm mb-8 border-b border-slate-200 pb-4">
            gemäß Art. 28 DSGVO zwischen dem Kunden („Verantwortlicher") und Solaiman Tanjaoui, Gabelsbergstraße 5,
            55118 Mainz, Betreiber von EarnTrack („Auftragsverarbeiter"). Diese AVV wird durch die Registrierung
            und Nutzung der App wirksam Bestandteil des Nutzungsvertrags.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">1. Gegenstand und Dauer</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Gegenstand dieser Vereinbarung ist die Verarbeitung personenbezogener Daten, die der Verantwortliche
            (Kunde) im Rahmen der Nutzung von EarnTrack selbst einträgt — insbesondere Daten seiner Mitarbeiter
            und seiner eigenen Kunden (z. B. Namen, Kontaktdaten, Stundensätze, Einsatz- und Rechnungsdaten).
            Die Vereinbarung gilt für die Dauer des zugrunde liegenden Nutzungsvertrags (siehe{' '}
            <Link href="/agb" className="text-teal-600 hover:text-teal-700">AGB</Link>).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">2. Art und Zweck der Verarbeitung</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Speicherung, Anzeige, Änderung und Löschung der vom Verantwortlichen eingegebenen Daten zum Zweck der
            Bereitstellung der Funktionen von EarnTrack (Mitarbeiterverwaltung, Zeiterfassung, Einsatzplanung,
            Rechnungs- und Kostenvoranschlagserstellung, Profit-Tracking).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">3. Art der Daten und Kreis der Betroffenen</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Art der Daten:</strong> Namen, Kontaktdaten (E-Mail, Telefon), Adressen, Stundensätze und
            Arbeitszeiten, Projekt-/Einsatzdaten, Rechnungs- und Umsatzdaten, ggf. Fotos (Projektdokumentation).
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Betroffene:</strong> Mitarbeiter des Verantwortlichen sowie dessen Kunden/Auftraggeber, soweit
            deren Daten in der App erfasst werden.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">4. Pflichten des Auftragsverarbeiters</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">Der Auftragsverarbeiter verpflichtet sich:</p>
          <ul className="list-disc list-inside text-slate-600 mb-4 text-sm leading-relaxed space-y-1">
            <li>die Daten ausschließlich auf dokumentierte Weisung des Verantwortlichen zu verarbeiten (Art. 28 Abs. 3 lit. a DSGVO);</li>
            <li>die zur Verarbeitung befugten Personen auf Vertraulichkeit zu verpflichten (lit. b);</li>
            <li>angemessene technische und organisatorische Maßnahmen nach Art. 32 DSGVO zu treffen (siehe Ziffer 6, lit. c);</li>
            <li>Unterauftragsverarbeiter nur nach den Bedingungen dieser Vereinbarung einzusetzen (lit. d, siehe Ziffer 5);</li>
            <li>den Verantwortlichen bei der Erfüllung von Betroffenenanfragen (Art. 15–22 DSGVO) angemessen zu unterstützen (lit. e);</li>
            <li>den Verantwortlichen bei der Einhaltung der Pflichten aus Art. 32–36 DSGVO zu unterstützen (lit. f);</li>
            <li>nach Beendigung der Nutzung alle Daten nach Wahl des Verantwortlichen zu löschen oder zurückzugeben, soweit keine gesetzliche Aufbewahrungspflicht entgegensteht (lit. g, siehe AGB Ziffer 7);</li>
            <li>dem Verantwortlichen alle zum Nachweis der Einhaltung dieser Pflichten erforderlichen Informationen zur Verfügung zu stellen (lit. h).</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">5. Unterauftragsverarbeiter</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Der Verantwortliche erteilt hiermit die generelle Genehmigung zum Einsatz folgender Unterauftragsverarbeiter
            (Art. 28 Abs. 2 DSGVO). Über Änderungen wird der Verantwortliche informiert und kann der Einbeziehung
            neuer Unterauftragsverarbeiter widersprechen.
          </p>
          <ul className="list-disc list-inside text-slate-600 mb-4 text-sm leading-relaxed space-y-1">
            <li><strong>Google Ireland Limited</strong> (Firebase/Google Cloud) — Hosting, Datenbank, Authentifizierung, Datei-Speicherung, EU-Region, DPF-zertifiziert + EU-Standardvertragsklauseln.</li>
            <li><strong>Stripe Payments Europe, Ltd.</strong> — Zahlungsabwicklung.</li>
            <li><strong>Functional Software, Inc. (Sentry)</strong> — Fehler- und Absturzerfassung, EU-Standardvertragsklauseln.</li>
            <li><strong>EmailJS Corp.</strong> — Versand von Benachrichtigungs-E-Mails.</li>
            <li><strong>Vercel Inc.</strong> — Hosting der Webanwendung.</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">6. Technische und organisatorische Maßnahmen (Art. 32 DSGVO)</h2>
          <ul className="list-disc list-inside text-slate-600 mb-4 text-sm leading-relaxed space-y-1">
            <li>Verschlüsselte Übertragung (TLS) für sämtliche Datenverbindungen;</li>
            <li>Zugriffskontrolle auf Datenbankebene je Mandant (mandantengetrennte Firestore-Regeln — jeder Kunde sieht ausschließlich seine eigenen Daten);</li>
            <li>Passwort-Hashing durch den Authentifizierungsanbieter, keine Klartext-Speicherung von Zugangsdaten;</li>
            <li>Rate-Limiting auf sicherheitsrelevanten Endpunkten gegen automatisierte Angriffe;</li>
            <li>Rollenbasierte Berechtigungen (Owner/Mitarbeiter) innerhalb der App;</li>
            <li>Serverseitige Autorisierungsprüfung bei sensiblen Aktionen (z. B. Push-Benachrichtigungen, Admin-Funktionen).</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">7. Kontrollrechte des Verantwortlichen</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Der Verantwortliche hat das Recht, sich in angemessenem Umfang von der Einhaltung der in dieser
            Vereinbarung getroffenen technischen und organisatorischen Maßnahmen zu überzeugen. Anfragen hierzu
            richten sich an <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700">info@earntrack.de</a>.
          </p>

          <p className="text-slate-500 text-xs mt-8 border-t border-slate-200 pt-6">
            Stand: Juli 2026 | Hinweis: Diese AVV wurde nach bestem Wissen anhand der Pflichten aus Art. 28 DSGVO
            erstellt, ersetzt aber keine anwaltliche Prüfung im Einzelfall.
          </p>
        </div>
      </div>
    </div>
  );
}
