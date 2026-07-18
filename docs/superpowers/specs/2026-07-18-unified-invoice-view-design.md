# Vereinheitlichte Rechnungsübersicht (verwaiste `invoices`-Collection)

## Problem

`/invoices` (Rechnungen-Übersicht, Mahnwesen, PDF, DATEV-Export) liest ausschließlich aus der `assignments`-Collection (gefiltert nach `invoiceStatus`). Zwei Web-Flows erzeugen aber Rechnungen in einer komplett separaten `invoices`-Collection, die nirgendwo im Web-App-Code je gelesen wird:

- **Kostenvoranschlag → Rechnung** (`src/app/estimates/page.tsx`, `convertToInvoice`)
- **Wiederkehrende Rechnungen** (`src/app/invoices/page.tsx`, `handleGenerateDue`)

Live-Audit-Befund (18.07.): 6 reale, verwaiste Rechnungen aus dem Kostenvoranschlag-Flow bei echten Kunden, Gesamtsumme **€17.430,99** — komplett unsichtbar für Mahnwesen, "als bezahlt markieren", Umsatzzählung und Dashboard.

Zusätzlich schreibt die Mobile-App (ZUGFeRD-E-Rechnungs-Export, `EinsaetzeScreen.js`) ebenfalls in dieselbe Collection (43 Datensätze) — dort aber als reines Export-Log zu einem bereits über `assignments` getrackten Auftrag (`assignmentId` gesetzt, `invoiceStatus` wird nicht berührt). Diese Einträge sind kein Datenverlust, nur ungenutzt — explizit **außerhalb des Scopes** dieses Fixes.

## Ziel

`/invoices` zeigt zusätzlich alle `invoices`-Dokumente **ohne** `assignmentId` (Kostenvoranschlag-Konvertierungen + künftige wiederkehrende Rechnungen) mit vollem Funktionsumfang: Status ändern, Mahnwesen, "als bezahlt markieren", PDF-Download, Storno, korrekte Einrechnung in Gesamtvolumen/Offen/Überfällig/Bezahlt.

**Explizit außerhalb des Scopes:**
- Mobile-App-ZUGFeRD-Log-Einträge (haben `assignmentId`, würden Umsatz doppelt zählen — bewusst gefiltert)
- Rückwirkende Datenmigration — nicht nötig, die 6 bestehenden Dokumente haben bereits alle nötigen Felder und werden durch den Lesefix automatisch sichtbar
- Änderungen am Schreibpfad der Wiederkehrenden-Rechnungen-Funktion (bleibt wie sie ist)

## Architektur

### Datenherkunft unterscheiden

Beim Laden der Rechnungsliste zusätzlich `invoices`-Dokumente der eigenen Firma abfragen (`where('companyId', '==', companyId)`), gefiltert auf `assignmentId == null` (bzw. Feld nicht vorhanden). Diese Filterung passiert clientseitig nach dem Query (Firestore kann nicht direkt nach "Feld fehlt" filtern) — bei der aktuellen Datenmenge unproblematisch.

### Normalisiertes Anzeige-Objekt

Beide Quellen (`assignments`, `invoices`) werden in ein gemeinsames `UnifiedInvoice`-Shape gemappt, das die bestehende Render-Logik der Tabelle unverändert weiterverwenden kann:

```ts
interface UnifiedInvoice {
  id: string;
  source: 'assignment' | 'standalone';   // steuert, wohin Statusänderungen zurückgeschrieben werden
  status: InvoiceStatus;
  customerName: string;
  title: string;        // assignments: a.projekt · standalone: "Kostenvoranschlag {estimateNumber}"
  amount: number;        // assignments: _revenue · standalone: grossAmount
  date: string;          // assignments: a.datum · standalone: createdAt (formatiert)
  dueDate: string;       // beide: date + 14 Tage (bestehende Logik, unverändert)
}
```

`estimateNumber` fehlt auf Datensätzen ohne `estimateId` (z. B. künftige wiederkehrende Rechnungen) — Fallback-Titel: `Rechnung {invoiceNumber}`.

### Statusänderungen

Die bestehenden Handler (`updateStatus`, `handleDunning`, PDF-Download) bekommen eine Fallunterscheidung nach `source`:
- `source === 'assignment'` → bestehendes Verhalten, `updateDoc(doc(db, 'assignments', id), { invoiceStatus })`
- `source === 'standalone'` → `updateDoc(doc(db, 'invoices', id), { status })`

Mahnwesen-Logik (`getNextDunningStatus`, Statusfarben, Fälligkeits-/Überfällig-Berechnung) ist quellenunabhängig und wird unverändert auf beide Typen angewendet.

### Zusammenfassungs-Kacheln (Gesamtvolumen/Offen/Überfällig/Bezahlt)

Aggregation läuft über die gemeinsame `UnifiedInvoice[]`-Liste statt nur über Assignments — automatisch korrekt für beide Quellen.

## Firestore-Regeln

Keine Änderung nötig — `firestore.rules` erlaubt bereits vollständiges CRUD auf `invoices` für die eigene Firma (`allow read/create/update/delete: if isAuth() && belongsToMyCompany() && ...`), das wurde beim Anlegen der Collection bereits korrekt gesetzt.

## Testing

- Unit-Test für die Merge-/Filter-Logik: `invoices`-Dokument mit `assignmentId` wird ausgeschlossen, ohne `assignmentId` wird eingeschlossen, korrektes Mapping auf `UnifiedInvoice`.
- Unit-Test für Statusänderung-Routing: `source === 'standalone'` schreibt nach `invoices`, nicht nach `assignments`.
- Manueller Live-Check nach Deploy: bestehende 6 reale Datensätze erscheinen korrekt in der Produktions-Übersicht, Summen stimmen.
