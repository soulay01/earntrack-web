# Personalisierte Push-Notifications

## Problem

Mobile Push-Notifications enthalten aktuell generische, wöchentlich fix geplante Werbe-Tipps (`scheduleDailyTipNotifications` in `EarnTrack-Android/utils/notifications.js`, 3 statische Texte, Di/Do/Sa 10 Uhr) — unabhängig von den tatsächlichen Nutzerdaten. Das wirkt beliebig und wird als "Müll" wahrgenommen. Gleichzeitig gibt es bereits gute, personalisierte Notifications (Einsatz-Erinnerungen vor Ort, Chat/Foto-Pushes über die bestehende `sendPushToRecipients`-Infrastruktur in `functions/src/index.ts`), die als Vorbild dienen.

## Ziel

1. Generische Werbe-Tipps entfernen.
2. Sieben neue, datenbasierte Notification-Arten einführen, die maximal bestehende Infrastruktur wiederverwenden (kein neues Settings-UI mit Einzel-Schaltern, kein neuer Push-Sende-Mechanismus).

## Architektur

### Client-seitig (EarnTrack-Android)

**Entfernen:** `scheduleDailyTipNotifications`, `cancelDailyTipNotifications`, `DAILY_TIP_MESSAGES` in `utils/notifications.js`, sowie der Aufruf in `App.js` (`scheduleDailyTipNotifications()` im `MainTabs`-Mount-Effect).

**Neu — Inaktivitäts-Erinnerung:** Neue Funktion `scheduleInactivityReminder(assignments)` in `utils/notifications.js`, nach demselben Cancel-and-Reschedule-Prinzip wie `scheduleAllAssignmentNotifications`:
- Findet das neueste `createdAt` unter allen `assignments`.
- Plant EINE lokale Notification (`identifier: 'inactivityReminder'`) für `neuestes createdAt + 7 Tage`, storniert vorher eine evtl. bereits geplante mit derselben ID.
- Wird von denselben Stellen aufgerufen wie `scheduleAllAssignmentNotifications` (Mount-Effect in `App.js`, nach jedem `addAssignment`/`updateAssignment` in `EinsaetzeScreen.js`), damit sie bei jedem neuen Auftrag automatisch neu gesetzt wird.
- Respektiert den bestehenden Master-Toggle (`getNotificationsEnabled`).
- Kein Server nötig — rein lokale Planung wie die bestehenden Einsatz-Reminder.

### Server-seitig (earntrack-web/functions/src/index.ts)

**Bestehende Funktion `checkNotifications` (stündlich, `pubsub.schedule('every 60 minutes')`) erweitert, nicht dupliziert:**

1. **Überfällige Rechnung als Push:** Im bestehenden Loop, wo `dueInvoices` bereits für die E-Mail berechnet wird, zusätzlich `sendPushToRecipients([uid], ...)` aufrufen, wenn `dueInvoices.length > 0`. Wiederverwendet die vorhandene Berechnung 1:1.

2. **Täglicher Block (Stunden-Guard `if (now.getHours() !== 8) return` für diesen Teil, Rest der Funktion läuft weiter stündlich):**
   - **Vergessene Zeiterfassung:** Query `clock_entries` wo `clockOut == null` und `clockIn` vor dem heutigen Kalendertag liegt (pro Firma/User). Push an den betroffenen Mitarbeiter. Feuert täglich weiter, bis der Eintrag geschlossen wird (bewusst kein Dedup — echtes Datenproblem).
   - **Trial-Ende:** Nur für Firmen mit `subscriptionStatus === 'trial'` und gesetztem `trialEndsAt` (Firmen ohne Trial oder mit aktivem/abgelaufenem Abo werden übersprungen). Diff zwischen `trialEndsAt` und heute in Tagen; bei genau 3 oder 1 Push an den Owner.
   - **Wöchentlicher Recap (zusätzlich nur montags, `now.getDay() === 1`):** Aggregiert `assignments` der Vorwoche (Mo–So) pro Firma: Anzahl, Summe Umsatz, durchschnittlicher Profit-Score (gleiche Grade-Grenzen wie `getGrade` in `utils/smartPricing.js` — hier in TS neu, aber wertgleich nachgebaut, da Cloud Functions kein Zugriff auf den Mobile-Code haben). Push an den Owner.

