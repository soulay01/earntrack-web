# Live-Analytics-Feed & User-Aktivitäts-Historie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live-Feed wichtiger Events (Registrierung, Zahlung, Demo-Anmeldung, Upgrade, Kündigung) auf der `/analytics`-Seite ohne Neuladen, plus eine granulare Aktivitäts-Historie pro User im `UserModal`.

**Architecture:** Live-Feed läuft rein clientseitig über `onSnapshot`-Listener auf bestehenden Collections (`users`, `payment_requests`, `demo_signups`, `companies`) — kein neues Backend nötig, nur eine Firestore-Regel-Lücke (`companies`-Read für Admin) wird geschlossen. Die User-Aktivitäts-Historie braucht eine neue, schlanke Firestore-Collection `activity_events` (append-only Events statt Tages-Aggregat), befüllt über die bestehende Cloud Function `logUsage`.

**Tech Stack:** Next.js 14 (App Router, `earntrack-web`), Firebase Client SDK (Firestore `onSnapshot`), Firebase Cloud Functions (TypeScript, `functions/src/index.ts`), React Native/Expo (`EarnTrack-Android`, `utils/usageLog.js`).

## Global Constraints

- Design-Spec: `docs/superpowers/specs/2026-07-15-live-analytics-feed-design.md` — jede Anforderung darin gilt implizit für jede Aufgabe hier.
- Kein neuer Auth-Mechanismus — alles bleibt hinter dem bestehenden `isAdmin`-Check (nur `soulaymanking@gmail.com`, serverseitig über `/api/admin/verify` geprüft).
- Keine Änderung an der bestehenden `usage_log`-Aggregat-Logik, den bestehenden Charts/Tabs (Website, Umsatz) oder den bestehenden Batch-Aktionen.
- Kein generischer DB-Editor, kein E-Mail/Kontakt-Versand aus dem Panel — bewusst out of scope laut Spec.
- Es existiert keine automatisierte Test-Suite in diesem Projekt (weder `earntrack-web` noch `functions`) — jeder Schritt wird stattdessen manuell verifiziert, exakt wie in der Spec festgelegt. Steps folgen trotzdem einer bite-sized Struktur (Code schreiben → verifizieren → committen).
- Firestore-Regeln werden ausschließlich aus dem `earntrack-web`-Repo deployt (`firebase deploy --only firestore:rules` in `earntrack-web/`) — das ist die aktuelle, autoritative Kopie. Die Kopie unter `EarnTrack-Android/firestore.rules` ist veraltet und wird hier nicht angefasst.
- Farbschema/Styling neuer UI-Komponenten folgt der bestehenden Analytics-Seite: Hintergrund `#0A0F0D`/`#111B15`, Rahmen `#1A2B22`, Akzent `#10D6A3`/`#087F63`, Text `#E8F0EC`/`#6B8A7C`.

---

### Task 1: Firestore-Regeln — `activity_events` + `companies`-Admin-Read-Lücke schließen

**Files:**
- Modify: `earntrack-web/firestore.rules`

**Interfaces:**
- Produces: Firestore-Regel erlaubt `isAdmin()` Lesezugriff auf `companies` (Voraussetzung für Task 5) und CRUD-Regel für neue Collection `activity_events` (Voraussetzung für Task 2 + 7).

- [ ] **Step 1: `companies`-Read-Regel um `isAdmin()` erweitern**

Aktuell (Zeile 97-99):
```
    match /companies/{companyId} {
      allow read: if isAuth() && (request.auth.uid == companyId || userCompanyId() == companyId);
      allow create: if isAuth() && request.auth.uid == companyId
```

Ändern zu:
```
    match /companies/{companyId} {
      allow read: if isAuth() && (request.auth.uid == companyId || userCompanyId() == companyId || isAdmin());
      allow create: if isAuth() && request.auth.uid == companyId
```

- [ ] **Step 2: Neue Regel für `activity_events` hinzufügen**

