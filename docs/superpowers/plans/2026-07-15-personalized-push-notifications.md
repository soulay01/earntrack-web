# Personalisierte Push-Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generische Werbe-Tipp-Notifications entfernen und durch sieben datenbasierte, personalisierte Push-Notification-Arten ersetzen, die maximal die bestehende `sendPushToRecipients`/`writeNotificationDocs`-Infrastruktur wiederverwenden.

**Architecture:** Eine client-seitige Ergänzung (Inaktivitäts-Erinnerung, lokal geplant wie die bestehenden Einsatz-Reminder) plus serverseitige Erweiterungen: die bestehende stündliche `checkNotifications`-Function wächst um einen Push-Zweig für überfällige Rechnungen und einen täglichen/wöchentlichen Block (vergessene Zeiterfassung, Trial-Ende, Wochen-Recap); zwei neue Firestore-`onUpdate`-Trigger behandeln Lager-Nachbestellung und niedrige Marge ereignisbasiert.

**Tech Stack:** React Native/Expo (`EarnTrack-Android`, `expo-notifications`), Firebase Cloud Functions (TypeScript, `earntrack-web/functions/src/index.ts`), Firestore.

## Global Constraints

- Design-Spec: `docs/superpowers/specs/2026-07-15-personalized-push-notifications-design.md` — jede Anforderung darin gilt implizit für jede Aufgabe hier.
- Kein neues Settings-UI mit Einzel-Schaltern pro Notification-Art. Client-seitige Checks respektieren den bestehenden Master-Toggle (`getNotificationsEnabled`). Server-seitige Checks überspringen User ohne Push-Token automatisch (bereits in `sendPushToRecipients` eingebaut) bzw. ohne `notifications`-Settings-Objekt (bestehendes Verhalten von `checkNotifications`).
- Jeder neue Push-Versand und jede neue Datenabfrage läuft in einem eigenen try/catch — ein Fehler bei einer Notification-Art darf weder andere Arten im selben Lauf noch die auslösende Datenänderung blockieren.
- Ereignisgetriggerte Notifications (Lager, Marge) feuern nur beim tatsächlichen Übergang (Bestand kreuzt Mindestmenge / Status wechselt zu "Abgeschlossen"), nicht bei jedem Dokument-Update.
- Es existiert keine automatisierte Test-Suite in diesem Projekt — TypeScript-Kompilierung, Babel-Syntax-Check und manuelles Auslösen der Trigger-Bedingung mit Log-Prüfung sind die etablierte Verifikationsmethode.
- Firestore-Regeln aus dem `earntrack-web`-Repo sind autoritativ (nicht die veraltete Kopie in `EarnTrack-Android`) — diese Tasks brauchen aber keine neuen Regeln (alle gelesenen Collections werden bereits per Admin SDK server-seitig gelesen).
- Mobile-Deploy läuft über das etablierte Zwei-Runtime-OTA-Verfahren (`1.1.6` und `exposdk:54.0.0`, siehe Projekt-Memory `eas-update-quirks`).

---

### Task 1: Generische Werbe-Tipps entfernen

**Files:**
- Modify: `EarnTrack-Android/utils/notifications.js`
- Modify: `EarnTrack-Android/App.js`

**Interfaces:**
- Produces: `scheduleDailyTipNotifications`, `cancelDailyTipNotifications`, `DAILY_TIP_MESSAGES` existieren nicht mehr. Keine anderen Exporte der Datei ändern sich.

- [ ] **Step 1: `DAILY_TIP_MESSAGES`, `TIP_HOUR`, `TIP_MINUTE`, `scheduleDailyTipNotifications`, `cancelDailyTipNotifications` aus `utils/notifications.js` entfernen**

