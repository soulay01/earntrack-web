import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AGB – Allgemeine Geschäftsbedingungen',
  description: 'Allgemeine Geschäftsbedingungen (AGB) der EarnTrack App',
};

export default function AGBPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-teal-600 text-sm font-semibold hover:text-teal-700 mb-8 inline-block">
          ← Zurück zur Startseite
        </Link>

        <div className="bg-white rounded-3xl shadow-xl border border-teal-100 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-8">Allgemeine Geschäftsbedingungen (AGB)</h1>

          <p className="text-slate-500 text-sm mb-8 border-b border-slate-200 pb-4">
            Stand: Mai 2026
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">1. Geltungsbereich</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der EarnTrack-App
            (nachfolgend „App"), betrieben von Solaiman Tanjaoui, Gabelsbergstraße 5, 55118 Mainz
            (nachfolgend „Anbieter").
            Die AGB regeln das Vertragsverhältnis zwischen dem Anbieter und dem Nutzer (nachfolgend „Kunde")
            der App. Abweichende Bedingungen des Kunden werden nicht anerkannt, es sei denn, der Anbieter
            stimmt ihnen ausdrücklich schriftlich zu.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">2. Vertragsgegenstand</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            EarnTrack ist eine SaaS-Anwendung zur Verwaltung von Einsätzen, Mitarbeitern, Kunden,
            Rechnungen und Angeboten für Handwerker und Selbstständige. Der genaue Funktionsumfang ergibt sich aus
            der jeweils aktuellen Beschreibung in der App und auf der Website. Der Anbieter behält sich
            vor, die Funktionen der App jederzeit zu ändern, zu erweitern oder einzuschränken, sofern
            dies für den Kunden zumutbar ist.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">3. Registrierung und Konto</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Für die Nutzung der App ist eine Registrierung erforderlich. Der Kunde ist verpflichtet,
            bei der Registrierung wahrheitsgemäße und vollständige Angaben zu machen. Der Kunde darf
            sein Konto nicht Dritten zur Nutzung überlassen. Der Kunde ist für die Sicherheit seiner
            Zugangsdaten verantwortlich. Bei Verdacht auf Missbrauch ist der Anbieter unverzüglich zu
            informieren.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">4. Zahlungsbedingungen</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Die Nutzung der App erfolgt gegen Zahlung einer monatlichen Gebühr entsprechend des
            gewählten Tarifs (Solo, Team oder Business). Alle Preise verstehen sich in Euro
            inklusive der gesetzlichen Umsatzsteuer. Die Zahlung erfolgt per Lastschrift (SEPA)
            über Stripe. Der Kunde ermächtigt den Anbieter, die fälligen Beträge von seinem
            angegebenen Konto einzuziehen. Bei Zahlungsverzug ist der Anbieter berechtigt, die
            Nutzung der App bis zum Zahlungseingang zu sperren.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">5. Widerrufsrecht</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Dem Kunden steht ein gesetzliches Widerrufsrecht zu. Die Widerrufsfrist beträgt
            14 Tage ab Vertragsschluss. Zur Wahrung der Widerrufsfrist genügt die rechtzeitige
            Absendung des Widerrufs. Der Kunde kann das Muster-Widerrufsformular verwenden,
            das auf Anfrage zur Verfügung gestellt wird. Bei einem Abonnement erlischt das
            Widerrufsrecht, wenn der Anbieter mit der Ausführung der Dienstleistung vor Ablauf
            der Widerrufsfrist begonnen hat und der Kunde ausdrücklich zugestimmt hat.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">6. Laufzeit und Kündigung</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Das Abonnement läuft ab dem Zeitpunkt der Buchung auf unbestimmte Zeit und kann
            vom Kunden jederzeit mit einer Frist von 14 Tagen zum Monatsende gekündigt werden.
            Die Kündigung kann über die Einstellungen in der App oder per E-Mail an
            <a href="mailto:info@earntrack.de" className="text-teal-600 hover:text-teal-700"> info@earntrack.de</a>
            erfolgen. Nach der Kündigung hat der Kunde noch bis zum Ende des aktuellen
            Abrechnungszeitraums Zugriff auf die App. Der Anbieter ist berechtigt, das Vertragsverhältnis
            aus wichtigem Grund außerordentlich zu kündigen, insbesondere bei Verstoß gegen diese AGB.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">7. Datenlöschung nach Kündigung</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Nach Beendigung des Vertragsverhältnisses hat der Kunde 7 Tage Zeit, seine Daten
            zu exportieren. Nach Ablauf dieser Frist werden alle Daten des Kunden unwiderruflich
            gelöscht, sofern keine gesetzliche Aufbewahrungspflicht (z. B. steuerliche
            Aufzeichnungspflichten nach §147 AO) entgegensteht. In diesem Fall werden die
            betroffenen Daten für die Dauer der gesetzlichen Aufbewahrungsfrist gesperrt
            und anschließend gelöscht.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">8. Haftung</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens,
            des Körpers oder der Gesundheit sowie für Schäden, die auf einer vorsätzlichen
            oder grob fahrlässigen Pflichtverletzung des Anbieters beruhen. Im Übrigen ist
            die Haftung des Anbieters auf den Ersatz der typischerweise vorhersehbaren
            Schäden begrenzt. Die Haftung für leicht fahrlässige Pflichtverletzungen ist
            ausgeschlossen, sofern keine wesentlichen Vertragspflichten (Kardinalpflichten)
            betroffen sind. Die App wird mit einer Verfügbarkeit von mindestens 97 %
            bereitgestellt. Der Anbieter haftet nicht für Ausfälle aufgrund von
            Wartungsarbeiten, höherer Gewalt oder Umstände, die außerhalb des
            Einflussbereichs des Anbieters liegen.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">9. Datenschutz</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Die Erhebung, Verarbeitung und Nutzung personenbezogener Daten erfolgt gemäß
            der Datenschutzerklärung des Anbieters, die unter
            <Link href="/datenschutz" className="text-teal-600 hover:text-teal-700"> /datenschutz</Link>
            abrufbar ist.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">10. Urheberrecht</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Die App sowie alle darin enthaltenen Inhalte, Grafiken, Logos und Software sind
            urheberrechtlich geschützt. Der Kunde erhält ein einfaches, nicht übertragbares
            Nutzungsrecht für die Dauer des Vertragsverhältnisses. Eine Vervielfältigung,
            Verbreitung oder öffentliche Zugänglichmachung der App oder ihrer Inhalte ist
            nicht gestattet.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">11. Salvatorische Klausel</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Sollte eine Bestimmung dieser AGB unwirksam sein oder werden, wird die
            Wirksamkeit der übrigen Bestimmungen dadurch nicht berührt. Anstelle der
            unwirksamen Bestimmung gilt eine wirksame Regelung, die dem wirtschaftlichen
            Zweck der unwirksamen Bestimmung am nächsten kommt.
          </p>

          <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">12. Anwendbares Recht und Gerichtsstand</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des
            UN-Kaufrechts (CISG). Gerichtsstand für alle Streitigkeiten aus diesem
            Vertrag ist der Sitz des Anbieters, sofern der Kunde Kaufmann ist. Für
            Verbraucher gilt der gesetzliche Gerichtsstand.
          </p>

          <p className="text-slate-500 text-xs mt-8 border-t border-slate-200 pt-6">
            Stand: Mai 2026 | Hinweis: Diese AGB bedürfen der rechtlichen Prüfung durch einen
            Rechtsanwalt. Der Anbieter trägt die alleinige Verantwortung für den Inhalt.
          </p>
        </div>
      </div>
    </div>
  );
}
