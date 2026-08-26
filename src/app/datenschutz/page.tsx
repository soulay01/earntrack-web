import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description: 'Datenschutzerklärung der EarnTrack App',
};

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-teal-600 text-sm font-semibold hover:text-teal-700 mb-8 inline-block">
          ← Zurück zur Startseite
        </Link>

        <div className="bg-white rounded-3xl shadow-xl border border-teal-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Datenschutzerklärung</h1>
          <p className="text-slate-500 text-sm mb-8 border-b border-slate-200 pb-4">Stand: August 2026</p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">1. Verantwortlicher</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Solaiman Tanjaoui<br />
            Gabelsbergstraße 5<br />
            55118 Mainz<br />
            E-Mail: <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700">info@earntrack.de</a>
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Diese Datenschutzerklärung gilt einheitlich für die Web-App auf earntrack.de, die
            zugehörige mobile App sowie die öffentlichen Informationsseiten.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">2. Registrierung und Nutzerkonto</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Zur Nutzung von EarnTrack ist eine Registrierung mit E-Mail-Adresse und Passwort
            (oder alternativ per Google-/Apple-Login) erforderlich. Gespeichert werden dabei:
            E-Mail-Adresse, Passwort (verschlüsselt/gehasht über den Authentifizierungsanbieter),
            Zeitpunkt der Registrierung, Verifizierungsstatus sowie die im Onboarding
            angegebenen Firmendaten (Name, Unternehmen, Telefon, Adresse).
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">3. Nutzung der App</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Bei der Nutzung verarbeiten wir die von dir selbst eingegebenen Daten:
          </p>
          <ul className="list-disc list-inside text-slate-600 mb-4 text-sm leading-relaxed space-y-1">
            <li><strong>Mitarbeiterdaten:</strong> Namen, Stundensätze, Notizen, Einsatzhistorie</li>
            <li><strong>Kundendaten:</strong> Namen, Ansprechpartner, Kontaktdaten, Standorte, Umsatz</li>
            <li><strong>Einsatz-, Rechnungs- und Angebotsdaten:</strong> Datum, Ort, Stunden, Umsatz, Gewinn</li>
          </ul>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Diese Daten dienen ausschließlich der Bereitstellung der App-Funktionen und sind
            jederzeit von dir selbst bearbeit- oder löschbar.
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Soweit
            du Daten von Mitarbeitern oder Kunden Dritter einträgst, bist du hierfür
            datenschutzrechtlich Verantwortlicher; wir verarbeiten diese Daten als
            Auftragsverarbeiter auf Grundlage der{' '}
            <Link href="/avv" className="text-teal-600 hover:text-teal-700">Auftragsverarbeitungsvereinbarung (AVV)</Link>.
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Für einzelne Funktionen der mobilen App fordert diese zusätzlich folgende
            Berechtigungen an, jeweils erst bei erstmaliger Nutzung und mit Erklärung im
            System-Dialog: Kamera (QR-Code-Scan bei Lager-Artikeln), Fotos
            (Projektdokumentation) und Kalender (optionales Eintragen von Terminen/Einsätzen
            in deinen Gerätekalender — die Einträge verbleiben dort und werden nicht an uns
            übermittelt). Diese Berechtigungen kannst du jederzeit in den
            Betriebssystem-Einstellungen widerrufen.
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch
            Erteilung der Berechtigung).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">4. Eingesetzte Dienste und Auftragsverarbeiter</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Zum Betrieb von EarnTrack setzen wir folgende Dienstleister ein:
          </p>

          <h3 className="text-md font-bold text-slate-700 mt-4 mb-1">Firebase / Google Cloud (Google)</h3>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Genutzt für
            Nutzerkonto-Authentifizierung, Datenbank (Firestore, EU-Region), Datei-Speicherung
            und Server-Funktionen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Drittlandtransfer:
            EU-US Data Privacy Framework (DPF) zertifiziert, zusätzlich EU-Standardvertragsklauseln
            (Art. 46 Abs. 2 lit. c DSGVO).
          </p>

          <h3 className="text-md font-bold text-slate-700 mt-4 mb-1">Vercel Inc. (Hosting)</h3>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA. Hosting der Web-App.
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b, f DSGVO. Drittlandtransfer: EU-US Data
            Privacy Framework (DPF) zertifiziert, zusätzlich EU-Standardvertragsklauseln.
          </p>

          <h3 className="text-md font-bold text-slate-700 mt-4 mb-1">Stripe (Zahlungsabwicklung)</h3>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin,
            Irland. Zur Abwicklung der Abonnement-Zahlungen (SEPA-Lastschrift/Kartenzahlung).
            Übermittelt werden Name, E-Mail-Adresse, Zahlungsdaten und Abo-Informationen.
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
          </p>

          <h3 className="text-md font-bold text-slate-700 mt-4 mb-1">Sentry (Fehlererfassung)</h3>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Functional Software, Inc. (d/b/a Sentry), 132 Hawthorne Street, San Francisco, CA
            94107, USA. Erfasst automatisiert Programmfehler und Abstürze zur Sicherstellung der
            technischen Stabilität. Auth-Header, Cookies und Dateipfade mit Nutzernamen werden vor
            Übermittlung entfernt (Scrubbing); Standard-PII-Erfassung ist deaktiviert
            (<code>sendDefaultPii: false</code>). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
            (berechtigtes Interesse an fehlerfreiem Betrieb). Drittlandtransfer:
            EU-Standardvertragsklauseln.
          </p>

          <h3 className="text-md font-bold text-slate-700 mt-4 mb-1">EmailJS (Benachrichtigungs-E-Mails)</h3>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            EmailJS Corp., USA. Genutzt für den Versand bestimmter Benachrichtigungs-E-Mails
            innerhalb der App (z. B. Team- und Projekt-Benachrichtigungen). Rechtsgrundlage:
            Art. 6 Abs. 1 lit. b DSGVO. Drittlandtransfer: EU-Standardvertragsklauseln
            (Art. 46 Abs. 2 lit. c DSGVO).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">5. Logfiles und IP-Adressen</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Zum Schutz vor Missbrauch (Rate-Limiting auf sicherheitsrelevanten Endpunkten, z. B.
            Login oder Kontolöschung) wird die IP-Adresse eines Aufrufs kurzzeitig im
            Arbeitsspeicher verarbeitet. Sie wird dabei nicht dauerhaft gespeichert, nicht
            protokolliert und nicht mit anderen personenbezogenen Daten zusammengeführt.
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
            an der sicheren Bereitstellung der App).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">6. Cookies und lokaler Speicher</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Wir setzen auf earntrack.de keine Cookies und kein Tracking, Analytics- oder
            Marketing-Skript ein. Der Anmeldestatus wird von unserem Authentifizierungsanbieter
            im lokalen Speicher (<code>localStorage</code>) deines Browsers abgelegt, nicht über
            Cookies. Dieser Speicher verlässt niemals deinen Browser und wird nicht an uns
            übertragen.
          </p>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
            an der Funktionalität der Web-App).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">7. Speicherdauer und Datenlöschung</h2>
          <ul className="list-disc list-inside text-slate-600 mb-4 text-sm leading-relaxed space-y-1">
            <li><strong>Nutzerkonto, Mitarbeiter-, Kunden- und Einsatzdaten:</strong> Bis zur Löschung durch dich bzw. bis zur Kontolöschung. Die Löschung nach Kontokündigung erfolgt sofort und unwiderruflich, spätestens nach Ablauf der in den <Link href="/agb" className="text-teal-600 hover:text-teal-700">AGB</Link> genannten Export-Frist von 7 Tagen.</li>
            <li><strong>Rechnungsdaten:</strong> 10 Jahre gemäß gesetzlicher Aufbewahrungspflicht (§ 147 AO, § 257 HGB).</li>
            <li><strong>Widerrufsverzicht-Zustimmung (Zeitstempel, IP):</strong> Für die Dauer der Vertragsbeziehung zu Nachweiszwecken, danach im Rahmen der gesetzlichen Aufbewahrungsfristen.</li>
          </ul>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b, c DSGVO.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">8. Deine Rechte</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">Du hast jederzeit das Recht auf:</p>
          <ul className="list-disc list-inside text-slate-600 mb-4 text-sm leading-relaxed space-y-1">
            <li><strong>Auskunft</strong> über deine gespeicherten personenbezogenen Daten (Art. 15 DSGVO)</li>
            <li><strong>Berichtigung</strong> unrichtiger Daten (Art. 16 DSGVO)</li>
            <li><strong>Löschung</strong> deiner Daten (Art. 17 DSGVO)</li>
            <li><strong>Einschränkung</strong> der Verarbeitung (Art. 18 DSGVO)</li>
            <li><strong>Datenübertragbarkeit</strong> in einem maschinenlesbaren Format (Art. 20 DSGVO) — nutzbar direkt über <Link href="/settings/export" className="text-teal-600 hover:text-teal-700">Einstellungen → Export</Link></li>
            <li><strong>Widerspruch</strong> gegen die Verarbeitung (Art. 21 DSGVO)</li>
            <li><strong>Widerruf</strong> einer erteilten Einwilligung jederzeit (Art. 7 Abs. 3 DSGVO)</li>
          </ul>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Zur Ausübung deiner Rechte kontaktiere uns unter{' '}
            <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700">info@earntrack.de</a>.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">9. Beschwerderecht</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, wenn du
            der Ansicht bist, dass die Verarbeitung deiner personenbezogenen Daten nicht
            rechtmäßig ist. Zuständig ist die Datenschutzbehörde deines Wohnsitzes oder unseres
            Unternehmenssitzes (Landesbeauftragter für den Datenschutz und die
            Informationsfreiheit Rheinland-Pfalz).
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">10. SSL-/TLS-Verschlüsselung</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Diese Website und die App nutzen aus Sicherheitsgründen durchgehend eine SSL- bzw.
            TLS-Verschlüsselung für sämtliche Datenübertragungen.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">11. Änderungen dieser Datenschutzerklärung</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Wir behalten uns vor, diese Datenschutzerklärung zu aktualisieren, um sie an
            geänderte Rechtslagen oder Änderungen unseres Dienstes anzupassen. Die jeweils
            aktuelle Version ist auf earntrack.de verfügbar.
          </p>
        </div>
      </div>
    </div>
  );
}