Aktuell (Zeilen 318-372):
```javascript
const DAILY_TIP_MESSAGES = [
  { weekday: 2, title: '⏰ Zeiterfassung per Stempel', body: 'Deine Mitarbeiter stempeln sich direkt im Einsatz ein und aus – in Echtzeit siehst du, wer arbeitet und wer Pause macht.' },
  { weekday: 4, title: '📄 Rechnungen als PDF', body: 'Erstelle professionelle Rechnungen und ZUGFeRD E-Rechnungen aus deinen Einsätzen. Mit Pro verschwindet das Wasserzeichen – perfekt für den Versand an Kunden.' },
  { weekday: 6, title: '📈 Dashboard mit Auswertungen', body: 'Dein Dashboard zeigt Gewinn, Verlust, Profit-Score und die wichtigsten Kennzahlen all deiner Einsätze auf einen Blick.' },
];

const TIP_HOUR = 10;
const TIP_MINUTE = 0;

export const scheduleDailyTipNotifications = async () => {
  try {
    if (!Notifications) return;

    const notifEnabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (notifEnabled === 'false') return;

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    await ensureAndroidChannel();
    await cancelDailyTipNotifications();

    for (let i = 0; i < DAILY_TIP_MESSAGES.length; i++) {
      const msg = DAILY_TIP_MESSAGES[i];
      await Notifications.scheduleNotificationAsync({
        identifier: `dailyTip_${i}`,
        content: {
          title: msg.title,
          body: msg.body,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: msg.weekday,
          hour: TIP_HOUR,
          minute: TIP_MINUTE,
          channelId: 'reminders',
        },
      });
    }
  } catch (error) {
    if (__DEV__) console.error('Error scheduling daily tip notifications:', error);
  }
};

export const cancelDailyTipNotifications = async () => {
  try {
    if (!Notifications) return;
    for (let i = 0; i < DAILY_TIP_MESSAGES.length; i++) {
      try { await Notifications.cancelScheduledNotificationAsync(`dailyTip_${i}`); } catch (e) { if (__DEV__) console.error('cancelTip error:', e); }
    }
  } catch (error) {
    if (__DEV__) console.error('Error canceling daily tip notifications:', error);
  }
};
```

Delete this entire block (all of it — no replacement content here, the inactivity reminder added in Task 2 is a separate, differently-named function placed elsewhere in the file).

- [ ] **Step 2: Aufruf in `App.js` entfernen**

Aktuell (`App.js`, um Zeile 119-128):
```javascript
  const hasScheduledDailyTip = useRef(false);
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  useEffect(() => {
    loadHapticsEnabled();
    if (!hasScheduledDailyTip.current) {
      hasScheduledDailyTip.current = true;
      scheduleDailyTipNotifications();
    }
    // Globaler IAP-Listener: fängt Renewals/unterbrochene Käufe ab, validiert server-seitig und
    // schließt Transaktionen ab (verhindert Android-Auto-Refund & iOS-Queue-Schleife).
    initIAP();
```

Ändern zu:
```javascript
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  useEffect(() => {
    loadHapticsEnabled();
    // Globaler IAP-Listener: fängt Renewals/unterbrochene Käufe ab, validiert server-seitig und
    // schließt Transaktionen ab (verhindert Android-Auto-Refund & iOS-Queue-Schleife).
    initIAP();
```

(Der `hasScheduledDailyTip`-Ref wird komplett entfernt, da er nur für den Tipp-Aufruf existierte.)

- [ ] **Step 3: Import in `App.js` entfernen**

Aktuell (Zeile 52):
```javascript
import { scheduleDailyTipNotifications } from './utils/notifications';
```

Löschen. Falls `App.js` an anderer Stelle noch etwas aus `./utils/notifications` importiert, diese Zeile NICHT löschen, sondern nur `scheduleDailyTipNotifications` aus der Import-Liste entfernen — prüfe das per `grep -n "from './utils/notifications'" App.js` vor dem Löschen.

- [ ] **Step 4: Syntax prüfen**

```bash
cd EarnTrack-Android
node -e "
const babel = require('@babel/core');
['utils/notifications.js', 'App.js'].forEach(f => {
  try { babel.transformFileSync(f, {}); console.log('OK', f); }
  catch(e){ console.log('FAIL', f, e.message); }
});
"
```

Erwartete Ausgabe: `OK utils/notifications.js` und `OK App.js`.

- [ ] **Step 5: Bestätigen, dass keine anderen Aufrufer übrig sind**

```bash
cd EarnTrack-Android
grep -rn "scheduleDailyTipNotifications\|cancelDailyTipNotifications\|DAILY_TIP_MESSAGES" --include="*.js" . | grep -v node_modules
```

Erwartete Ausgabe: leer (keine Treffer).

- [ ] **Step 6: Commit**

```bash
cd EarnTrack-Android
git add utils/notifications.js App.js
git commit -m "feat: generische Werbe-Tipp-Notifications entfernt"
```

---

### Task 2: Inaktivitäts-Erinnerung (client-seitig)

**Files:**
- Modify: `EarnTrack-Android/utils/notifications.js`
- Modify: `EarnTrack-Android/contexts/AssignmentsContext.js`

**Interfaces:**
- Consumes: `assignments` Array (Shape: `{ id, createdAt, ... }`, aus `AssignmentsContext`, `createdAt` ist ein Firestore-Timestamp-kompatibles Feld).
- Produces: `scheduleInactivityReminder(assignments: Array): Promise<void>` — neuer Export aus `utils/notifications.js`.

- [ ] **Step 1: Neue Funktion in `utils/notifications.js` hinzufügen**

