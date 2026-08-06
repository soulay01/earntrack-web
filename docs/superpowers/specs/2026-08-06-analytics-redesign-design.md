# Analytics-Redesign: Aktivität & Downloads

Status: Approved (Design), 2026-08-06

## Problem

Die bestehende Admin-Analytics-Seite (web: `src/app/analytics/page.tsx`, mobile:
`screens/AdminAnalyticsScreen.js` + `screens/adminAnalytics/*`) zeigt viele Zahlen,
aber:

- Wer die App zuletzt benutzt hat, steckt versteckt in einer Spalte der
  Nutzer-Tabelle (`lastActive`) statt prominent sichtbar zu sein.
- Es gibt keine Plattform-Sicht (Web vs. iOS vs. Android).
- Es gibt keine Downloadzahlen für App Store / Play Store, mit oder ohne
  Zeitraumfilter.
- Die Übersichtsseite reiht viele gleich gewichtete Blöcke aneinander, ohne
  Priorität.

Beide Apps (web + mobile) teilen sich dieselbe Backend-API
(`/api/analytics/data`), also wird die Datengrundlage einmal erweitert und von
beiden Frontends konsumiert.

## Bestehende, bisher ungenutzte Datenquelle

Die Cloud Function `logUsage` (`earntrack-web/functions/src/index.ts:1110`)
schreibt bei jeder Nutzeraktion zusätzlich zum bestehenden `usage_log`
(Tages-Aggregat) einen Eintrag in `activity_events`:

```
{ uid, action, platform: 'web' | 'ios' | 'android', createdAt: Timestamp }
```

Diese Collection wird aktuell von keiner Route gelesen. Sie ist die
Grundlage für die "wer zuletzt aktiv"-Ansicht und den Plattform-Split, ganz
ohne neue Instrumentierung im Client.

## Datenschicht-Änderungen

### `/api/analytics/data/route.ts`

Zusätzlich zu den bestehenden Parallel-Queries:

- Query `activity_events` im gewählten `timeRange`, sortiert nach `createdAt`
  absteigend, limitiert (z. B. `limit(500)` serverseitig, kein Full-Scan).
- Neue Response-Felder:
  - `recentActivity`: die letzten ~50 Events, gejoint gegen `dedupedUsers`
    (Name, E-Mail, Firma), mit `platform`, `action`, `at` (ISO-String).
  - `platformBreakdown`: `{ web: number, ios: number, android: number }` —
    Anzahl Events im Zeitraum je Plattform, plus `platformTrend` (Array pro
    Tag, gestapelt) für den Trend-Chart.
- Jeder Eintrag der bestehenden `users`-Liste bekommt zusätzlich
  `lastPlatform: 'web' | 'ios' | 'android' | null`, ermittelt aus dem
  jeweils neuesten `activity_events`-Eintrag pro `uid`.

### Downloads: neue Collection `store_downloads`

```
{ date: 'YYYY-MM-DD', platform: 'ios' | 'android', downloads: number, installs?: number }
```

- Neue geplante Cloud Function (Firebase Scheduler, gleiches Muster wie
  `checkNotifications`), täglich einmal:
  - Ruft App Store Connect API (Sales & Trends Reports) für iOS-Downloads ab.
  - Ruft Google Play Developer API (Reporting) für Android-Installationen ab.
  - Schreibt/merged den Tageswert in `store_downloads`.
  - Schlägt der Abruf für eine Plattform fehl: Fehler loggen, alten Wert
    NICHT überschreiben, restliche Function läuft weiter.
