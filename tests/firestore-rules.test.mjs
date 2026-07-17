// Regressionstest für firestore.rules:
// - Serverseitiges Plan-Gating (Mahnwesen-Statuswechsel auf assignments + companies/{id}/recurring)
// - companyId-Immutability bei Updates (Cross-Tenant-Dateninjektion, Security-Review vom 17.07.)
// - project_members Self-Join-Lücke (jeder authentifizierte User konnte fremde Mitgliederlisten überschreiben)
// - users/{uid} horizontale Rechteausweitung (nur Owner darf fremde Profile im Unternehmen ändern)
// - Company-Erstregistrierung (resolveCompanyId-Trial-Create vs. subscriptionStatus-Bypass, Live-Audit vom 18.07.
//   fand die vorherige isSubscriptionField()-Regel blockte JEDE Neuregistrierung in Produktion)
//
// Ausführen: firebase emulators:exec --only firestore "node tests/firestore-rules.test.mjs"
// (aus dem earntrack-web-Ordner; benötigt Java für den Emulator)

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

let failed = 0;
function check(name, promise) {
  return promise.then(
    () => console.log(`  ok: ${name}`),
    (e) => { failed++; console.error(`  FAIL: ${name} — ${e.message}`); },
  );
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-earntrack-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, plan] of [['soloOwner', 'solo'], ['teamOwner', 'team'], ['otherOwner', 'team']]) {
      await setDoc(doc(db, 'users', uid), { companyId: uid, role: 'owner' });
      await setDoc(doc(db, 'companies', uid), { subscriptionPlan: plan, subscriptionStatus: 'active' });
      await setDoc(doc(db, 'assignments', `a-${uid}`), { companyId: uid, invoiceStatus: 'gesendet' });
    }
    // Angestellter bei teamOwner, keine eigene Firma.
    await setDoc(doc(db, 'users', 'teamEmployee'), { companyId: 'teamOwner', role: 'employee' });
    await setDoc(doc(db, 'customers', 'c-soloOwner'), { companyId: 'soloOwner', name: 'Kunde A' });
    await setDoc(doc(db, 'project_members', 'a-otherOwner'), { otherOwner: { role: 'owner' } });
  });

  const solo = testEnv.authenticatedContext('soloOwner').firestore();
  const team = testEnv.authenticatedContext('teamOwner').firestore();
  const other = testEnv.authenticatedContext('otherOwner').firestore();
  const employee = testEnv.authenticatedContext('teamEmployee').firestore();

  console.log('Mahnwesen (assignments.invoiceStatus -> mahnung_1/2):');
  await check('Solo-Plan: Mahnung setzen wird abgelehnt',
    assertFails(updateDoc(doc(solo, 'assignments', 'a-soloOwner'), { invoiceStatus: 'mahnung_1' })));
  await check('Team-Plan: Mahnung setzen ist erlaubt',
    assertSucceeds(updateDoc(doc(team, 'assignments', 'a-teamOwner'), { invoiceStatus: 'mahnung_1' })));
  await check('Solo-Plan: normaler Statuswechsel (kein Mahnwesen) bleibt erlaubt',
    assertSucceeds(updateDoc(doc(solo, 'assignments', 'a-soloOwner'), { invoiceStatus: 'bezahlt' })));

  console.log('Wiederkehrende Rechnungen (companies/{id}/recurring):');
  await check('Solo-Plan: Anlegen wird abgelehnt',
    assertFails(setDoc(doc(solo, 'companies', 'soloOwner', 'recurring', 'r1'), { name: 'Test' })));
  await check('Team-Plan: Anlegen ist erlaubt',
    assertSucceeds(setDoc(doc(team, 'companies', 'teamOwner', 'recurring', 'r1'), { name: 'Test' })));

  console.log('Andere Subcollections bleiben plan-unabhängig:');
  await check('Solo-Plan: settings/invoice weiterhin erlaubt',
    assertSucceeds(setDoc(doc(solo, 'companies', 'soloOwner', 'settings', 'invoice'), { taxRate: 19 })));
  await check('Solo-Plan: estimateTemplates weiterhin erlaubt',
    assertSucceeds(setDoc(doc(solo, 'companies', 'soloOwner', 'estimateTemplates', 't1'), { name: 'x' })));

  console.log('companyId-Immutability (Cross-Tenant-Dateninjektion):');
  await check('Eigener Kunde: companyId auf fremde Firma umbiegen wird abgelehnt',
    assertFails(updateDoc(doc(solo, 'customers', 'c-soloOwner'), { companyId: 'otherOwner' })));
  await check('Eigener Kunde: normales Feld ändern (companyId unverändert) bleibt erlaubt',
    assertSucceeds(updateDoc(doc(solo, 'customers', 'c-soloOwner'), { name: 'Kunde A (aktualisiert)' })));
  await check('Eigenes Assignment: companyId umbiegen wird abgelehnt (Dunning-Check + Immutability kombiniert)',
    assertFails(updateDoc(doc(team, 'assignments', 'a-teamOwner'), { companyId: 'otherOwner' })));

  console.log('project_members (Self-Join-Lücke):');
  await check('Fremder User kann sich nicht mehr selbst in fremdes Projekt eintragen',
    assertFails(setDoc(doc(team, 'project_members', 'a-otherOwner'), { teamOwner: { role: 'member' } }, { merge: true })));
  await check('Owner kann weiterhin die eigene Mitgliederliste schreiben',
    assertSucceeds(setDoc(doc(other, 'project_members', 'a-otherOwner'), { otherOwner: { role: 'owner' } }, { merge: true })));

  console.log('users/{uid} (horizontale Rechteausweitung):');
  await check('Normaler Mitarbeiter kann NICHT das Profil eines Kollegen (Owner) ändern',
    assertFails(updateDoc(doc(employee, 'users', 'teamOwner'), { displayName: 'Gehackt' })));
  await check('Owner kann weiterhin Profile im eigenen Unternehmen ändern',
    assertSucceeds(updateDoc(doc(team, 'users', 'teamEmployee'), { displayName: 'Aktualisiert' })));
  await check('User kann weiterhin das eigene Profil ändern',
    assertSucceeds(updateDoc(doc(employee, 'users', 'teamEmployee'), { displayName: 'Ich selbst' })));

  console.log('Company-Erstregistrierung (resolveCompanyId Trial-Create):');
  const newOwner = testEnv.authenticatedContext('newOwner').firestore();
  await check('Neue Firma mit Standard-Trial-Werten anlegen ist erlaubt (Signup-Flow)',
    assertSucceeds(setDoc(doc(newOwner, 'companies', 'newOwner'), {
      id: 'newOwner', name: 'Neue Firma', subscriptionStatus: 'trial', subscriptionPlan: 'trial',
      trialEndsAt: new Date(), needsOnboarding: true,
    })));
  await check('Firma direkt mit subscriptionStatus=active anlegen (Bypass) wird abgelehnt',
    assertFails(setDoc(doc(newOwner, 'companies', 'newOwner'), {
      id: 'newOwner', name: 'Neue Firma', subscriptionStatus: 'active', subscriptionPlan: 'team',
    })));
  await check('Firma mit trial-Status aber zusätzlichem gesperrtem Feld (nextBillingDate) wird abgelehnt',
    assertFails(setDoc(doc(newOwner, 'companies', 'newOwner'), {
      id: 'newOwner', name: 'Neue Firma', subscriptionStatus: 'trial', subscriptionPlan: 'trial',
      nextBillingDate: new Date(),
    })));

  await testEnv.cleanup();

  if (failed > 0) {
    console.error(`\n${failed} Test(s) fehlgeschlagen.`);
    process.exit(1);
  }
  console.log('\nAlle Tests grün.');
}

main().catch((e) => { console.error(e); process.exit(1); });
