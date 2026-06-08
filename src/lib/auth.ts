import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
  confirmPasswordReset,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';

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

export async function registerEmail(email: string, pw: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  try {
    await sendEmailVerification(cred.user, {
      url: verifyUrl(),
      handleCodeInApp: true,
    });
  } catch {
    await sendEmailVerification(cred.user);
  }
  return cred;
}

export async function sendVerificationEmail() {
  const u = auth.currentUser;
  if (!u) throw new Error('Nicht angemeldet');
  try {
    await sendEmailVerification(u, {
      url: verifyUrl(),
      handleCodeInApp: true,
    });
  } catch {
    await sendEmailVerification(u);
  }
}

export async function reloadUser() {
  const u = auth.currentUser;
  if (u) try { await reload(u); } catch (e) { console.error('reloadUser failed:', e); }
}

export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function logout() {
  return signOut(auth);
}

export async function resetPw(email: string) {
  try {
    await sendPasswordResetEmail(auth, email, {
      url: verifyUrl(),
      handleCodeInApp: true,
    });
  } catch {
    await sendPasswordResetEmail(auth, email);
  }
}

export { confirmPasswordReset };