**Zwei neue, ereignisgetriggerte Functions (Firestore `onUpdate`, gleiches Muster wie die bestehenden Foto-/Notiz-Trigger):**

3. **Lager-Nachbestell-Push:** `onUpdate` auf `inventory_items/{itemId}`. Feuert nur beim Übergang `before.quantity >= before.minQuantity && after.quantity < after.minQuantity` (nicht bei jedem weiteren Update, solange der Bestand niedrig bleibt). Push an den Owner der Firma (`companyId` des Items).

4. **Niedrige-Marge-Push:** `onUpdate` auf `assignments/{assignmentId}`. Feuert nur beim Übergang `before.status !== 'Abgeschlossen' && after.status === 'Abgeschlossen'`. Berechnet die Marge inline (Umsatz inkl. Material − Kosten inkl. Material, gleiche Formel wie `calculateAssignmentProfitScore` im Mobile-Code) und pusht nur bei Marge < 10 % (Grade D/F) an den Owner.

Alle neuen Push-Sends laufen über die bestehende `sendPushToRecipients(uids, title, body, buildExpoMessage, fcmData?)`-Funktion — kein neuer Sende-Mechanismus.

## Fehlerbehandlung

Jeder neue Push-Versand und jede neue Datenabfrage läuft in einem eigenen try/catch, analog zum bestehenden per-User-try/catch in `checkNotifications`. Ein Fehler bei einer Notification-Art (z.B. Firestore-Query für vergessene Zeiterfassung schlägt für einen User fehl) darf weder die anderen Notification-Arten im selben Lauf noch die auslösende Datenänderung (Lagerbuchung, Auftragsabschluss) blockieren.

## Sicherheit / Berechtigungen

Keine neuen Firestore-Regeln nötig — alle gelesenen Collections (`assignments`, `clock_entries`, `companies`, `inventory_items`) werden bereits serverseitig über das Firebase Admin SDK gelesen (umgeht Client-Regeln ohnehin, wie `checkNotifications` es heute schon tut).

## Settings

Kein neues UI. Alles hängt am bereits bestehenden Master-Toggle "Push-Benachrichtigungen" (`NOTIFICATIONS_ENABLED_KEY`, client-seitig, für die Inaktivitäts-Erinnerung) bzw. am Vorhandensein eines `expoPushToken`/`fcmToken` auf dem User-Dokument (serverseitig, für alle anderen — `sendPushToRecipients` überspringt User ohne Token bereits automatisch).

## Testing

Keine automatisierte Test-Suite in diesem Projekt (etablierte Konvention). Verifikation manuell: TypeScript-Kompilierung der Cloud Functions, Babel-Syntax-Check des Mobile-Codes, Deploy der Functions, und für die ereignisgetriggerten Functions ein manueller Test durch gezieltes Auslösen der Bedingung (Lagerbestand unter Minimum buchen, Auftrag auf "Abgeschlossen" mit niedriger Marge setzen) mit Prüfung in den Firebase-Function-Logs, dass die Push-Sende-Funktion aufgerufen wurde.

## Out of Scope

- Kein neues granulares Settings-UI mit Einzel-Schaltern pro Notification-Art.
- Keine Änderung an der bestehenden E-Mail-Erinnerungslogik (`emailInvoices`/`emailReports`) außer der zusätzlichen Push-Ergänzung für überfällige Rechnungen.
- Keine Änderung an den bestehenden Einsatz-Lead-Time-Remindern.
