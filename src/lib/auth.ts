import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail as sendNativePasswordResetEmail,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
  confirmPasswordReset,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, callFunction } from './firebase';

export function onAuthChange(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function loginEmail(email: string, pw: string) {
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  if (!cred.user?.emailVerified) {
    await signOut(auth);
    throw { code: 'auth/email-not-verified', message: 'E-Mail nicht bestätigt. Bitte prüfe dein Postfach.' };
  }
  return cred;
}

function verifyUrl() {
  return (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://app.earntrack.de') + '/email-verified';
}

// Verschickt die personalisierte, gebrandete Bestätigungsmail über die
// sendVerificationEmail Cloud Function. Fällt auf die nackte Firebase-Auth-
// Standardmail zurück, falls der Funktionsaufruf scheitert (z.B. Gmail-SMTP
// nicht konfiguriert) — der Nutzer bekommt so in jedem Fall eine Mail.
async function sendBrandedVerificationEmail(user: import('firebase/auth').User) {
  try {
    await callFunction('sendVerificationEmail', { continueUrl: verifyUrl() });
  } catch {
    try {
      await sendEmailVerification(user, { url: verifyUrl(), handleCodeInApp: true });
    } catch {
      await sendEmailVerification(user);
    }
  }
}

export async function registerEmail(email: string, pw: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  await sendBrandedVerificationEmail(cred.user);
  return cred;
}

export async function sendVerificationEmail() {
  const u = auth.currentUser;
  if (!u) throw new Error('Nicht angemeldet');
  await sendBrandedVerificationEmail(u);
}

export async function reloadUser() {
  const u = auth.currentUser;
  if (!u) return;
  await reload(u);
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

export async function logout() {
  return signOut(auth);
}

// Verschickt die gebrandete Passwort-zurücksetzen-Mail über die
// sendPasswordResetEmail Cloud Function. Fällt auf die native Firebase-Mail
// zurück, falls der Funktionsaufruf scheitert.
export async function resetPw(email: string) {
  try {
    await callFunction('sendPasswordResetEmail', { email, continueUrl: verifyUrl() });
  } catch {
    try {
      await sendNativePasswordResetEmail(auth, email, { url: verifyUrl(), handleCodeInApp: true });
    } catch {
      await sendNativePasswordResetEmail(auth, email);
    }
  }
}

export { confirmPasswordReset };