Am Ende der `match /demo_signups/{uid}`-Block (nach Zeile 287, vor `// ─── Manual pro users ───`) einfügen:

```
    // ─── Activity events (granulares Event-Log für Live-Feed & User-Historie) ───
    match /activity_events/{doc} {
      allow read: if isAuth() && isAdmin();
      allow create: if isAuth() && request.resource.data.uid == request.auth.uid;
      allow update, delete: if false;
    }
```

- [ ] **Step 3: Regeln syntaktisch prüfen und deployen**

```bash
cd earntrack-web
firebase deploy --only firestore:rules --project earntrack-new
```

Erwartete Ausgabe: `✔ cloud.firestore: rules file firestore.rules compiled successfully` und `✔ firestore: released rules firestore.rules to cloud.firestore`.

- [ ] **Step 4: Manuell verifizieren**

In der Firebase Console → Firestore → Regeln → Regel-Playground: Simuliere `get /companies/<beliebige-fremde-uid>` mit einem Auth-Token, dessen `token.email` in `app_config/admin_emails.emails` steht → muss `allow` ergeben. Simuliere `create /activity_events/test` mit `request.resource.data.uid == request.auth.uid` → muss `allow` ergeben; mit abweichender `uid` → muss `deny` ergeben.

- [ ] **Step 5: Commit**

```bash
cd earntrack-web
git add firestore.rules
git commit -m "feat: Firestore-Regeln für Live-Analytics-Feed (activity_events, companies-Admin-Read)"
```

---

### Task 2: Cloud Function `logUsage` — Event-Log + Plattform-Feld

**Files:**
- Modify: `earntrack-web/functions/src/index.ts:903-925`

**Interfaces:**
- Consumes: `request.resource.data.uid == request.auth.uid` Regel aus Task 1 (für den `activity_events`-Schreibzugriff der Function — Cloud Functions mit Admin-SDK umgehen Regeln ohnehin, aber die Regel muss für spätere direkte Client-Schreibversuche korrekt stehen).
- Produces: Cloud Function `logUsage(data: { action: string, platform?: 'web'|'ios'|'android' })` schreibt weiterhin `usage_log/{uid}_{date}` (unverändert) UND zusätzlich ein Dokument in `activity_events` mit `{ uid, action, platform, createdAt }`.

- [ ] **Step 1: Aktuelle Funktion lesen (Referenz, keine Änderung in diesem Schritt)**

```typescript
// ─── Usage Log (tägliche Nutzung tracken) ───
export const logUsage = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');

  const uid = context.auth.uid;
  const { action } = data;
  if (!action) throw new functions.https.HttpsError('invalid-argument', 'Keine Aktion angegeben');

  const today = new Date().toISOString().split('T')[0];
  const logId = `${uid}_${today}`;

  const updateData: Record<string, any> = {
    uid,
    date: today,
    lastAction: action,
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
    actions: admin.firestore.FieldValue.increment(1),
  };
  updateData[`actionCounts.${action}`] = admin.firestore.FieldValue.increment(1);

  await db.collection('usage_log').doc(logId).set(updateData, { merge: true });

  return { logged: true };
});
```

- [ ] **Step 2: Funktion um `activity_events`-Schreibvorgang erweitern**

Ersetze den kompletten Block aus Step 1 durch:

```typescript
// ─── Usage Log (tägliche Nutzung tracken) ───
export const logUsage = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Nicht angemeldet');

  const uid = context.auth.uid;
  const { action, platform } = data;
  if (!action) throw new functions.https.HttpsError('invalid-argument', 'Keine Aktion angegeben');

  const today = new Date().toISOString().split('T')[0];
  const logId = `${uid}_${today}`;

  const updateData: Record<string, any> = {
    uid,
    date: today,
    lastAction: action,
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
    actions: admin.firestore.FieldValue.increment(1),
  };
  updateData[`actionCounts.${action}`] = admin.firestore.FieldValue.increment(1);

  await db.collection('usage_log').doc(logId).set(updateData, { merge: true });

  // Granulares Event fürs Live-Analytics-Feed & die User-Aktivitäts-Historie —
  // eigener try/catch, damit ein Fehler hier nie die eigentliche Nutzeraktion blockiert
  // (gleiches Prinzip wie das bestehende lautlose Fehlschlagen von logUsage im Client).
  try {
    await db.collection('activity_events').add({
      uid,
      action,
      platform: (platform === 'ios' || platform === 'android') ? platform : 'web',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    functions.logger.error('activity_events write failed', e);
  }

  return { logged: true };
});
```

