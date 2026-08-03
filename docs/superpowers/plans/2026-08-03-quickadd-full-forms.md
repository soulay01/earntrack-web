# Quick-Add Kunde/Mitarbeiter/Material im Termine-Formular — Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem Termine-Bereich (offenes Termin-Formular in `AssignmentModal` UND Übersicht `/assignments`) können Kunde, Mitarbeiter und Material per Vollbild-Overlay neu angelegt werden. Nach dem Speichern bleibt das Termin-Formular offen und das neue Element ist übernommen (Kunde gesetzt, Mitarbeiter im Array, Material in der Liste). Abbruch schließt nur das Overlay.

**Architecture:**
- Die Inline-Modale aus `customers/page.tsx`, `employees/page.tsx`, `inventory/page.tsx` werden in wiederverwendbare Komponenten extrahiert: `src/components/CustomerModal.tsx`, `EmployeeModal.tsx`, `ItemModal.tsx`. Jede Komponente bringt ihre Styles selbst mit (lokale Kopie der genutzten `ui`-Keys), damit sie auch außerhalb der Seiten funktioniert.
- `AssignmentModal.tsx`: Die Inline-Quick-Forms (State Z33–61, Handler Z275–347, Kacheln Z370–410) werden ersetzt durch ein Vollbild-Overlay (`fixed inset-0 z-50`), das die extrahierten Modale als Quick-Add rendert. Die bestehenden `addDoc`-basierten Handler werden zu den Overlay-`onSave`-Callbacks.
- `/assignments`: Schnell-Aktionszeile („Neuer Kunde"/„Neuer Mitarbeiter"/„Neues Material") auf der Übersicht öffnet das Termin-Formular (`AssignmentModal`) inkl. vorgewähltem Quick-Add-Overlay.
- Direkte Firestore-`addDoc` (wie bisherige Quick-Forms) — **keine** API-Route.

**Tech Stack:** Next.js (App Router), React, Tailwind, Firebase Firestore (`@/lib/firebase`), `compressImageToDataUrl`/`compressImage` aus `@/lib/utils` (Z9–43). Verifikation: `npm run build` + `npm run lint` (Projektkonvention).

## Global Constraints

- Keine API-Routen, keine Firestore-Schema-/Regeländerungen.
- Das Termin-Formular bleibt offen; Übernahme erfolgt im offenen Formular.
- Plan-Limits (`hasReachedLimit`), `logUsage` und Firmen-Kontext bleiben wie bisher (Seiten bzw. AssignmentModal).
- Verhalten der drei Listen-Seiten (customers/employees/inventory) bleibt unverändert — nur Modal-Extraktion.
- Material erzeugt wie bisher **kein** `logUsage` (inventory-page loggt nicht).
- Sprache: Deutsch.

---

### Task 1: `src/components/CustomerModal.tsx` extrahieren

**Files:**
- Create: `src/components/CustomerModal.tsx`
- Modify: `src/app/customers/page.tsx` (Modal-JSX Z196–~243 + zugehöriger State + `validatePhone`)

- [ ] **Step 1:** Komponente `CustomerModal({ editing, saving, onSave, onClose, user, companyId })` erstellen — Markup + State 1:1 aus der Seite; `validatePhone` (file-level, Telefon +49/0, 9–15 Ziffern) in die Komponente verschieben (oder `src/lib/validation.ts` exportieren und von Seite + Komponente nutzen).
- [ ] **Step 2:** Benötigte Style-Keys der Seite in die Komponente als lokales `ui`-Objekt kopieren (Seiten-`ui` unangetastet lassen — harmlose Redundanz).
- [ ] **Step 3:** Seite rendert `<CustomerModal editing={editing} saving={saving} onSave={save} onClose={closeModal} user={user} companyId={companyId} />` (Props wie heute, nur importiert).
- [ ] **Step 4:** Build + Smoke-Test Kunden-Seite (anlegen/bearbeiten unverändert).

---

### Task 2: `src/components/EmployeeModal.tsx` extrahieren

**Files:**
- Create: `src/components/EmployeeModal.tsx`
- Modify: `src/app/employees/page.tsx` (Modal-JSX Z523–~570; Seite: `ui` Z17, `save` Z175–200)

- [ ] **Step 1:** Komponente `EmployeeModal({ editing, saving, onSave, onClose, user, companyId })` erstellen — 1:1-Extraktion inkl. lokaler Styles.
- [ ] **Step 2:** Seite rendert `<EmployeeModal … />` mit denselben Props wie heute.
- [ ] **Step 3:** Build + Smoke-Test Mitarbeiter-Seite.

---

### Task 3: `src/components/ItemModal.tsx` extrahieren

**Files:**
- Create: `src/components/ItemModal.tsx`
- Modify: `src/app/inventory/page.tsx` (Modal-JSX Z606–~641; Seite: `save` Z214–232 inkl. „Anfangsbestand"-Buchung, Öffnen Z282, Render Z406)

- [ ] **Step 1:** Komponente `ItemModal({ editing, saving, suppliers, onSave, onClose })` erstellen — 1:1-Extraktion inkl. lokaler Styles.
- [ ] **Step 2:** Seite rendert `<ItemModal editing={editing} saving={saving} suppliers={suppliers} onSave={save} onClose={closeModal} />` (suppliers-Fetch bleibt auf der Seite).
- [ ] **Step 3:** Build + Smoke-Test Lager-Seite (anlegen/bearbeiten + Anfangsbestands-Buchung unverändert).

---

### Task 4: `AssignmentModal.tsx` — Quick-Add als Vollbild-Overlay

**Files:**
- Modify: `src/components/AssignmentModal.tsx`

- [ ] **Step 1:** Inline-Quick-States entfernen (Z33–61: `showAddCustomer`, `showAddEmployee`, Vor-/Nachname/Email/Telefon/Adresse/Notizen, `quickRate`, `showAddMaterial`/`quickMatName`/`quickMatUnit`/`quickMatQty`/`quickMatPrice`). Neue Props: `user`, `companyId`, `initialQuickAdd?: 'customer' | 'employee' | 'inventory' | null`. Neuer State: `quickAddType`.
- [ ] **Step 2:** Vollbild-Overlay: wenn `quickAddType` gesetzt → `<div className="fixed inset-0 z-50 overflow-y-auto …">` rendert die passende Komponente:
  - `customer` → `<CustomerModal editing={null} saving={quickSaving} onSave={handleQuickAddCustomer} onClose={() => setQuickAddType(null)} user={user} companyId={companyId} />`
  - `employee` → `<EmployeeModal … onSave={handleQuickAddEmployee} … />`
  - `inventory` → `<ItemModal … suppliers={suppliers} onSave={handleQuickAddMaterial} … />`
- [ ] **Step 3:** Overlay-`onSave`-Handler (im Kern die bestehende Logik aus Z303–316 / Z318–347 / Z275–292 beibehalten):
  - **Kunde:** `addDoc(collection(db, 'customers'), { companyId, …data, createdAt: serverTimestamp() })` → `setLocalCustomers` ergänzen → `update('kunde', fullName)` → `logUsage('customer_created')` → Overlay schließen, Fokus auf Kundefeld.
  - **Mitarbeiter:** Limit via `hasReachedLimit(company?.subscriptionPlan, 'employees', …)` (bestehendes Muster), Validierung `rate > 0`, `addDoc` → `setLocalEmployees` ergänzen → Name an `mitarbeiter`-Array (`update('mitarbeiter', [...])`) → `logUsage('employee_created')`.
  - **Material:** `addDoc('inventory_items')` + `inventory_movements` („Zugang") → Materialobjekt (bestehende Array-Struktur, inkl. `unitPrice`/`costPrice`/`unit`) an `materials`-Array → Overlay schließen. Kein `logUsage`.
  - Prop `/ assignments` reicht zusätzlich `user`/`companyId` durch (siehe Task 5).
- [ ] **Step 4:** `initialQuickAdd`-Prop beim Mount auswerten → `quickAddType` setzen und Termin-Formular öffnen.
- [ ] **Step 5:** Inline-Quick-Form-Kacheln (Z370–410, „Ersten Kunden anlegen" Z376–381) durch Buttons ersetzen, die `setQuickAddType('customer'|'employee'|'inventory')` setzen (statt Inline-Formular zu zeigen).

---

### Task 5: `/assignments` — Schnell-Aktionszeile + Prop-Durchreichung

**Files:**
- Modify: `src/app/assignments/page.tsx` (Modal-Render ~Z776, Header-Button „Neuer Termin" Z457–467)

- [ ] **Step 1:** `AssignmentModal`-Render um `user={user}` (falls vorhanden/`currentUser`) und `companyId={companyId}` sowie `initialQuickAdd={pendingQuickAdd}` ergänzen — exakte User-/Company-Quellen der Seite prüfen (vermutlich `user`/`company` aus Auth-/Company-Context; `companyId` bereits genutzt für `hasReachedLimit(company?.subscriptionPlan, …)` Z296).
- [ ] **Step 2:** Schnell-Aktionszeile auf der Übersicht (nahe Header-Button Z457 oder oberhalb der Terminliste): drei Buttons „Neuer Kunde", „Neuer Mitarbeiter", „Neues Material". Tipp → `setPendingQuickAdd(type)` + AssignmentModal (neues Termin-Formular) öffnen.
- [ ] **Step 3:** Seite nutzt dafür einen kleinen State (`pendingQuickAdd: 'customer'|'employee'|'inventory'|null`), der nach dem Öffnen zurückgesetzt wird.

---

### Task 6: Verifikation

- [ ] `npm run build` (beide Fehlerfrei).
- [ ] `npm run lint`.
- [ ] Manuell: Termin-Formular offen → Quick-Add Kunde → Speichern → `kunde` gesetzt, Formular offen, Listen-Kunde aktualisiert.
- [ ] Quick-Add Mitarbeiter → Name im `mitarbeiter`-Array; Material → Zeile in Materialliste.
- [ ] Übersicht → Quick-Add (alle drei) → Termin-Formular öffnet mit übernommenem Element.
- [ ] Abbrechen des Overlays → Termin-Formular unverändert.
- [ ] Free-Plan-Limit Mitarbeiter → Upgrade-Hinweis statt Anlegen.
- [ ] Regression: customers/employees/inventory-Seiten unverändert (anlegen/bearbeiten).

## Rollout
- Live testen: Web-`npm run build` + Deploy (bestehender Deploy-Pfad des Repos), danach manuelle Prüfung.
- Keine Datenmigration, kein Backend-Deploy.