- **Blockiert auf Zugangsdaten des Nutzers** (App Store Connect API Key,
  Google Play Service Account JSON) — diese existieren noch nicht. Die
  Function wird mit Platzhalter-Env-Vars gebaut; sie no-opt (loggt "nicht
  konfiguriert") solange die Secrets fehlen, statt zu crashen.
- `/api/analytics/data` liest `store_downloads` im gewählten Zeitraum
  genau wie heute schon `page_views`, liefert `kpis.downloads` (gesamt,
  je Plattform, Trend ggü. Vorperiode) plus `charts.downloadsData`
  (gestapelt nach Plattform pro Tag).
- Ist die Collection leer → API liefert `kpis.downloads.configured: false`,
  kein synthetischer 0-Wert, der wie eine echte Messung aussieht.

## Web-Frontend (`src/app/analytics/`)

### Übersicht-Tab (neu priorisiert, oben nach unten)

1. **"Gerade aktiv"-Leiste** (neu, kompakt): Anzahl Nutzer aktiv in den
   letzten 5 Minuten (aus `recentActivity` gefiltert), Avatare/Initialen,
   klickbar → öffnet bestehendes `UserModal`.
2. **Zuletzt-aktive-Nutzer-Karte** (neu, prominent): Top 8 aus
   `recentActivity`, dedupliziert auf letzten Event pro `uid`. Zeigt Name/
   Firma, Plattform-Icon (Web/iOS/Android), relative Zeit, letzte Aktion.
3. Hero-KPIs (aktiv heute, echte User, Umsatz, Demo-Conversion) — bestehend,
   kompaktere Darstellung.
4. Live-Feed (`LiveFeed.tsx`) — bestehend, erweitert (siehe unten).
5. Wachstum & Verteilungs-Charts — bestehend, unverändert an Position
   verschoben (weiter unten, da am wenigsten akut).

`NeusteUserBox` (Registrierungen/Demos) bleibt, wandert unter die neue
Zuletzt-aktiv-Karte.

### `LiveFeed.tsx` Erweiterung

Zusätzlicher `onSnapshot` auf `activity_events` (`orderBy('createdAt', 'desc')`,
`limit(15)`), neuer `FeedEvent.kind = 'nutzung'`. Label/Sublabel aus dem
gejointen User (E-Mail/Name), Sublabel zeigt `action` + Plattform-Badge.

### Neuer Tab "Aktivität"

- Zeitraum-Filter: bestehender globaler `timeRange`-Selector (7/30/90 Tage)
  gilt auch hier.
- DAU-Chart, Feature-Nutzung: aus Übersicht hierher verschoben (keine
  inhaltliche Änderung, nur Umzug).
- **Plattform-Split** (neu): Donut-Chart `platformBreakdown` + Flächenchart
  `platformTrend` über Zeit.
- Volle "Zuletzt aktiv"-Tabelle: alle Einträge aus `recentActivity`,
  sortierbar nach Zeit/Plattform/Nutzer, mit Suche (gleiches Pattern wie
  die Nutzer-Tabelle im "Nutzer"-Tab).

### Neuer Tab "Downloads"

- Eigener Zeitraum-Filter (heute/7/30/90 Tage), unabhängig vom globalen,
  mit Vergleich zur Vorperiode (analog `UserGrowthComparison`).
- KPI-Karten: Downloads gesamt, iOS, Android, Delta ggü. Vorperiode.
- Gestapeltes Flächen-/Balkenchart: Downloads pro Tag nach Plattform.
- `kpis.downloads.configured === false` → Empty-State mit 3-Schritte-Anleitung
  (App Store Connect API Key erstellen, Google Play Service Account
  erstellen, Env-Vars in Firebase Functions setzen) statt Chart.

## Mobile-Frontend (`EarnTrack-Android/screens/`)

Gleiche Datengrundlage, gleiche Priorisierung, an den kleinen Screen
angepasst:

- `AdminAnalyticsScreen.js`: `TABS`-Array erweitert auf
  `['ubersicht', 'aktivitaet', 'nutzer', 'downloads', 'website', 'umsatz']`;
  Tableiste wechselt von `flex:1`-Buttons auf horizontal scrollbare
  `ScrollView` (gleiches visuelles Tab-Styling, kein `flex:1` mehr auf den
  Buttons).
- `OverviewTab.js`: "Zuletzt aktiv"-Liste (kompakt, 5 Einträge) direkt nach
  dem KPI-Grid eingefügt, vor den bestehenden Charts.
- Neuer `ActivityTab.js` (Pattern wie `MetricsTabs.js`): DAU-Chart,
  Plattform-Split als horizontale `RankedList`-Balken (chart-kit hat keinen
  brauchbaren Donut), volle Zuletzt-aktiv-Liste mit Suche (Pattern aus
  `UsersTab.js` wiederverwendet).
- Neuer `DownloadsTab.js`: KPI-Kacheln (`Kpi`-Komponente aus
  `MetricsTabs.js` wiederverwendet) + Balkenchart, gleicher Empty-State-Text
  wie Web.
- `screens/adminAnalytics/api.js`: kein Änderungsbedarf, die Response wächst
  nur um Felder, die bestehende `fetchAnalyticsData`-Funktion bleibt gleich.

## Fehlerbehandlung

- `activity_events`-Query serverseitig zeit- und mengenbegrenzt, kein
  Full-Table-Scan bei großer Historie.
- Fehlt `store_downloads` komplett (noch nicht eingerichtet) → expliziter
  "nicht verbunden"-Zustand, niemals ein 0-Chart, das wie eine echte Messung
  aussieht.
- Schlägt der tägliche Store-API-Abruf für eine Plattform fehl → Fehler
  loggen (`functions.logger.error`), letzten bekannten Wert behalten, andere
  Plattform trotzdem schreiben.

## Tests

- Unit-Tests für die neuen Aggregationsfunktionen in
  `/api/analytics/data/route.ts` (Plattform-Grouping aus `activity_events`,
  Downloads-Zeitraum-Vergleich inkl. Vorperiode, `configured`-Flag-Logik bei
  leerer `store_downloads`-Collection). Diese Logik hat echtes Fehlerpotential
  (Bucketing, Off-by-one bei Zeiträumen).
- Keine Playwright-E2E-Suite: interne, auth-geschützte Admin-Seite. Visuelle
  Verifikation erfolgt manuell im Browser (web) und Simulator (mobile) nach
  Umsetzung.

## Out of Scope

- Tatsächliche Anbindung an App Store Connect API / Google Play Developer
  API (Implementierung der Cloud Function wartet auf die Zugangsdaten des
  Nutzers — separater Schritt, sobald verfügbar).
- Änderungen an "Website"- und "Umsatz"-Tabs (bleiben wie heute).
