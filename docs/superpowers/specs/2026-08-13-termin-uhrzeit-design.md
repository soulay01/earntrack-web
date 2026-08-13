# Design: Optionale Uhrzeit (Von & Bis) für Termine

Datum: 2026-08-13
Scope: Mobile-App (EarnTrack-Android) + Web-App (earntrack-web) Kernbereiche

## Ziel

Termine (Aufträge/Einsätze) können optional eine Uhrzeit (Von & Bis) tragen.
Die Uhrzeit wird im Formular eingegeben, beim Speichern mitgeschrieben und
überall dort angezeigt, wo der Termin angezeigt wird (Kalender, Termin-Liste,
Today-Screen, Benachrichtigungen, Kalender-Integration).

## Datenmodell (beide Apps, kompatibel)

Feld: `uhrzeit` als String im Format `"HH:MM – HH:MM"` (z.B. `"09:00 – 12:00"`).
- Optional: fehlt das Feld oder ist leer, verhält sich alles wie bisher.
- Format passt zum bestehenden Parsing:
  - `formatAssignmentTime` (mobile) splittet an " – "
  - `timeSortValue` (mobile) liest die erste Uhrzeit für Sortierung
  - `KalenderView` zeigt `uhrzeit || '—'`
  - `notifications.js:358` parst `uhrzeit.split(':')`

## Mobile (EarnTrack-Android)

1. **Formular** (`screens/EinsaetzeScreen.js`):
   - Neues optionales Feld "Uhrzeit" unterhalb des Datums.
   - Zwei native Zeit-Picker (`@react-native-community/datetimepicker`, bereits
     installiert & konfiguriert) für Von und Bis.
   - Leer lassen = kein Wert (`uhrzeit` bleibt `''`).
2. **Speichern/Bearbeiten**:
   - Beim Speichern wird `uhrzeit` mitgeschrieben.
   - Beim Bearbeiten wird das Feld vorbefüllt (`item.uhrzeit`).
   - Mehr-Tage-Termine: Uhrzeit gilt für alle Tage (String nur einmal gespeichert).
3. **Kalender-Integration** (`utils/calendarIntegration.js`):
   - Wenn `uhrzeit` vorhanden: Event-Start = Datum + Von-Uhrzeit,
     Event-Ende = Datum + Bis-Uhrzeit.
   - Ohne Uhrzeit: bisherige Logik (Datum + Stunden als Dauer).

## Web (earntrack-web) — Kernbereiche

1. **AssignmentModal** (`src/components/AssignmentModal.tsx`):
   - Feld "Uhrzeit (optional)" → zwei `input type="time"`.
   - Speichern/Bearbeiten entsprechend `uhrzeit` mitführen.
2. **Anzeige**:
   - Termin-Liste (`src/app/assignments/page.tsx`) zeigt `uhrzeit` an, falls vorhanden.
   - Kalender (`src/app/calendar/page.tsx`) zeigt `uhrzeit` an, falls vorhanden.
3. **Kalender-Event-API** (`src/app/api/calendar/[token]/route.ts`):
   - Uhrzeit einbeziehen, falls vorhanden (Start/Ende aus Von/Bis).

## Layout-Sicherung

- Anzeige nur bei vorhandenem Wert; sonst exakt wie bisher (kein Umbruch, keine
  leeren Zeilen, gleiche Schriftgröße/Farben wie bestehende Zeit-Anzeigen).
- Mobile & Web: gleiche visuelle Behandlung wie bestehende sekundäre Labels.

## Testen

- Mobile: Jest-Tests für Formatierung/Parsing der Von-Bis-Strings
  (`utils/__tests__/`), bestehende Suite grün halten.
- Web: TypeScript-Build-Check (`tsc`).

## Nicht enthalten (bewusst out of scope)

- CSV/Export (Web) mit Uhrzeit.
- E-Mail-Benachrichtigung (Web) mit Uhrzeit.
- Erinnerung/Stundenzettel-bezogene Logik.
