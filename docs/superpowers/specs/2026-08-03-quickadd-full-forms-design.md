# Quick-Add mit vollständigen Formularen (Termine: Kunde / Mitarbeiter / Material)

## Problem

Im „Neuer Termin"-Flow (Mobile `EinsaetzeScreen.js`, Web `AssignmentModal.tsx`) öffnet sich beim Antippen von „+ Neuer Kunde" / „+ Neuer Mitarbeiter" / „+ Neues Material" aktuell nur ein **Inline-Kurzformular mit Pflichtfeldern** (Mobile: name/ansprechpartner/telefon/standort, name/stundenlohn, name/unit/qty/price; Web: `quickCust*`, `quickEmp*`, `quickMat*`, `showAddMaterial`). Die vollständigen Formulare existieren bereits in den jeweiligen Übersichts-Screens (`KundenScreen`/`MitarbeiterScreen`/`LagerScreen` bzw. `customers/page.tsx`/`employees/page.tsx`/`inventory/page.tsx`) — aber dort sind sie nicht erreichbar, während man einen Termin anlegt. Wer Daten „GENAU" (vollständig) erfassen will, muss den Termin erst abbrechen, auf den entsprechenden Tab wechseln, anlegen, zurückwechseln und neu starten.

## Goals

- Antippen von „+ Neuer Kunde" / „+ Neuer Mitarbeiter" / „+ Neues Material" im Termine-Flow öffnet ein **vollständiges Formular** (alle Felder des jeweiligen Übersichts-Screens).
- Nach dem Speichern kehrt die App automatisch zum Termine-Flow zurück; das geöffnete Termin-Formular **bleibt offen** und übernimmt das neue Element (Kunde gesetzt, Mitarbeiter angehakt, Material in der Materialliste).
- Die Quick-Add-Buttons bleiben im „Neuer Termin"-Formular **und** erscheinen zusätzlich als Schnell-Aktionszeile auf der Termin-Übersicht (ohne geöffnetes Formular: Anlegen + Toast).
- Keine Duplikate: Formular-Logik/Validierung wird aus den Übersichts-Screens extrahiert und wiederverwendet (eine Quelle der Wahrheit, keine Drift).
- Bestehende Funktionalität bleibt unverändert: `logUsage`/`fireRatingTrigger`, Plan-Limit (`hasReachedLimit` + `UpgradeModal`), Bild-Upload, Validierung (Telefon +49/0 9–15 Ziffern, Pflichtfelder, Stundenlohn > 0).

## Non-Goals

- Keine Änderung am Datenmodell (Firestore-Felder) von `customers`, `employees`, `inventory_items`, `assignments`.
- Keine Änderung an der Termin-Berechnungs-/Kalkulationslogik (Marge, Kosten, Profit) — nur die Erfassung von Kunde/Mitarbeiter/Material wird geändert.
- Keine Änderung an den Übersichts-Screens außer dem Umbau auf die extrahierten Formular-Komponenten.
- Kein neues Test-Framework (beide Projekte nutzen manuelle Verifikation).

## Design

### Mobile (EarnTrack-Android, Expo/React Native)

#### 1. Formular-Extraktion

Neue wiederverwendbare Komponenten unter `EarnTrack-Android/components/forms/`:

- **`CustomerForm.js`** — Felder: Vorname*, Nachname*, E-Mail, Telefon, Adresse, Standort, Notizen + optionaler Bild-Upload (aus `KundenScreen.js` extrahiert; `uploadImageIfNeeded` bleibt erhalten).
- **`EmployeeForm.js`** — Felder: Vorname*, Nachname*, Stundenlohn*, Berufsfeld, E-Mail, Telefon, Notizen + Bild-Upload (aus `MitarbeiterScreen.js` extrahiert).
- **`InventoryItemForm.js`** — Felder: Artikelname*, Artikelnummer (sku), Kategorie, Mindestbestand, Einheit, EK-Preis, Lagerort, Lieferant (aus `LagerScreen.js` extrahiert).

