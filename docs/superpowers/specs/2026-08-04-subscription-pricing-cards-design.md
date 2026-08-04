# Abo-Preisliste im Stil von earntrack.de

- Datum: 2026-08-04
- Betroffener Bereich: `earntrack-web/src/components/PlanGrid.tsx`
- Betroffene Seite: Einstellungen → Abo (`src/app/settings/subscription/page.tsx`)
- Nicht betroffen: gesamte übrige Seite (Kopf, Testphase, Argument-Sektionen, FAQ, Footer), Paywall-Struktur, Android-App

## Ziel

Die Tarif-Karten auf der Abo-Seite sehen „kacke" aus. Sie sollen optisch 1:1 der
Preisliste auf earntrack.de entsprechen (`src/components/landing/Pricing.tsx`).
Nur der Stil der Karten ändert sich. Inhalt, Reihenfolge, Daten und Buchungs-Logik
bleiben unverändert.

## Design-Kopie

`PlanGrid` wird nach dem Muster von `landing/Pricing.tsx` umgebaut, aber mit den
bestehenden App-Daten aus `src/lib/plans.ts` (Preise, Namen, Beschreibungen,
Limits, Unterschiede) und der bestehenden Buchungs-Logik (`loadingPlan`,
`onSubscribe`, `currentPlanId`).

### Karten-Anatomie (von oben nach unten)

1. **Karten-Container**: `bg-white rounded-2xl border-2 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden relative`
   - Solo, Business: `border-slate-200`
   - Team (popular): `border-teal-400 ring-2 ring-teal-100`
2. **„Empfohlen"-Badge** (nur Team): `absolute top-4 right-4 z-10`, rund, Teal→Emerald-Gradient, weißer Text, Stern-Icon — wie in `landing/Pricing.tsx`.
3. **Kopf mit Farbverlauf** (`px-6 py-6 bg-gradient-to-r`), je Tarif:
   - Solo: `from-slate-100 to-slate-200`, Icon `Wrench` (slate-600), Name „Solo"
   - Team: `from-teal-50 via-teal-50 to-emerald-50`, Icon `Users` (teal-600), Name „Team"
   - Business: `from-purple-100 to-indigo-100`, Icon `Building2` (purple-600), Name „Business"
   - Inhalt: Icon (w-8 h-8), Beschreibung (`text-sm font-semibold text-slate-500`, z. B. „Die feste Kolonne"), Name (`text-2xl font-black text-slate-900`), Limit-Badge (`mt-2 inline-block px-3 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold`, z. B. „bis 5 Mitarbeiter")
4. **Preisblock** (`px-6 py-5 border-b border-slate-100`):
   - Preis als `{price},{priceCents} €` groß (`text-4xl font-black text-slate-900`) + `/ Monat` (`text-sm text-slate-400 font-medium`)
   - Darunter: „Einführungspreis · statt {originalPrice}" mit `line-through` (`text-xs text-slate-400 mt-1`)
5. **Unterschiede-Zeilen bleiben** (`px-6 py-5 space-y-3`): `PLAN_DIFFERENCES` als Label/Value-Zeilen im Landing-Typo-Stil:
   - Label links (`text-sm text-slate-600`), Wert rechts (`font-bold`/`font-medium`)
   - Boolesche Werte: `true` → teal-farbenes „ja" mit Häkchen-Icon; `false` → „—" in muted Farbe
   - Zeilen getrennt durch `border-t border-slate-100` bzw. Abstand wie im Landing-Feature-List
6. **CTA** (`px-6 pb-6`):
   - Inaktiv: Gradient-Button wie auf earntrack.de (weiß, `rounded-xl py-3 font-bold shadow-lg active:scale-95`), Beschriftung „{Name} buchen"
   - Aktiver Plan: deaktivierter Button „Dein Tarif" (teal-wash / aktueller Look wird beibehalten als Zustand, Gestaltung im Karten-Stil)
   - Laden: „Kasse wird geöffnet …", deaktiviert

### Quell-Daten (bleiben unverändert)

- Namen, Beschreibungen, Preise, Originalpreise, Limits: `getPlanDisplay()` / `PLAN_DISPLAY_DATA` aus `src/lib/plans.ts`
- Unterschiede: `PLAN_DIFFERENCES` aus `src/lib/plans.ts`
- Reihenfolge der Karten: `PLAN_IDS`

## Verhalten (unverändert)

- `onSubscribe(planId, planName)` öffnet weiterhin Checkout inkl. Excess-Mitarbeiter-Warnung
- `loadingPlan` zeigt Ladezustand, `currentPlanId` zeigt „Dein Tarif"
- Keine Änderungen an `subscription/page.tsx`, `PaywallOverlay.tsx` oder den übrigen Pricing-Komponenten

## Nebenwirkung

`PaywallOverlay` importiert ebenfalls `PlanGrid`. Da die Komponente geteilt ist,
erhalten die Karten im Paywall-Overlay automatisch denselben neuen Look. Es ändert
sich dort sonst nichts. Das ist gewollt — beide Stellen zeigen dieselbe Preisliste.

## Aufräumen

Die nun ungenutzten CSS-Regeln `et-plans`, `et-plan*` in `src/components/pricing/pricing.css`
werden entfernt, da sie nach dem Umbau von niemandem mehr referenziert werden.
Alle anderen Regeln in `pricing.css` bleiben unangetastet.

## Tests / Verifikation

- `npm run build` bzw. `npx tsc --noEmit` läuft ohne Fehler durch
- Manuell: Abo-Seite (`/settings/subscription`) und Paywall zeigen die neuen Karten;
  Buchung/„Dein Tarif"/Ladezustand funktionieren wie bisher