- [ ] **Step 3: TypeScript kompilieren**

```bash
cd earntrack-web/functions
npm run build
```

Erwartete Ausgabe: kein Fehler, `lib/index.js` wird aktualisiert.

- [ ] **Step 4: Deployen**

```bash
cd earntrack-web
firebase deploy --only functions:logUsage --project earntrack-new
```

Erwartete Ausgabe: `✔ functions[logUsage(us-central1)] Successful update operation.`

- [ ] **Step 5: Manuell verifizieren**

In der Firebase Console → Firestore → `activity_events`: Nach einem Aufruf von `logUsage` aus der laufenden App (z.B. eine beliebige Aktion in der Mobile-App auslösen, die bereits `logUsage(...)` aufruft, siehe `EarnTrack-Android/utils/usageLog.js`) muss ein neues Dokument mit `uid`, `action`, `platform: 'web'` (da `platform` vom Client noch nicht mitgeschickt wird, Default) und `createdAt` erscheinen.

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add functions/src/index.ts functions/lib/index.js
git commit -m "feat: logUsage schreibt zusaetzlich granulares activity_events-Dokument"
```

---

### Task 3: Mobile-Client — Plattform an `logUsage` mitschicken

**Files:**
- Modify: `EarnTrack-Android/utils/usageLog.js`

**Interfaces:**
- Consumes: Cloud Function `logUsage(data: { action: string, platform?: string })` aus Task 2.
- Produces: `logUsage(action: string)` (Signatur unverändert für alle bestehenden Aufrufer) schickt jetzt zusätzlich `platform: Platform.OS` mit.

- [ ] **Step 1: Aktueller Stand (Referenz)**

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../firebaseConfig';

export function logUsage(action) {
  try {
    const functions = getFunctions(getFirebaseApp());
    const logUsageFn = httpsCallable(functions, 'logUsage');
    logUsageFn({ action }).catch(() => {});
  } catch (e) {
    // silently fail
  }
}
```

- [ ] **Step 2: `Platform.OS` ergänzen**

Ersetze die komplette Datei durch:

```javascript
import { Platform } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../firebaseConfig';

export function logUsage(action) {
  try {
    const functions = getFunctions(getFirebaseApp());
    const logUsageFn = httpsCallable(functions, 'logUsage');
    logUsageFn({ action, platform: Platform.OS }).catch(() => {});
  } catch (e) {
    // silently fail
  }
}
```

- [ ] **Step 3: Syntax prüfen**

```bash
cd EarnTrack-Android
node -e "
const babel = require('@babel/core');
try { babel.transformFileSync('utils/usageLog.js', {}); console.log('OK'); }
catch(e){ console.log('FAIL', e.message); }
"
```

Erwartete Ausgabe: `OK`

- [ ] **Step 4: Manuell verifizieren**

App auf einem Android- oder iOS-Testgerät starten, eine beliebige Aktion auslösen, die `logUsage(...)` aufruft (z.B. `logUsage('assignment_created')` in `EinsaetzeScreen.js` durch Anlegen eines Termins). In Firebase Console → `activity_events`: neues Dokument muss `platform: 'android'` bzw. `'ios'` zeigen (nicht mehr den Default `'web'` aus Task 2).

- [ ] **Step 5: Commit**

```bash
cd EarnTrack-Android
git add utils/usageLog.js
git commit -m "feat: logUsage schickt Platform.OS fuer die Activity-Historie mit"
```

