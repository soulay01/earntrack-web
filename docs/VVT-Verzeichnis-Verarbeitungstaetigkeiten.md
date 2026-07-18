# Verzeichnis von Verarbeitungstätigkeiten (VVT) — Art. 30 DSGVO

**Verantwortliche Stelle:** Solaiman Tanjaoui, Gabelsbergstraße 5, 55118 Mainz, info@earntrack.de
**Stand:** Juli 2026
**Hinweis:** Internes Dokument zur Vorlage bei einer Aufsichtsbehörde auf Anfrage (Art. 30 Abs. 4 DSGVO).
Kein Ersatz für anwaltliche Prüfung — bei Änderungen an Datenflüssen (neue Dienste, neue Features) aktualisieren.

Ein Datenschutzbeauftragter ist nach aktueller Einschätzung nicht verpflichtend zu bestellen (§ 38 BDSG:
Schwelle von in der Regel mindestens 20 Personen, die ständig mit der automatisierten Verarbeitung
personenbezogener Daten beschäftigt sind, wird bei Solaiman Tanjaoui als Betreiber nicht erreicht). Bei
Wachstum des Teams regelmäßig neu prüfen.

---

## Teil A — EarnTrack als Verantwortlicher (eigene Verarbeitungen)

### A1. Website-Betrieb (earntrack.de)

| Feld | Angabe |
|---|---|
| Zweck | Bereitstellung der Marketing-Website, Kontaktaufnahme |
| Betroffene | Website-Besucher |
| Datenkategorien | IP-Adresse (technisch, im Hosting-Log), Kontaktformular-Angaben falls genutzt |
| Empfänger | Vercel Inc. (Hosting) |
| Drittland | USA — Vercel Inc.; DPF-Status vor Vertragsschluss prüfen |
| Löschfrist | Hosting-Logs nach Anbieter-Standard, i. d. R. kurzfristig |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am Betrieb) |

### A2. Nutzerkonto-Verwaltung (Account-Owner)

| Feld | Angabe |
|---|---|
| Zweck | Registrierung, Authentifizierung, Vertragsverwaltung |
| Betroffene | Registrierte Nutzer (Handwerker/Selbstständige als Kunden) |
| Datenkategorien | Name, E-Mail, Telefon, Adresse, Passwort (gehasht), Unternehmensname |
| Empfänger | Google Ireland Limited (Firebase Auth/Firestore) |
| Drittland | Google LLC (USA) als Mutterkonzern — DPF + SCCs |
| Löschfrist | Bis Kontolöschung, danach 30 Tage; Rechnungsdaten 10 Jahre (§ 147 AO, § 257 HGB) |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |

### A3. Zahlungsabwicklung

| Feld | Angabe |
|---|---|
| Zweck | Abwicklung der Abonnement-Zahlungen |
| Betroffene | Zahlende Kunden |
| Datenkategorien | Name, E-Mail, Zahlungsdaten, Abonnement-Informationen |
| Empfänger | Stripe Payments Europe, Ltd. |
| Drittland | Stripe Inc. (USA) im Konzernverbund — DPF/SCCs |
| Löschfrist | Gemäß steuerrechtlicher Aufbewahrungsfrist (10 Jahre) |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |

### A4. Fehler- und Absturzerfassung

| Feld | Angabe |
|---|---|
| Zweck | Technische Stabilität, Fehlerbehebung |
| Betroffene | Alle Nutzer (Web + Mobile) |
| Datenkategorien | Technische Diagnosedaten, reduzierte IP/E-Mail (Scrubbing aktiv) |
| Empfänger | Functional Software, Inc. (Sentry) |
| Drittland | USA — SCCs |
| Löschfrist | Sentry-Standard-Retention (i. d. R. 90 Tage) |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) |

### A5. Transaktionale E-Mails und Push-Benachrichtigungen

