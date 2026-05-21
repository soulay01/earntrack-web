import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebase';

export function onAuthChange(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function loginEmail(email: string, pw: string) {
  return signInWithEmailAndPassword(auth, email, pw);
}

export async function registerEmail(email: string, pw: string) {
  return createUserWithEmailAndPassword(auth, email, pw);
}

export async function loginGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function logout() {
  return signOut(auth);
}

export async function resetPw(email: string) {
  return sendPasswordResetEmail(auth, email);
}