Anschließend über das etablierte Zwei-Runtime-OTA-Verfahren ausliefern (siehe `[[eas-update-quirks]]` Projekt-Memory: Publish auf `1.1.6` UND `exposdk:54.0.0`).

---

### Task 4: Web-Client — `logUsage('login')` nach erfolgreichem Login

**Files:**
- Modify: `earntrack-web/src/lib/auth.ts`

**Interfaces:**
- Consumes: `callFunction<T>(name: string, data?: any)` aus `earntrack-web/src/lib/firebase.ts:50-52` (bereits vorhanden, ruft `httpsCallable` auf).
- Produces: `loginEmail`, `loginGoogle`, `loginApple` (Signaturen unverändert) lösen zusätzlich `logUsage('login')` mit `platform: 'web'` aus, best-effort (Fehler blockieren den Login nicht).

- [ ] **Step 1: Aktueller Stand (Referenz, Ausschnitt)**

```typescript
import { auth, callFunction } from './firebase';

export async function loginEmail(email: string, pw: string) {
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  if (!cred.user?.emailVerified) {
    await signOut(auth);
    throw { code: 'auth/email-not-verified', message: 'E-Mail nicht bestätigt. Bitte prüfe dein Postfach.' };
  }
  return cred;
}

export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function loginApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  provider.setCustomParameters({ locale: 'de' });
  await signInWithPopup(auth, provider);
}
```

- [ ] **Step 2: Helper-Funktion + drei Aufrufstellen ergänzen**

Direkt nach der bestehenden `verifyUrl`-Funktion (nach Zeile 32) einfügen:

```typescript
// Best-effort Login-Tracking fuer die Activity-Historie im Analytics-Panel —
// darf einen erfolgreichen Login niemals blockieren, daher eigenes catch.
function trackWebLogin() {
  callFunction('logUsage', { action: 'login', platform: 'web' }).catch(() => {});
}
```

`loginEmail` ändern zu:
```typescript
export async function loginEmail(email: string, pw: string) {
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  if (!cred.user?.emailVerified) {
    await signOut(auth);
    throw { code: 'auth/email-not-verified', message: 'E-Mail nicht bestätigt. Bitte prüfe dein Postfach.' };
  }
  trackWebLogin();
  return cred;
}
```

`loginGoogle` ändern zu:
```typescript
export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
  trackWebLogin();
}
```

`loginApple` ändern zu:
```typescript
export async function loginApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  provider.setCustomParameters({ locale: 'de' });
  await signInWithPopup(auth, provider);
  trackWebLogin();
}
```

- [ ] **Step 3: TypeScript kompilieren**

```bash
cd earntrack-web
npx tsc --noEmit
```

Erwartete Ausgabe: keine Fehler in `src/lib/auth.ts`.

- [ ] **Step 4: Manuell verifizieren**

Lokal `npm run dev`, im Browser einloggen (E-Mail/Passwort). In Firebase Console → `activity_events`: neues Dokument mit `action: 'login'`, `platform: 'web'`.

- [ ] **Step 5: Commit**

```bash
cd earntrack-web
git add src/lib/auth.ts
git commit -m "feat: Web-Login trackt activity_events Event fuer die Analytics-Historie"
```

---

### Task 5: `LiveFeed`-Komponente — Echtzeit-Events aus bestehenden Collections

**Files:**
- Create: `earntrack-web/src/app/analytics/LiveFeed.tsx`

**Interfaces:**
- Consumes: `db` aus `earntrack-web/src/lib/firebase.ts` (Firestore-Client-Instanz), Firestore-Regeln aus Task 1 (`companies`-Admin-Read).
- Produces: `export default function LiveFeed(): JSX.Element` — eigenständige, prop-lose Komponente (liest direkt via `onSnapshot`), einsetzbar in `page.tsx` (Task 6).

