# Lexoffice/sevDesk Zahlungsstatus-Rücksync

## Problem

`src/lib/lexoffice.ts` und `src/lib/sevdesk.ts` können Rechnungen aktuell nur als Entwurf zu Lexoffice/sevDesk **pushen** (`pushInvoiceToLexoffice`, `pushInvoiceToSevdesk`). Die Verknüpfung wird beim Push in `assignments/{id}.integrationSyncs.{lexoffice|sevdesk}` gespeichert (`{ syncedAt, externalId }`, geschrieben in `src/app/invoices/page.tsx:328`). Wird die Rechnung anschließend beim Anbieter finalisiert und als bezahlt markiert, bekommt EarnTrack das nicht mit — der Nutzer muss `invoiceStatus` manuell auf `bezahlt` setzen, obwohl diese Information bereits in Lexoffice/sevDesk vorliegt. Das ist der Punkt doppelter Handarbeit, den dieses Feature schließt.

## Ziel

Wird eine gepushte Rechnung beim jeweiligen Anbieter als bezahlt markiert, setzt EarnTrack automatisch `invoiceStatus: 'bezahlt'` auf dem zugehörigen `assignment`-Dokument — ohne manuellen Eingriff.

**Explizit außerhalb des Scopes** (YAGNI, spätere Erweiterung falls gebraucht):
- Rücksync von Versand-/Finalisierungsstatus (nur draft→gesendet)
- Rücksync von inhaltlichen Änderungen (Beträge, Positionen) — EarnTrack bleibt Source of Truth für Projektdaten
- Manueller "Jetzt aktualisieren"-Button
- UI-Anzeige von Sync-Fehlern
- Webhook-Integration (Lexoffice könnte das; siehe Architektur-Entscheidung unten)

## Architektur

### Entscheidung: geplantes Polling statt Webhook

Lexoffice bietet einen echten Webhook-Mechanismus (Event Subscriptions Endpoint), sevDesk nicht — dort geht nur Polling. Statt eines hybriden Ansatzes (Webhook für Lexoffice, Polling für sevDesk) wird **einheitlich gepollt**:

- Ein Code-Pfad statt zwei, leichter zu testen und zu warten.
- Kein öffentlicher Webhook-Endpoint, keine Signatur-Verifizierung, keine Pflege einer Event-Subscription bei Lexoffice.
- Die Verzögerung von bis zu einem Poll-Intervall ist für reinen Zahlungsstatus akzeptabel — kein Realtime-Anspruch formuliert.

### Neue Cloud Function: `syncInvoicePaymentStatus`

Geplant via Pub/Sub-Schedule (`functions.pubsub.schedule('every 60 minutes')`), Region `europe-west1` (kein Client ruft diese Function auf, daher kein Dual-Region-Bedarf wie bei den client-aufrufbaren Functions).

**Ablauf pro Lauf:**

1. Query `assignments` mit `invoiceStatus in ['offen', 'gesendet', 'mahnung_1', 'mahnung_2']` (alles außer bereits `bezahlt` — Firestore `in`-Filter, max. 10 Werte, hier 4).
2. In-Memory-Filter auf Dokumente mit `integrationSyncs.lexoffice.externalId` bzw. `integrationSyncs.sevdesk.externalId`.
3. Treffer nach `companyId` gruppieren. Pro Firma **einmal** den API-Key aus `companies/{companyId}/private/integrations` laden (Felder `lexofficeApiKey`, `sevdeskApiKey` — gleiche Stelle, die `src/app/api/integrations/lexoffice/route.ts` und `.../sevdesk/route.ts` bereits nutzen), nicht pro Rechnung einzeln.
4. Pro offener Rechnung mit `externalId` beim jeweiligen Anbieter den Zahlungsstatus abfragen:
   - **sevDesk:** `GET /api/v1/Invoice/{id}` — Statuscode `1000` = bezahlt (aus bestehender Doku-Recherche zu `src/lib/sevdesk.ts` bekannt: `100`=Entwurf, `200`=offen/versendet, `1000`=bezahlt).
   - **Lexoffice:** `GET /v1/invoices/{id}` — das genaue Response-Feld für den Zahlungsstatus wird beim Implementieren gegen die aktuelle Lexoffice-API-Doku verifiziert (zum Zeitpunkt dieses Designs nicht abschließend bestätigt).