Jede Komponente verwaltet eigenen Form-State + Validierung und liefert ein fertiges Daten-Objekt über `onSubmit(data)` / `onCancel()`. **API-Calls (via Hooks wie `useCustomers`/`useEmployees`/`useInventory`), Logging (`logUsage`/`fireRatingTrigger`) und Plan-Limit-Checks bleiben in den Screens** — die Komponente ist reine Erfassung/Validierung.

Die drei Übersichts-Screens (`KundenScreen.js`, `MitarbeiterScreen.js`, `LagerScreen.js`) werden umgebaut, dieselben Komponenten zu nutzen (nur die Formular-Bereiche ihres Modals ersetzen; Listen-/Detail-Logik bleibt).

#### 2. Neue Fullscreen-Screens im Termine-Stack

Neue Dateien unter `EarnTrack-Android/screens/quickadd/`:

- `QuickAddCustomerScreen.js`
- `QuickAddEmployeeScreen.js`
- `QuickAddInventoryScreen.js`

Registrierung im `EinsaetzeStack` (App.js, neben `EinsaetzeMain`). Jeder Screen: eigener Header (Titel + „Abbrechen"), nutzt die jeweilige `components/forms/*Form`-Komponente, ruft die bestehenden Hooks auf (`useCustomers`/`useEmployees`/`useInventory` → `addCustomer`/`addEmployee`/`createItem`), prüft `hasReachedLimit` + `UpgradeModal` (wie `KundenScreen`), feuert `logUsage`/`fireRatingTrigger` wie die Übersichts-Screens.

**Rückgabe an den Termine-Screen** nach erfolgreichem Speichern:
`navigation.navigate('EinsaetzeMain', { quickAddResult: { type: 'customer'|'employee'|'inventory', data: {...} }, merge: true })`.
Bei „Abbrechen": `navigation.goBack()` ohne Ergebnis.

#### 3. Termin-Formular (`EinsaetzeScreen.js`)

- Die Inline-Quick-Forms im „Neuer Termin"-Modal (State Z1343–1383, Handler Z1800–1869, Buttons/Formular Z2799–2872) werden durch Buttons „+ Neuer Kunde" / „+ Neuer Mitarbeiter" / „+ Neues Material" ersetzt, die `navigation.navigate('QuickAdd…')` aufrufen.
- Da das Termin-Formular ein natives `<Modal>` ist: Beim Antippen **Modal schließen** (`setShowAddModal(false)`), dann navigieren. Der Formular-State (`formKunde`, `selectedEmployeeIds`, `formMaterials`, …) lebt im Screen und bleibt erhalten.
- **Übernahme** beim Zurückkehren (via `useFocusEffect`/`route.params?.quickAddResult`, danach Param leeren):
  - Kunde → `setFormKunde(data.name)`
  - Mitarbeiter → `setSelectedEmployeeIds(prev => [...prev, data.id])`
  - Material → `setFormMaterials(prev => [...prev, { id, name, qty: 1, unitPrice, costPrice, unit }])`
- Danach Modal wieder öffnen (`setShowAddModal(true)`), damit der User den Termin sofort fertigstellen kann.
- Die Bewertung „hasData" (Z1192) und Speichern-Logik bleiben unverändert.

#### 4. Schnell-Aktionszeile auf der Termin-Übersicht

Neue horizontale Zeile (z.B. Chips „+ Kunde", „+ Mitarbeiter", „+ Material") oberhalb der Termin-Liste. Ohne geöffnetes Formular: `navigation.navigate('QuickAdd…')`; nach Rückkehr mit Ergebnis → `showToast` (z.B. „Kunde erstellt") und zurück zur Übersicht (kein Element zu übernehmen).

### Web (earntrack-web, Next.js 15 / React 19)

#### 1. Formular-Extraktion

Die inline definierten Formular-Modale der Seiten werden in gemeinsame Komponenten unter `earntrack-web/src/components/` extrahiert (gleiche Felder, gleiche Validierung):

- `CustomerModal` (derzeit inline in `src/app/customers/page.tsx` Z196) → `src/components/CustomerModal.tsx`
- `EmployeeModal` (inline in `src/app/employees/page.tsx` Z523) → `src/components/EmployeeModal.tsx`
- `ItemModal` (inline in `src/app/inventory/page.tsx` Z606) → `src/components/ItemModal.tsx`

Die Seiten importieren die Komponenten weiter; das Quick-Add-Overlay nutzt dieselben. Speichern bleibt wie bisher: Firestore `addDoc` direkt aus der Seite/Overlay (kein API-Route nötig).

#### 2. Vollbild-Overlay im Termin-Modal (`AssignmentModal.tsx`)

- Die Inline-Quick-Forms (`quickCust*`, `quickEmp*`, `quickMat*`, `showAddMaterial`) werden durch Buttons „+ Neuer Kunde" / „+ Neuer Mitarbeiter" / „+ Neues Material" ersetzt.
- Neuer State `quickAddType: 'customer' | 'employee' | 'inventory' | null`. Ist er gesetzt, rendert `AssignmentModal` ein **Vollbild-Overlay** (fixed inset-0, z-index über dem Modal) mit der jeweiligen extrahierten Modal-Komponente.
- **Übernahme** nach erfolgreichem Speichern (Overlay schließen, Modal bleibt offen):
  - Kunde → `setForm({ ...form, kunde: data.name })`
  - Mitarbeiter → `setForm({ ...form, mitarbeiter: [...form.mitarbeiter, data.name] })`
  - Material → `setMaterials(prev => [...prev, { id, name, qty: 1, unitPrice, costPrice, unit }])`
- Der Termin-Formular-State (`form`, `materials`, `localEmployees`, `localCustomers`) lebt in `AssignmentModal` und bleibt beim Overlay-Öffnen/-Schließen erhalten.
- Abbrechen im Overlay → nur Overlay schließen.

#### 3. Schnell-Aktionszeile auf `/assignments`

Gleiche Overlay-Komponente, gerendert von `src/app/assignments/page.tsx` (State dort). Ohne geöffnetes Termin-Modal: nach Speichern Toast + Schließen.

## Testing

Manuelle Verifikation (beide Projekte, bestehende Konvention ohne Test-Framework):

**Mobile:**
- Übersichts-Screens: Kunde/Mitarbeiter/Lager anlegen, bearbeiten, löschen funktioniert weiter (nach Formular-Extraktion).
- Termin-Formular öffnen → „+ Neuer Kunde" → Vollformular (alle Felder sichtbar) → Speichern → Modal wieder offen, Kunde im Feld gesetzt.
- Dito Mitarbeiter (angehakt) und Material (Menge 1 in Liste).
- „Abbrechen" im Quick-Add → Modal wieder offen, nichts übernommen.
- Schnell-Aktionszeile ohne offenes Formular → Anlegen + Toast, zurück zur Übersicht.
- Validierung (Pflichtfelder, Telefon, Stundenlohn), Plan-Limit + UpgradeModal, Bild-Upload funktionieren weiter.
- Light + Dark Theme sehen korrekt aus.

**Web:**
- `/customers`, `/employees`, `/inventory`: Anlegen/Bearbeiten funktioniert weiter (nach Extraktion).
- Termin-Modal → „+ Neuer Kunde" → Overlay öffnet → Speichern → Overlay zu, Modal offen, Kunde gesetzt. Dito Mitarbeiter/Material.
- Übersichts-Quick-Actions auf `/assignments` → Toast.
- Validierung (Telefon, Pflichtfelder) wie auf den Seiten.
- `npm run build` und Lint (falls vorhanden) laufen fehlerfrei durch.

## Rollout

JS-only-Änderung beidseitig.
- Mobile: OTA via `eas update` nach manueller Verifikation (bestehende Konvention).
- Web: regulärer Deploy des Next.js-Builds.