An das Ende der Datei anfügen (nach der letzten bestehenden Funktion, vor dem Dateiende — prüfe mit `tail -20 utils/notifications.js`, wo die Datei endet, und hänge danach an):

```javascript
const INACTIVITY_REMINDER_DAYS = 7;
const INACTIVITY_REMINDER_ID = 'inactivityReminder';

// Erinnert daran, wenn seit dem letzten neu angelegten Auftrag mehrere Tage
// nichts Neues dazukam. Wird bei jeder Änderung der assignments-Liste neu
// geplant (siehe AssignmentsContext.js) – identisches Cancel-and-Reschedule-
// Prinzip wie scheduleAllAssignmentNotifications, aber nur EINE Notification,
// nicht pro Auftrag.
export const scheduleInactivityReminder = async (assignments) => {
  try {
    if (!Notifications) return;

    const enabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (enabled === 'false') return;

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    await ensureAndroidChannel();
    try { await Notifications.cancelScheduledNotificationAsync(INACTIVITY_REMINDER_ID); } catch (e) {}

    if (!assignments || assignments.length === 0) return;

    let latest = null;
    for (const a of assignments) {
      const created = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : null);
      if (created && (!latest || created > latest)) latest = created;
    }
    if (!latest) return;

    const triggerDate = new Date(latest);
    triggerDate.setDate(triggerDate.getDate() + INACTIVITY_REMINDER_DAYS);
    if (triggerDate <= new Date()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: INACTIVITY_REMINDER_ID,
      content: {
        title: '👋 Schon eine Weile still',
        body: `Seit ${INACTIVITY_REMINDER_DAYS} Tagen kein neuer Auftrag – Zeit für den nächsten Job?`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: 'reminders',
      },
    });
  } catch (error) {
    if (__DEV__) console.error('Error scheduling inactivity reminder:', error);
  }
};
```

- [ ] **Step 2: In `AssignmentsContext.js` einhängen**

Aktuell (Zeile 5 und 134-144):
```javascript
import { getNotificationsEnabled, scheduleAllAssignmentNotifications } from '../utils/notifications';
```
```javascript
  useEffect(() => {
    const reschedule = async () => {
      const enabled = await getNotificationsEnabled();
      if (enabled && assignments.length > 0) {
        scheduleAllAssignmentNotifications(assignments);
      }
    };
    reschedule().catch((e) => {
      if (__DEV__) console.error('Reschedule error:', e);
    });
  }, [assignments]);
```

Ändern zu:
```javascript
import { getNotificationsEnabled, scheduleAllAssignmentNotifications, scheduleInactivityReminder } from '../utils/notifications';
```
```javascript
  useEffect(() => {
    const reschedule = async () => {
      const enabled = await getNotificationsEnabled();
      if (enabled && assignments.length > 0) {
        scheduleAllAssignmentNotifications(assignments);
        scheduleInactivityReminder(assignments);
      }
    };
    reschedule().catch((e) => {
      if (__DEV__) console.error('Reschedule error:', e);
    });
  }, [assignments]);
```

- [ ] **Step 3: Syntax prüfen**

```bash
cd EarnTrack-Android
node -e "
const babel = require('@babel/core');
['utils/notifications.js', 'contexts/AssignmentsContext.js'].forEach(f => {
  try { babel.transformFileSync(f, {}); console.log('OK', f); }
  catch(e){ console.log('FAIL', f, e.message); }
});
"
```

Erwartete Ausgabe: `OK` für beide Dateien.

- [ ] **Step 4: Commit**

```bash
cd EarnTrack-Android
git add utils/notifications.js contexts/AssignmentsContext.js
git commit -m "feat: Inaktivitaets-Erinnerung wenn 7 Tage kein neuer Auftrag angelegt wurde"
```

---

### Task 3: `writeNotificationDocs`-Typ lockern

**Files:**
- Modify: `earntrack-web/functions/src/index.ts`

**Interfaces:**
- Produces: `writeNotificationDocs(uids: string[], payload: { type: string; title: string; body: string; assignmentId?: string })` — `assignmentId` wird optional. Bestehende Aufrufer (die immer `assignmentId` mitgeben) sind unverändert kompatibel.

- [ ] **Step 1: Signatur anpassen**

Aktuell:
```typescript
async function writeNotificationDocs(
  uids: string[],
  payload: { type: string; title: string; body: string; assignmentId: string },
): Promise<void> {
```

Ändern zu:
```typescript
async function writeNotificationDocs(
  uids: string[],
  payload: { type: string; title: string; body: string; assignmentId?: string },
): Promise<void> {
```

(Der Funktionskörper bleibt unverändert — `...payload` spreadet weiterhin korrekt, egal ob `assignmentId` gesetzt ist oder nicht.)