5. Bei erkannter Zahlung: `assignments/{id}.invoiceStatus = 'bezahlt'` setzen (Admin SDK, kein Firestore-Rules-Bezug).

**Fehlerbehandlung:** Ein einzelner fehlgeschlagener API-Call (abgelaufener Key, Netzwerkfehler, Rechnung beim Anbieter gelöscht) wird geloggt (`functions.logger.error`) und übersprungen — er bricht nicht den gesamten Lauf ab. Da es keinen Realtime-Anspruch gibt, holt der nächste stündliche Lauf einen transienten Fehler automatisch nach.

### Neue Bibliotheksfunktionen

In `src/lib/lexoffice.ts` und `src/lib/sevdesk.ts`, im gleichen Stil wie die bestehenden `pushInvoiceTo*`-Funktionen (reine, isolierte async-Funktionen mit `apiKey`-Parameter, kein Firestore-Zugriff):

```ts
// lexoffice.ts
async function checkLexofficeInvoicePaid(externalId: string, apiKey: string): Promise<{ ok: boolean; paid: boolean; error?: string }>

// sevdesk.ts
async function checkSevdeskInvoicePaid(externalId: string, apiKey: string): Promise<{ ok: boolean; paid: boolean; error?: string }>
```

Der eigentliche Sync-Loop (Schritte 1–5) wird als separate, ungebundene Funktion in `functions/src/index.ts` exportiert (nicht direkt im Pub/Sub-Trigger-Callback verdrahtet), damit er sich unabhängig vom Scheduler gegen den Firestore-Emulator mit präparierten Testdaten aufrufen lässt.

### Skalierung (ponytail-Hinweis)

Der stündliche Lauf liest aktuell **alle** offenen Rechnungen aller Firmen, nicht nur die mit aktiven Lexoffice/sevDesk-Integrationen — der Filter passiert in-memory nach dem Query. Bei der aktuellen Nutzerzahl unproblematisch. Sollte das Rechnungsvolumen deutlich wachsen, ist die Erweiterung ein serverseitiger Filter auf ein zusätzliches Boolean-Feld (z. B. `hasIntegrationSync: true`, beim Push gesetzt) statt des aktuellen In-Memory-Filters — nicht Teil dieses Designs, da aktuell keine Notwendigkeit besteht.

## Firestore-Regeln

Keine Änderung nötig. Die Cloud Function nutzt die Admin SDK und umgeht `firestore.rules` vollständig; es gibt keinen neuen Client-Schreibpfad.

## Testing

- **Unit-Tests** für `checkLexofficeInvoicePaid`/`checkSevdeskInvoicePaid`: gemockte HTTP-Responses (kein Live-API-Call), Assertion auf korrektes Mapping von Anbieter-Statuscode → `paid: boolean`.
- **Sync-Loop-Test:** Emulator-basiert, gleiches Muster wie `tests/firestore-rules.test.mjs` — Testdaten mit `integrationSyncs.{target}.externalId` und offenem `invoiceStatus` anlegen, Sync-Funktion mit gemockten Anbieter-Clients aufrufen, prüfen dass `invoiceStatus` korrekt auf `bezahlt` gesetzt wird (und dass bereits bezahlte oder nicht-verknüpfte Rechnungen unangetastet bleiben).
- **Manueller Smoke-Test vor Deploy:** ein Test-Assignment mit echtem Lexoffice/sevDesk-Testkonto und bekanntem `externalId` anlegen, Function einmalig manuell triggern (nicht auf den Stunden-Schedule warten), Ergebnis in Firestore prüfen — gleiche Disziplin wie bei den bisherigen Cloud-Functions-Deploys in diesem Projekt.