- [ ] **Step 1: Komponente mit Live-Listenern schreiben**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type FeedEvent = {
  id: string
  kind: 'registrierung' | 'zahlung' | 'demo' | 'upgrade' | 'kuendigung'
  label: string
  sublabel: string
  at: number
}

const KIND_STYLE: Record<FeedEvent['kind'], { bg: string; text: string; dot: string }> = {
  registrierung: { bg: 'bg-[#087F63]/15', text: 'text-[#10D6A3]', dot: '#10D6A3' },
  zahlung: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: '#F59E0B' },
  demo: { bg: 'bg-[#8B5CF6]/15', text: 'text-[#8B5CF6]', dot: '#8B5CF6' },
  upgrade: { bg: 'bg-[#10D6A3]/15', text: 'text-[#10D6A3]', dot: '#10D6A3' },
  kuendigung: { bg: 'bg-red-500/15', text: 'text-red-400', dot: '#EF4444' },
}

const KIND_LABEL: Record<FeedEvent['kind'], string> = {
  registrierung: 'Registrierung',
  zahlung: 'Zahlung',
  demo: 'Demo-Anmeldung',
  upgrade: 'Upgrade',
  kuendigung: 'Kündigung',
}

function relTime(ms: number) {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'Gerade eben'
  if (s < 60) return `Vor ${s} Sek.`
  const m = Math.floor(s / 60)
  if (m < 60) return `Vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `Vor ${h} Std.`
  return `Vor ${Math.floor(h / 24)} Tagen`
}

function toMs(v: any): number {
  if (!v) return 0
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v?.toMillis === 'function') return v.toMillis()
  const d = new Date(v)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const seenCompanyStatus = useRef<Map<string, string>>(new Map())
  const initialized = useRef(false)

  function pushEvent(ev: FeedEvent) {
    setEvents(prev => {
      if (prev.some(e => e.id === ev.id)) return prev
      const next = [ev, ...prev].sort((a, b) => b.at - a.at).slice(0, 30)
      return next
    })
    if (initialized.current) {
      setNewIds(prev => new Set(prev).add(ev.id))
      setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(ev.id); return n }), 3000)
    }
  }

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `user_${ch.doc.id}`,
            kind: 'registrierung',
            label: d.name || d.email || 'Unbekannt',
            sublabel: d.email || '',
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      query(collection(db, 'payment_requests'), orderBy('submittedAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `payment_${ch.doc.id}`,
            kind: 'zahlung',
            label: d.userEmail || 'Unbekannt',
            sublabel: d.plan || '',
            at: toMs(d.submittedAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      query(collection(db, 'demo_signups'), orderBy('createdAt', 'desc'), limit(15)),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          pushEvent({
            id: `demo_${ch.doc.id}`,
            kind: 'demo',
            label: d.name || 'Unbekannt',
            sublabel: d.email || '',
            at: toMs(d.createdAt),
          })
        })
      },
      () => {}
    ))

    unsubs.push(onSnapshot(
      collection(db, 'companies'),
      snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added' && ch.type !== 'modified') return
          const d = ch.doc.data()
          const status = d.subscriptionStatus || ''
          const prev = seenCompanyStatus.current.get(ch.doc.id)
          seenCompanyStatus.current.set(ch.doc.id, status)
          if (prev === undefined) return // Initial-Snapshot: keine Historie, kein Event
          if (prev === status) return
          if (status === 'active' && prev !== 'active') {
            pushEvent({ id: `upgrade_${ch.doc.id}_${Date.now()}`, kind: 'upgrade', label: d.name || ch.doc.id, sublabel: d.subscriptionPlan || 'Pro', at: Date.now() })
          } else if ((status === 'expired' || status === 'cancelled') && prev === 'active') {
            pushEvent({ id: `cancel_${ch.doc.id}_${Date.now()}`, kind: 'kuendigung', label: d.name || ch.doc.id, sublabel: '', at: Date.now() })
          }
        })
        initialized.current = true
      },
      () => {}
    ))

    return () => unsubs.forEach(u => u())
  }, [])

  if (!events.length) return null

  return (
    <div className="rounded-2xl border border-[#1A2B22] bg-gradient-to-br from-[#111B15] to-[#0A0F0D] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10D6A3] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10D6A3]" />
        </span>
        <h2 className="text-sm font-bold text-[#E8F0EC]">Live-Aktivität</h2>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {events.map(ev => {
          const s = KIND_STYLE[ev.kind]
          const isNew = newIds.has(ev.id)
          return (
            <div
              key={ev.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-700 ${
                isNew ? 'border-[#10D6A3]/50 bg-[#087F63]/10' : 'border-[#1A2B22] bg-[#0A0F0D]/60'
              }`}
            >
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${s.bg} ${s.text}`}>
                {KIND_LABEL[ev.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#E8F0EC]">{ev.label}</p>
                {ev.sublabel && <p className="truncate text-[10px] text-[#6B8A7C]">{ev.sublabel}</p>}
              </div>
              <span className="shrink-0 text-[10px] font-medium text-[#6B8A7C]">{relTime(ev.at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript kompilieren**

```bash
cd earntrack-web
npx tsc --noEmit
```

Erwartete Ausgabe: keine Fehler in `src/app/analytics/LiveFeed.tsx`.

- [ ] **Step 3: Commit**

```bash
cd earntrack-web
git add src/app/analytics/LiveFeed.tsx
git commit -m "feat: LiveFeed-Komponente fuer Echtzeit-Events (Registrierung/Zahlung/Demo/Upgrade/Kuendigung)"
```

(Funktionale Verifikation erfolgt in Task 6, sobald die Komponente sichtbar eingebunden ist.)

---

### Task 6: `LiveFeed` in die Analytics-Seite einbinden

**Files:**
- Modify: `earntrack-web/src/app/analytics/page.tsx:1-15` (Import), `:223` (Einbindung)

**Interfaces:**
- Consumes: `LiveFeed` (default export) aus Task 5.

- [ ] **Step 1: Import ergänzen**

Nach der bestehenden Import-Zeile `import { X, Check } from 'lucide-react'` (Zeile 13) einfügen:

```typescript
import LiveFeed from './LiveFeed'
```

- [ ] **Step 2: Komponente im Übersicht-Tab einbinden**

Aktuell (Zeile 221-224):
```tsx
            {activeTab === 'ubersicht' && (
              <div className="space-y-8">
                {data?.recentSignups?.length > 0 && <NeusteUserBox signups={data.recentSignups} />}
                <UserGrowthComparison k={k} />
```

Ändern zu:
```tsx
            {activeTab === 'ubersicht' && (
              <div className="space-y-8">
                <LiveFeed />
                {data?.recentSignups?.length > 0 && <NeusteUserBox signups={data.recentSignups} />}
                <UserGrowthComparison k={k} />
```

(`NeusteUserBox` bleibt bestehen — sie zeigt die letzten Signups beim Laden der Seite, `LiveFeed` ergänzt das um Echtzeit-Updates während des Betrachtens. Beide haben unterschiedlichen Zweck, kein Duplikat.)

- [ ] **Step 3: Lokal starten und visuell prüfen**

```bash
cd earntrack-web
npm run dev
```

Browser: `http://localhost:3000/analytics` (als `soulaymanking@gmail.com` eingeloggt) öffnen. Der neue "Live-Aktivität"-Block muss oben im Übersicht-Tab erscheinen (oder gar nicht, wenn noch keine Events in den letzten 15 Dokumenten der beobachteten Collections liegen — das ist beim ersten Laden normal, siehe `initialized`-Guard in Task 5 Step 1).

- [ ] **Step 4: Live-Verhalten testen**

Bei laufendem `npm run dev` und offener Analytics-Seite in einem Browser-Tab: in einem zweiten Tab/Gerät eine neue Test-Registrierung durchführen (z.B. über die Demo-Registrierung der Web-App) ODER manuell in der Firebase Console ein Dokument in `payment_requests` anlegen. Im ersten Tab muss der neue Eintrag innerhalb von 1-2 Sekunden oben im Live-Feed erscheinen, kurz farblich hervorgehoben.

- [ ] **Step 5: Commit**

```bash
cd earntrack-web
git add src/app/analytics/page.tsx
git commit -m "feat: LiveFeed in Analytics-Uebersicht einbinden"
```

---

### Task 7: `UserModal` — Aktivitäts-Historie-Abschnitt

**Files:**
- Modify: `earntrack-web/src/app/analytics/page.tsx:822-853` (`UserModal`-Komponente)

**Interfaces:**
- Consumes: `db` aus `@/lib/firebase`, Firestore-Collection `activity_events` aus Task 1/2/3/4, `fmt()` Helper (bereits vorhanden, Zeile 17-30).
- Produces: `UserModal` zeigt bei jedem Öffnen zusätzlich die letzten 50 Aktivitäten des ausgewählten Users.

- [ ] **Step 1: Firestore-Query-Imports ergänzen**

Am Anfang der Datei, in der bestehenden Import-Zeile (Zeile 3-13 Bereich), `firebase/firestore`-Import ergänzen. Falls noch kein direkter Firestore-Import in dieser Datei existiert, neue Zeile nach den bestehenden Imports einfügen:

```typescript
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
```

- [ ] **Step 2: Aktueller Stand von `UserModal` (Referenz)**

```typescript
function UserModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#1A2B22] bg-[#111B15] shadow-2xl shadow-black/40" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#1A2B22] px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#E8F0EC]">{user.name || user.email}</h2>
            <p className="text-xs text-[#6B8A7C]">{user.email} · {user.companyName||'-'}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0A0F0D] text-[#6B8A7C] transition hover:text-[#E8F0EC]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <InfoCard label="Status" value={<StatusBadge status={user.subscriptionStatus}/>}/>
            <InfoCard label="Rolle" value={user.role === 'owner' ? 'Inhaber' : 'Angestellter'}/>
            <InfoCard label="Letzte Aktivität" value={fmt(user.lastActive)}/>
            <InfoCard label="Aktionen" value={String(user.totalActions)}/>
            <InfoCard label="Plan" value={
              user.subscriptionStatus === 'active'
                ? 'Pro'
                : user.subscriptionPlan === 'trial' || !user.subscriptionPlan
                  ? 'Trial'
                  : user.subscriptionPlan
            }/>
            <InfoCard label="Registriert" value={fmtDate(user.createdAt)}/>
          </div>
          <InfoCard label="E-Mail bestätigt" value={user.emailVerified ? <span className="inline-flex items-center gap-1">Ja <Check className="w-3 h-3 inline text-green-600" /></span> : 'Nein'}/>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Aktivitäts-Abschnitt ergänzen**

Ersetze die komplette `UserModal`-Funktion durch:

```typescript
function UserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [activity, setActivity] = useState<{ id: string; action: string; platform: string; at: number }[]>([])
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    setActivityLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'activity_events'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)),
      snap => {
        setActivity(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            action: data.action || '-',
            platform: data.platform || 'web',
            at: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
          }
        }))
        setActivityLoading(false)
      },
      () => setActivityLoading(false)
    )
    return unsub
  }, [user?.uid])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#1A2B22] bg-[#111B15] shadow-2xl shadow-black/40" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#1A2B22] px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#E8F0EC]">{user.name || user.email}</h2>
            <p className="text-xs text-[#6B8A7C]">{user.email} · {user.companyName||'-'}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0A0F0D] text-[#6B8A7C] transition hover:text-[#E8F0EC]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <InfoCard label="Status" value={<StatusBadge status={user.subscriptionStatus}/>}/>
            <InfoCard label="Rolle" value={user.role === 'owner' ? 'Inhaber' : 'Angestellter'}/>
            <InfoCard label="Letzte Aktivität" value={fmt(user.lastActive)}/>
            <InfoCard label="Aktionen" value={String(user.totalActions)}/>
            <InfoCard label="Plan" value={
              user.subscriptionStatus === 'active'
                ? 'Pro'
                : user.subscriptionPlan === 'trial' || !user.subscriptionPlan
                  ? 'Trial'
                  : user.subscriptionPlan
            }/>
            <InfoCard label="Registriert" value={fmtDate(user.createdAt)}/>
          </div>
          <InfoCard label="E-Mail bestätigt" value={user.emailVerified ? <span className="inline-flex items-center gap-1">Ja <Check className="w-3 h-3 inline text-green-600" /></span> : 'Nein'}/>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#6B8A7C]">Aktivität</p>
            <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-[#1A2B22] bg-[#0A0F0D] p-3">
              {activityLoading ? (
                <p className="py-4 text-center text-xs text-[#6B8A7C]">Lade...</p>
              ) : activity.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#6B8A7C]">Keine erfassten Aktionen</p>
              ) : (
                activity.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[#111B15]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded-full border border-[#1A2B22] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#6B8A7C]">{a.platform}</span>
                      <span className="truncate text-xs text-[#C5D9D0]">{a.action}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-[#6B8A7C]">{fmt(new Date(a.at).toISOString())}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript kompilieren**

```bash
cd earntrack-web
npx tsc --noEmit
```

Erwartete Ausgabe: keine Fehler in `src/app/analytics/page.tsx`.

- [ ] **Step 5: Manuell verifizieren**

`npm run dev`, Analytics-Seite öffnen, Tab "Nutzer", einen User anklicken, dessen E-Mail bereits über Task 4 (Web-Login) oder Task 3 (Mobile-Aktion) ein `activity_events`-Dokument erzeugt hat. Modal muss den neuen "Aktivität"-Abschnitt mit mindestens einem Eintrag zeigen (Plattform-Badge, Aktion, Zeit).

- [ ] **Step 6: Commit**

```bash
cd earntrack-web
git add src/app/analytics/page.tsx
git commit -m "feat: UserModal zeigt Aktivitaets-Historie aus activity_events"
```

---

## Self-Review (durchgeführt beim Schreiben dieses Plans)

**Spec-Abdeckung:**
- Live-Feed wichtiger Events → Task 5 + 6 ✓
- Aktivitäts-Historie pro User → Task 2 (Backend) + 3/4 (Instrumentierung) + 7 (UI) ✓
- Firestore-Regeln (`activity_events`, Admin-Read-Lücke) → Task 1 ✓
- Fehlerbehandlung (Logging darf Nutzeraktion nie blockieren) → Task 2 Step 2 (eigener try/catch) ✓
- Web-Instrumentierung minimal auf Login beschränkt (aus Spec-Präzisierung) → Task 4 ✓
- Manuelle Verifikation statt neuer Test-Infrastruktur → jede Task Step "manuell verifizieren" ✓
- Out-of-Scope-Punkte (kein DB-Editor, kein E-Mail-Versand) → keine Task berührt das ✓

**Platzhalter-Scan:** Keine TBD/TODO, jeder Code-Block ist vollständig.

**Typ-Konsistenz:** `logUsage`-Aufrufsignatur `{ action, platform }` konsistent zwischen Task 2 (Cloud Function), Task 3 (Mobile) und Task 4 (Web). `FeedEvent`/`activity_events`-Feldnamen (`uid`, `action`, `platform`, `createdAt`) konsistent zwischen Task 2, 5 und 7.

**Reihenfolge-Abhängigkeit:** Task 1 muss vor Task 2 und 5 laufen (Regeln), Task 2 vor Task 3/4 (Cloud Function muss `platform`-Feld akzeptieren, bevor Clients es schicken — rückwärtskompatibel, da `platform` optional ist), Task 5 vor Task 6 (Komponente muss existieren, bevor sie eingebunden wird). Reihenfolge im Plan entspricht dem.