- [ ] **Step 2: TypeScript kompilieren**

```bash
cd earntrack-web/functions
npm run build
```

Erwartete Ausgabe: kein Fehler.

- [ ] **Step 3: Commit**

```bash
cd earntrack-web
git add functions/src/index.ts functions/lib/index.js
git commit -m "chore: assignmentId in writeNotificationDocs optional machen"
```

---

### Task 4: `checkNotifications` erweitern — überfällige Rechnung als Push, täglicher Block, Wochen-Recap

**Files:**
- Modify: `earntrack-web/functions/src/index.ts`

**Interfaces:**
- Consumes: `sendPushToRecipients(uids: string[], title: string, body: string, buildExpoMessage: (token: string) => Record<string, unknown>, fcmData?: Record<string, string>): Promise<void>` (bestehend), `writeNotificationDocs` mit optionalem `assignmentId` aus Task 3, `parseDate(str): Date | null`, `fmtDate(d): string`, `esc(s): string` (alle bestehend, oben in der Datei definiert).
- Produces: `checkNotifications` sendet zusätzlich zur bestehenden E-Mail-Logik: (a) Push bei überfälligen Rechnungen, (b) einmal täglich (Stunde 8) Push bei vergessener Zeiterfassung und Trial-Ende, (c) montags zusätzlich einen Wochen-Recap-Push.

- [ ] **Step 1: Aktuellen Stand von `checkNotifications` lesen (Referenz — keine Änderung in diesem Schritt)**

```typescript
export const checkNotifications = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).pubsub.schedule('every 60 minutes').onRun(async () => {
  const now = new Date();
  const today = fmtDate(now);
  const tomorrow = fmtDate(new Date(now.getTime() + 86400000));

  let lastDoc: admin.firestore.DocumentSnapshot | null = null;
  const PAGE_SIZE = 500;
  let processed = 0;

  while (true) {
    let query: admin.firestore.Query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const usersSnap = await query.get();
    if (usersSnap.empty) break;

    for (const userDoc of usersSnap.docs) {
      try {
        processed++;
        const uid = userDoc.id;
        const settings = userDoc.data().notifications;
        if (!settings) { lastDoc = userDoc; continue; }

        const userEmail = await getUserEmail(uid);
        if (!userEmail) { lastDoc = userDoc; continue; }

        const assignmentsSnap = await db.collection('assignments')
          .where('companyId', '==', userDoc.data().companyId)
          .limit(500)
          .get();
        const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const dueInvoices: string[] = [];
        const upcomingAssignments: string[] = [];

        for (const a of assignments as any[]) {
          if (settings.emailInvoices) {
            const dueDate = a.invoiceDueDate ? parseDate(a.invoiceDueDate) : null;
            if (dueDate && a.invoiceStatus !== 'paid') {
              const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
              if (diffDays < 0) {
                dueInvoices.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – überfällig seit ${a.invoiceDueDate}`);
              } else if (diffDays <= 3) {
                dueInvoices.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – fällig am ${a.invoiceDueDate}`);
              }
            }
          }

          if (settings.emailReports) {
            const aDate = a.datum ? parseDate(a.datum) : null;
            if (aDate) {
              const dStr = fmtDate(aDate);
              if (dStr === today || dStr === tomorrow) {
                upcomingAssignments.push(`<li><b>${esc(a.projekt) || 'Unbenannt'}</b> – ${esc(a.kunde) || ''} am ${dStr}`);
              }
            }
          }
        }

        if (dueInvoices.length > 0 || upcomingAssignments.length > 0) {
          let inner = `<p style="font-size:14px;font-weight:600;color:#0d9488;margin:0 0 12px">Hallo ${esc(userEmail.split('@')[0])},</p>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;color:#1c1917;margin:0 0 20px;line-height:1.4;letter-spacing:-0.01em">Deine EarnTrack-Erinnerungen</h1>`;

          if (dueInvoices.length > 0) {
            inner += '<h2 style="color:#b45309;font-size:14px;font-weight:600;margin:0 0 8px">Rechnungen</h2>';
            inner += '<ul style="padding-left:20px;color:#57534e;font-size:14px;line-height:1.7;margin:0">' + dueInvoices.join('') + '</ul>';
            inner += `<p style="color:#a8a29e;font-size:13px;margin-top:12px 0 0">Status in EarnTrack aktualisieren: <a href="${SITE_URL}/invoices" style="color:#0d9488">Rechnungen öffnen</a></p>`;
          }

          if (upcomingAssignments.length > 0) {
            inner += '<h2 style="color:#0d9488;font-size:14px;font-weight:600;margin:24px 0 8px">Anstehende Termine</h2>';
            inner += '<ul style="padding-left:20px;color:#57534e;font-size:14px;line-height:1.7;margin:0">' + upcomingAssignments.join('') + '</ul>';
            inner += `<p style="color:#a8a29e;font-size:13px;margin:12px 0 0">Alle Termine ansehen: <a href="${SITE_URL}/assignments" style="color:#0d9488">Termine öffnen</a></p>`;
          }

          inner += `<div style="border-top:1px solid #f0ede8;margin-top:28px;padding-top:20px">
            <p style="font-size:12px;color:#d6d3d1;margin:0">Du erhältst diese E-Mail, weil du Benachrichtigungen in EarnTrack aktiviert hast. <a href="${SITE_URL}/settings/notifications" style="color:#0d9488">Einstellungen ändern</a></p>
          </div>`;

          const html = emailShell(inner);
          await sendEmail(userEmail, `EarnTrack: ${dueInvoices.length > 0 ? 'Rechnungserinnerung' : 'Terminerinnerung'}`, html);
          functions.logger.info(`Email sent to ${userEmail}`);
        }
        lastDoc = userDoc;
      } catch (err) {
        functions.logger.error(`[checkNotifications] Error processing user ${userDoc.id}`, err);
        lastDoc = userDoc;
      }
    }
  }
  functions.logger.info(`[checkNotifications] Processed ${processed} users`);
});
```

- [ ] **Step 2: Push-Zweig für überfällige Rechnungen einfügen**

Direkt nach dem bestehenden E-Mail-Block (nach `functions.logger.info(\`Email sent to ${userEmail}\`);` und der schließenden `}` des `if (dueInvoices.length > 0 || upcomingAssignments.length > 0)`-Blocks, aber noch INNERHALB des `try`-Blocks, VOR `lastDoc = userDoc;`), folgenden neuen Code einfügen:

