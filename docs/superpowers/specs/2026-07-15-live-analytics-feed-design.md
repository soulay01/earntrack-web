# Live-Analytics-Feed & User-Aktivitäts-Historie

## Problem

Die bestehende Analytics-Seite (`/analytics`, nur sichtbar für `soulaymanking@gmail.com`) lädt alle Daten einmalig beim Öffnen (`getDocs`/API-Call). Der Admin muss manuell neu laden, um zu sehen, ob sich gerade etwas Neues ereignet hat (Registrierung, Zahlung, Demo-Anmeldung, Upgrade, Kündigung). Außerdem gibt es pro User nur ein Aggregat (Status, letzte Aktivität, Aktions-Zähler), aber keine granulare Historie (welche Aktionen wann, auf welcher Plattform).

## Ziel

1. **Live-Feed** wichtiger Events (Registrierung, Zahlung, Demo-Anmeldung, Pro-Upgrade, Kündigung) direkt auf der Analytics-Seite, ohne Neuladen.
2. **Aktivitäts-Historie pro User** (letzte ~50 Aktionen mit Zeitpunkt und Plattform) im bestehenden `UserModal`.

## Architektur

### Live-Feed — direkt auf bestehenden Collections

Kein neues Backend nötig. `onSnapshot`-Listener (Firestore-Client-SDK, gleiches Muster wie `useInventory`/`useEmployees` in der Mobile-App) auf:

- `users` — neue Registrierung, sortiert nach `createdAt desc`, `limit(1)` initial + Listener auf neue Dokumente.
- `payment_requests` — neue Zahlungsanfrage.
- `demo_signups` — neue Demo-Anmeldung.
- `companies` — Statuswechsel (`subscriptionStatus`): `trial → active` = Upgrade, `active → expired`/`cancelled` = Kündigung. Erkennung durch Vergleich mit dem zuletzt bekannten Status pro `companyId` im Client-State (kein serverseitiger Diff nötig).

Jedes neu erkannte Event wird oben in eine clientseitige Feed-Liste (State, kein Firestore-Schreiben) eingefügt, mit kurzem visuellen Hervorheben (Einblendung), kein Sound/Push.

### Aktivitäts-Historie — neue Collection `activity_events`

```
activity_events/{autoId}
  uid: string
  action: string          // z.B. "assignment_created", "login", "employees_added"
  platform: 'web' | 'ios' | 'android'
  createdAt: Timestamp (serverTimestamp)
  meta?: object            // optional, aktionsspezifisch, klein halten
```

**Schreibwege:**

- **Mobile:** Bestehende Cloud Function `logUsage` (in `functions/src/index.ts`) bekommt zusätzlich zum bisherigen Tages-Aggregat-Merge (`usage_log/{uid}_{date}`) einen `addDoc` in `activity_events`. Der Mobile-Client (`utils/usageLog.js`) schickt zusätzlich `platform: Platform.OS` mit.
- **Web:** Es gibt aktuell kein Action-Logging im Web-App-Client. Wird an den analogen Stellen ergänzt (Login, zentrale Feature-Aktionen), ruft dieselbe `logUsage`-Function auf mit `platform: 'web'`.

Der bestehende Tages-Aggregat-Schreibpfad (`usage_log`) bleibt unverändert bestehen — er wird weiterhin für die "Top Aktionen (30 Tage)"-Auswertung im bestehenden Admin-Panel gebraucht. `activity_events` ist rein additiv.

**Fehlerbehandlung:** Der `addDoc`-Aufruf in `activity_events` läuft in einem eigenen try/catch innerhalb der Cloud Function, getrennt vom bestehenden `usage_log`-Merge. Ein Fehler beim Event-Log darf die eigentliche Nutzeraktion nie blockieren — gleiches Prinzip wie das bestehende lautlose Fehlschlagen von `logUsage` im Client (`utils/usageLog.js`: `.catch(() => {})`).

### Firestore-Regeln (`activity_events`)

```
match /activity_events/{doc} {
  allow read: if isAuth() && isAdmin();
  allow create: if isAuth() && request.resource.data.uid == request.auth.uid;
  allow update, delete: if false;
}
```

Client darf nur eigene Events anlegen (create), nie ändern/löschen. Lesen nur Admin (Analytics-Seite).

**Hinweis (aus vorheriger Session-Erfahrung):** `earntrack-web/firestore.rules` ist die aktuelle, autoritative Regel-Datei — nicht die Kopie im `EarnTrack-Android`-Repo, die zurückliegt. Deploy von dort aus (`firebase deploy --only firestore:rules`), siehe Projekt-Memory zu abweichenden Rules-Kopien.

## UI

### Live-Feed

Ersetzt/erweitert die bestehende `NeusteUserBox` oben im "Übersicht"-Tab der Analytics-Seite. Zeigt die letzten ~30 Events, neueste oben:

- Icon je Event-Typ (Registrierung/Zahlung/Demo/Upgrade/Kündigung)
- Name/E-Mail
- Relative Zeit ("vor 5 Sek."), live nachtickend
- Neue Einträge blenden kurz farbig ein

### User-Aktivitäts-Historie

Neuer Abschnitt im bestehenden `UserModal`, unter den vorhandenen Info-Cards: "Aktivität" — kompakte, scrollbare Liste (Icon, Aktion, Plattform-Badge, Zeit). Lädt on-demand erst beim Öffnen des Modals (Query `activity_events` gefiltert nach `uid`, `createdAt desc`, `limit(50)`) — nicht vorab für alle User, um Firestore-Reads zu sparen.

## Sicherheit

Alles bleibt hinter dem bestehenden Admin-Check: `isAdmin` wird serverseitig über `/api/admin/verify` geprüft (nicht nur clientseitig), exakt wie der Rest der Analytics-Seite es heute schon macht. Kein neuer Auth-Mechanismus nötig.

## Testing

Es existiert aktuell keine automatisierte Test-Suite für `earntrack-web` oder die Cloud Functions — reine manuelle Verifikation ist die etablierte Praxis in diesem Projekt. Nach Implementierung: neuen Test-User registrieren, live im Feed beobachten, `UserModal`-Historie prüfen (Web- und Mobile-Aktion), Statuswechsel (Upgrade/Kündigung) simulieren und im Feed bestätigen.

## Out of Scope (bewusst nicht Teil dieses Designs)

- Kein Zugriff auf rohe Firestore-Dokumente über die UI (kein generischer DB-Editor) — nur die bereits bestehenden, spezifischen Aktionen (Pro geben/entfernen, Demo beenden, löschen).
- Kein direkter E-Mail/Kontakt-Versand an User aus dem Panel heraus (wurde in der Anforderungsklärung explizit nicht priorisiert).
- Keine Änderung an der bestehenden `usage_log`-Aggregat-Logik oder den bestehenden Charts/Tabs (Website, Umsatz) — bleiben unverändert.