| Feld | Angabe |
|---|---|
| Zweck | Verifizierung, Passwort-Reset, In-App-Benachrichtigungen |
| Betroffene | Registrierte Nutzer |
| Datenkategorien | E-Mail-Adresse, Gerätetoken (FCM/APNs/Expo) |
| Empfänger | Google (Gmail-SMTP, FCM), Apple (APNs), Expo Inc., EmailJS Corp. |
| Drittland | USA (alle vier) — DPF wo zertifiziert, sonst SCCs |
| Löschfrist | Gerätetoken bis Deaktivierung der Benachrichtigungen |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO (Verifizierung/Reset), Art. 6 Abs. 1 lit. a DSGVO (Push, Einwilligung durch Aktivierung) |

---

## Teil B — EarnTrack als Auftragsverarbeiter (im Auftrag der Kunden)

Rechtsgrundlage für diesen Teil: Auftragsverarbeitungsvertrag (AVV) nach Art. 28 DSGVO, siehe `/avv`.
Verantwortlicher ist jeweils der Kunde (Handwerksbetrieb); EarnTrack verarbeitet ausschließlich weisungsgebunden.

### B1. Mitarbeiterverwaltung

| Feld | Angabe |
|---|---|
| Zweck | Verwaltung der Mitarbeiter des Kunden (Namen, Stundensätze, Einsatzhistorie) |
| Betroffene | Mitarbeiter der Kunden |
| Datenkategorien | Name, Stundensatz, Notizen, Zeiterfassungsdaten, ggf. Fotos |
| Empfänger (Sub-Auftragsverarbeiter) | Google Ireland Limited (Firestore) |
| Drittland | Google LLC (USA) — DPF + SCCs |
| Löschfrist | Bis manuelle Löschung durch den Kunden |

### B2. Kundendaten-Verwaltung (Endkunden der Kunden)

| Feld | Angabe |
|---|---|
| Zweck | Verwaltung der Endkunden/Auftraggeber des Kunden |
| Betroffene | Endkunden der Kunden |
| Datenkategorien | Name, Ansprechpartner, Kontaktdaten, Standort, Umsatzdaten |
| Empfänger | Google Ireland Limited (Firestore) |
| Drittland | Google LLC (USA) — DPF + SCCs |
| Löschfrist | Bis manuelle Löschung durch den Kunden |

### B3. Rechnungen und Kostenvoranschläge

| Feld | Angabe |
|---|---|
| Zweck | Erstellung von Rechnungen/Kostenvoranschlägen im Auftrag des Kunden |
| Betroffene | Endkunden der Kunden |
| Datenkategorien | Name, Adresse, Leistungs-/Rechnungsdaten |
| Empfänger | Google Ireland Limited (Firestore/Storage) |
| Drittland | Google LLC (USA) — DPF + SCCs |
| Löschfrist | 10 Jahre (§ 147 AO, § 257 HGB) |

### B4. Zeiterfassung und Einsatzplanung

| Feld | Angabe |
|---|---|
| Zweck | Erfassung von Arbeitszeiten und Einsätzen |
| Betroffene | Mitarbeiter der Kunden |
| Datenkategorien | Kommt/Geht-Zeiten, Einsatzort (kein GPS-Tracking), Projektzuordnung |
| Empfänger | Google Ireland Limited (Firestore) |
| Drittland | Google LLC (USA) — DPF + SCCs |
| Löschfrist | Bis manuelle Löschung durch den Kunden |

---

## Technische und organisatorische Maßnahmen (Art. 32 DSGVO) — Zusammenfassung

- TLS-Verschlüsselung für alle Datenübertragungen
- Mandantengetrennte Zugriffskontrolle auf Datenbankebene (Firestore Security Rules)
- Passwort-Hashing durch Firebase Authentication
- Rate-Limiting auf sicherheitsrelevanten API-Endpunkten
- Rollenbasierte Berechtigungen (Owner/Mitarbeiter)
- Serverseitige Autorisierungsprüfung bei sensiblen Server-Funktionen (u. a. Push-Versand, Admin-Aktionen)
- PII-Scrubbing in der Fehlerberichterstattung (Sentry)

## Offene Punkte / To-Do

- AVV-/DPA-Abschluss mit Firebase (Google), Stripe, Sentry, EmailJS formal bestätigen (Standard-DPAs der
  jeweiligen Anbieter im Dashboard/Account-Bereich akzeptieren, sofern noch nicht geschehen)
- Regelmäßige Aktualisierung dieses VVT bei neuen Features/Diensten