```typescript
        // Push zusätzlich zur E-Mail bei überfälligen Rechnungen – eigener try/catch,
        // damit ein Push-Fehler nie die E-Mail-Logik oder andere User im Lauf blockiert.
        if (dueInvoices.length > 0) {
          try {
            const pushTitle = '💶 Überfällige Rechnung';
            const pushBody = dueInvoices.length === 1
              ? 'Eine Rechnung ist überfällig.'
              : `${dueInvoices.length} Rechnungen sind überfällig.`;
            await writeNotificationDocs([uid], { type: 'invoice_overdue', title: pushTitle, body: pushBody });
            await sendPushToRecipients([uid], pushTitle, pushBody, token => ({
              to: token,
              title: pushTitle,
              body: pushBody,
              data: { type: 'invoice_overdue' },
            }));
          } catch (pushErr) {
            functions.logger.error(`[checkNotifications] Overdue invoice push failed for ${uid}`, pushErr);
          }
        }
```

- [ ] **Step 3: Täglichen Block einfügen (vergessene Zeiterfassung + Trial-Ende)**

Direkt nach dem in Step 2 eingefügten Block (weiterhin innerhalb des `try`, vor `lastDoc = userDoc;`), folgenden neuen Code einfügen:

```typescript
        // Nur einmal täglich (Stunde 8, das Cron läuft stündlich) – vergessene
        // Zeiterfassung und Trial-Ende sollen nicht stündlich erneut feuern.
        if (now.getHours() === 8) {
          const isOwner = userDoc.data().role !== 'employee';

          try {
            const openEntriesSnap = await db.collection('clock_entries')
              .where('userId', '==', uid)
              .where('clockOut', '==', null)
              .limit(20)
              .get();
            const forgottenEntries = openEntriesSnap.docs.filter(d => {
              const clockIn = d.data().clockIn?.toDate ? d.data().clockIn.toDate() : null;
              return clockIn && fmtDate(clockIn) !== today;
            });
            if (forgottenEntries.length > 0) {
              const fTitle = '⏱️ Zeiterfassung vergessen?';
              const fBody = forgottenEntries.length === 1
                ? 'Du hast gestern vergessen, dich auszustempeln.'
                : `Du hast ${forgottenEntries.length} offene Zeiterfassungen von vergangenen Tagen.`;
              await writeNotificationDocs([uid], { type: 'forgotten_clockout', title: fTitle, body: fBody });
              await sendPushToRecipients([uid], fTitle, fBody, token => ({
                to: token,
                title: fTitle,
                body: fBody,
                data: { type: 'forgotten_clockout' },
              }));
            }
          } catch (clockErr) {
            functions.logger.error(`[checkNotifications] Forgotten clock-out check failed for ${uid}`, clockErr);
          }

          if (isOwner) {
            try {
              const companySnap = await db.collection('companies').doc(userDoc.data().companyId || uid).get();
              const companyData = companySnap.data();
              if (companyData?.subscriptionStatus === 'trial' && companyData?.trialEndsAt) {
                const trialEnd = companyData.trialEndsAt.toDate ? companyData.trialEndsAt.toDate() : new Date(companyData.trialEndsAt);
                const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / 86400000);
                if (diffDays === 3 || diffDays === 1) {
                  const tTitle = '⏳ Testphase endet bald';
                  const tBody = diffDays === 1 ? 'Deine Testphase endet morgen.' : `Deine Testphase endet in ${diffDays} Tagen.`;
                  await writeNotificationDocs([uid], { type: 'trial_ending', title: tTitle, body: tBody });
                  await sendPushToRecipients([uid], tTitle, tBody, token => ({
                    to: token,
                    title: tTitle,
                    body: tBody,
                    data: { type: 'trial_ending' },
                  }));
                }
              }
            } catch (trialErr) {
              functions.logger.error(`[checkNotifications] Trial-ending check failed for ${uid}`, trialErr);
            }
          }

          // Wochen-Recap zusätzlich nur montags (getDay() === 1), nur für Owner.
          if (isOwner && now.getDay() === 1) {
            try {
              const weekAgo = new Date(now.getTime() - 7 * 86400000);
              let weekRevenue = 0;
              let weekCount = 0;
              for (const a of assignments as any[]) {
                const aDate = a.datum ? parseDate(a.datum) : null;
                if (!aDate || aDate < weekAgo || aDate >= now) continue;
                weekCount++;
                const rawUmsatz = String(a.umsatz ?? '0').replace(/[€\s]/g, '').replace(',', '.');
                const materialSum = Array.isArray(a.materialien)
                  ? a.materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0)
                  : 0;
                weekRevenue += (parseFloat(rawUmsatz) || 0) + materialSum;
              }
              if (weekCount > 0) {
                const rTitle = '📊 Deine Woche bei EarnTrack';
                const rBody = `${weekCount} Auftrag${weekCount === 1 ? '' : 'e'}, ${weekRevenue.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€ Umsatz.`;
                await writeNotificationDocs([uid], { type: 'weekly_recap', title: rTitle, body: rBody });
                await sendPushToRecipients([uid], rTitle, rBody, token => ({
                  to: token,
                  title: rTitle,
                  body: rBody,
                  data: { type: 'weekly_recap' },
                }));
              }
            } catch (recapErr) {
              functions.logger.error(`[checkNotifications] Weekly recap failed for ${uid}`, recapErr);
            }
          }
        }
```

**Hinweis:** Dieser Block nutzt `assignments` (bereits weiter oben in der Funktion für denselben User geladen — keine erneute Query nötig) und `today` (bereits am Funktionsanfang berechnet).

- [ ] **Step 4: TypeScript kompilieren**

```bash
cd earntrack-web/functions
npm run build
```

Erwartete Ausgabe: kein Fehler. Falls ein Typfehler zu `companyData.trialEndsAt.toDate` auftritt (z.B. weil `companyData` als `any` nicht streng typisiert ist), ist das im bestehenden Stil der Datei üblich (siehe `assignmentSnap.data()?.createdBy` als Vorbild) — bei Bedarf mit `as any` arbeiten, nicht mit einer neuen strikten Typdefinition, das würde vom Stil der Datei abweichen.

- [ ] **Step 5: Deployen**

```bash
cd earntrack-web
npx firebase deploy --only functions:checkNotifications --project earntrack-new
```

Erwartete Ausgabe: `✔ functions[checkNotifications(...)] Successful update operation.`

- [ ] **Step 6: Manuell verifizieren**

Live-Auslösen einer geplanten Function ist von hier aus nicht möglich (läuft nur zur vollen Stunde bzw. um 8 Uhr/montags). Verifikation beschränkt sich auf: TypeScript kompiliert, Deploy erfolgreich, und eine Prüfung der Firebase-Function-Logs (`firebase functions:log --only checkNotifications`) beim nächsten natürlichen Lauf, um zu bestätigen, dass keine Fehler auftreten. Dokumentiere im Report, dass diese Live-Verifikation einem Menschen überlassen bleibt.

- [ ] **Step 7: Commit**

```bash
cd earntrack-web
git add functions/src/index.ts functions/lib/index.js
git commit -m "feat: checkNotifications um Push fuer ueberfaellige Rechnungen, vergessene Zeiterfassung, Trial-Ende und Wochen-Recap erweitert"
```

---

### Task 5: Firestore-Trigger — Lager-Nachbestell-Push

**Files:**
- Modify: `earntrack-web/functions/src/index.ts`

**Interfaces:**
- Consumes: `sendPushToRecipients`, `writeNotificationDocs` (beide bestehend).
- Produces: `export const onInventoryLowStock = functions.firestore.document('inventory_items/{itemId}').onUpdate(...)`.

- [ ] **Step 1: Neue Function anfügen**

Nach der bestehenden `onPhotoCreated`-Function (suche `export const onPhotoCreated` und finde deren Ende — die schließende `});` dieser Function), folgenden neuen Code einfügen:

```typescript
/**
 * Sendet einen Push an den Firmen-Owner, wenn ein Lagerartikel unter die
 * Mindestmenge fällt. Feuert nur beim Übergang (vorher >= min, jetzt < min),
 * nicht bei jedem weiteren Update, solange der Bestand niedrig bleibt.
 */
export const onInventoryLowStock = functions.firestore
  .document('inventory_items/{itemId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.companyId) return;

    const min = Number(after.minQuantity) || 0;
    if (min <= 0) return;

    const beforeQty = Number(before?.quantity) || 0;
    const afterQty = Number(after.quantity) || 0;
    const crossedBelowMin = beforeQty >= min && afterQty < min;
    if (!crossedBelowMin) return;

    const ownerId = after.companyId;
    const itemName = after.name || 'Artikel';
    const unit = after.unit || 'Stk';
    const title = '📦 Nachbestellen';
    const body = `${itemName}: ${afterQty} ${unit} auf Lager (unter Mindestbestand ${min})`;

    try {
      await writeNotificationDocs([ownerId], { type: 'low_stock', title, body });
      await sendPushToRecipients([ownerId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'low_stock', itemId: context.params.itemId },
      }));
      functions.logger.info(`Low-stock push sent for item ${context.params.itemId} to ${ownerId}`);
    } catch (err) {
      functions.logger.error(`[onInventoryLowStock] Push failed for item ${context.params.itemId}`, err);
    }
  });
```

- [ ] **Step 2: TypeScript kompilieren**

```bash
cd earntrack-web/functions
npm run build
```

Erwartete Ausgabe: kein Fehler.

- [ ] **Step 3: Deployen**

```bash
cd earntrack-web
npx firebase deploy --only functions:onInventoryLowStock --project earntrack-new
```

Erwartete Ausgabe: `✔ functions[onInventoryLowStock(...)] Successful create operation.`

- [ ] **Step 4: Manuell verifizieren**

In der Firebase Console oder über die App: einen Lagerartikel mit gesetzter `minQuantity` anlegen (falls nicht vorhanden), dann `quantity` so aktualisieren, dass sie von ≥ `minQuantity` auf < `minQuantity` fällt (z.B. über die App eine Entnahme buchen, die den Bestand unter die Mindestmenge drückt). Danach in `firebase functions:log --only onInventoryLowStock` prüfen, dass `Low-stock push sent` geloggt wurde, und im `notifications`-Collection-Eintrag für den Owner den neuen Eintrag mit `type: 'low_stock'` bestätigen.

- [ ] **Step 5: Commit**

```bash
cd earntrack-web
git add functions/src/index.ts functions/lib/index.js
git commit -m "feat: Push bei Lagerbestand unter Mindestmenge (onInventoryLowStock)"
```

---

### Task 6: Firestore-Trigger — Niedrige-Marge-Push

**Files:**
- Modify: `earntrack-web/functions/src/index.ts`

**Interfaces:**
- Consumes: `sendPushToRecipients`, `writeNotificationDocs` (beide bestehend).
- Produces: `export const onAssignmentLowMargin = functions.firestore.document('assignments/{assignmentId}').onUpdate(...)`.

- [ ] **Step 1: Neue Function anfügen**

Nach der in Task 5 hinzugefügten `onInventoryLowStock`-Function, folgenden neuen Code einfügen:

```typescript
// Deutsche Zahlformate (Komma-Dezimal, € / Leerzeichen) robust parsen – gleiche
// Logik wie in der Mobile-App (calculateRevenue), hier für Cloud Functions neu
// nachgebaut, da kein gemeinsamer Code zwischen den beiden Projekten existiert.
function parseGermanNumber(v: any): number {
  const raw = String(v ?? '0').replace(/[€\s]/g, '').trim();
  if (!raw) return 0;
  if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
  if (raw.includes(',')) return parseFloat(raw.replace(',', '.')) || 0;
  return parseFloat(raw) || 0;
}

/**
 * Sendet einen Push an den Firmen-Owner, wenn ein Auftrag auf "Abgeschlossen"
 * gesetzt wird und die Marge (inkl. verknüpftem Lager-Material) unter 10 %
 * liegt (Grade D/F, gleiche Grenze wie calculateAssignmentProfitScore in der
 * Mobile-App). Feuert nur beim Übergang zu "Abgeschlossen", nicht bei jedem
 * weiteren Update eines bereits abgeschlossenen Auftrags.
 */
export const onAssignmentLowMargin = functions.firestore
  .document('assignments/{assignmentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after?.companyId) return;
    if (before?.status === 'Abgeschlossen' || after.status !== 'Abgeschlossen') return;

    const hours = parseGermanNumber(after.stunden);
    const rate = parseGermanNumber(after.stundenlohn);
    const materialien = Array.isArray(after.materialien) ? after.materialien : [];
    const materialSum = materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
    const materialCost = materialien.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.costPrice != null ? m.costPrice : m.unitPrice) || 0), 0);

    const revenue = parseGermanNumber(after.umsatz) + materialSum;
    const cost = hours * rate + materialCost;
    if (revenue <= 0) return;
    const margin = ((revenue - cost) / revenue) * 100;
    if (margin >= 10) return;

    const ownerId = after.companyId;
    const kunde = after.kunde || after.projekt || 'Auftrag';
    const title = '📉 Niedrige Marge';
    const body = `${kunde}: nur ${margin.toFixed(0)}% Marge bei diesem Auftrag.`;

    try {
      await writeNotificationDocs([ownerId], { type: 'low_margin', title, body, assignmentId: context.params.assignmentId });
      await sendPushToRecipients([ownerId], title, body, token => ({
        to: token,
        title,
        body,
        data: { type: 'low_margin', assignmentId: context.params.assignmentId },
      }));
      functions.logger.info(`Low-margin push sent for assignment ${context.params.assignmentId} to ${ownerId}`);
    } catch (err) {
      functions.logger.error(`[onAssignmentLowMargin] Push failed for assignment ${context.params.assignmentId}`, err);
    }
  });
```

- [ ] **Step 2: TypeScript kompilieren**

```bash
cd earntrack-web/functions
npm run build
```

Erwartete Ausgabe: kein Fehler.

- [ ] **Step 3: Deployen**

```bash
cd earntrack-web
npx firebase deploy --only functions:onAssignmentLowMargin --project earntrack-new
```

Erwartete Ausgabe: `✔ functions[onAssignmentLowMargin(...)] Successful create operation.`

- [ ] **Step 4: Manuell verifizieren**

In der App einen Auftrag mit niedrigem Umsatz relativ zu Stunden×Stundenlohn anlegen (Marge < 10%), Status auf "Abgeschlossen" setzen. Danach in `firebase functions:log --only onAssignmentLowMargin` prüfen, dass `Low-margin push sent` geloggt wurde.

- [ ] **Step 5: Commit**

```bash
cd earntrack-web
git add functions/src/index.ts functions/lib/index.js
git commit -m "feat: Push bei niedriger Marge (unter 10%) beim Abschliessen eines Auftrags"
```

---

## Self-Review (durchgeführt beim Schreiben dieses Plans)

**Spec-Abdeckung:**
- Werbe-Tipps entfernen → Task 1 ✓
- Inaktivitäts-Erinnerung → Task 2 ✓
- Überfällige Rechnung als Push → Task 4 Step 2 ✓
- Vergessene Zeiterfassung → Task 4 Step 3 ✓
- Trial-Ende → Task 4 Step 3 ✓
- Wöchentlicher Recap → Task 4 Step 3 ✓
- Lager-Nachbestellung → Task 5 ✓
- Niedrige Marge → Task 6 ✓
- Kein neues Settings-UI → keine Task fügt eines hinzu ✓
- Fehlerbehandlung (try/catch pro Notification-Art) → jede neue Push-Stelle einzeln umschlossen ✓

**Platzhalter-Scan:** Keine TBD/TODO, jeder Code-Block ist vollständig.

**Typ-Konsistenz:** `sendPushToRecipients`- und `writeNotificationDocs`-Aufrufsignaturen konsistent über Tasks 4–6. `parseGermanNumber` wird nur in Task 6 gebraucht und dort lokal definiert (kein Duplikat in Task 4, das eine eigene, einfachere Inline-Parsing für `weekRevenue` nutzt, da dort kein Material-EK gebraucht wird — bewusst nicht dieselbe Funktion, um Task 4 nicht von Task 6 abhängig zu machen, falls sie in anderer Reihenfolge implementiert würden).

**Reihenfolge-Abhängigkeit:** Task 3 muss vor Task 4 laufen (lockert den Typ, den Task 4 Step 2/3 mit `assignmentId`-losen Aufrufen braucht). Tasks 5 und 6 sind unabhängig voneinander und von Task 4, könnten in beliebiger Reihenfolge nach Task 3 laufen. Tasks 1 und 2 (Mobile) sind unabhängig von allen Server-Tasks.
