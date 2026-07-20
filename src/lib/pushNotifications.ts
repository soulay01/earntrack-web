import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

async function sendFcm(uids: string[], title: string, body: string, data: Record<string, string>) {
  const { getAuth } = await import('firebase/auth');
  const idToken = await getAuth().currentUser?.getIdToken();
  await fetch('/api/fcm-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ uids, title, body, data: { ...data, sound: 'default' } }),
  });
}

async function sendExpo(tokens: string[], title: string, body: string, data: Record<string, string>) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(tokens.map(to => ({ to, title, body, data: { ...data, sound: 'default' } }))),
      signal: controller.signal,
    });
  } finally { clearTimeout(t); }
}

export async function notifyProjectMembers(
  assignmentId: string,
  excludeUid: string,
  title: string,
  body: string,
  data: Record<string, string>
) {
  try {
    const [assignmentSnap, membersSnap] = await Promise.all([
      getDoc(doc(db, 'assignments', assignmentId)),
      getDoc(doc(db, 'project_members', assignmentId)),
    ]);

    const recipientUids = new Set<string>();
    const ownerId = assignmentSnap.exists()
      ? ((assignmentSnap.data() as any).createdBy || (assignmentSnap.data() as any).userId)
      : null;
    if (ownerId && ownerId !== excludeUid) recipientUids.add(ownerId);
    if (membersSnap.exists()) {
      Object.keys(membersSnap.data()).forEach((mUid) => {
        if (mUid !== excludeUid) recipientUids.add(mUid);
      });
    }

    const uidArr = Array.from(recipientUids);
    if (uidArr.length === 0) return;

    // FCM — server resolves tokens via admin SDK, no client-side user doc read needed
    sendFcm(uidArr, title, body, data).catch(e => console.warn('fcm push failed', e));

    // Expo — requires client-side user doc read; best-effort per member
    const expoTokens: string[] = [];
    for (const uid of uidArr) {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const token = (snap.data() as any)?.expoPushToken;
        if (token) expoTokens.push(token);
      } catch { /* permission denied for this member — skip */ }
    }
    if (expoTokens.length > 0) {
      sendExpo(expoTokens, title, body, data).catch(e => console.warn('expo push failed', e));
    }
  } catch (e) { console.warn('push notification failed', e); }
}

export async function sendNoteCreatedNotification(
  note: any,
  noteId: string,
  excludeUid: string
) {
  if (!note.assignmentId) return;
  const isPinned = note.isPinned || false;
  const title = isPinned ? 'Neue Ankündigung' : 'Neue Notiz';
  const displayName = note.userName || note.userEmail || 'Mitarbeiter';
  const body = `${displayName}: ${(note.text || note.note || '').substring(0, 50)}`;
  await notifyProjectMembers(note.assignmentId, excludeUid, title, body, {
    assignmentId: note.assignmentId,
    type: isPinned ? 'pinned_note' : 'note',
  });
}

export async function sendPhotoCreatedNotification(photo: any, excludeUid: string) {
  if (!photo.assignmentId) return;
  const displayName = photo.userName || photo.userEmail || 'Mitarbeiter';
  const body = photo.caption
    ? `${displayName}: ${String(photo.caption).substring(0, 80)}`
    : `${displayName} hat ein Foto hinzugefügt`;
  await notifyProjectMembers(photo.assignmentId, excludeUid, 'Neues Foto', body, {
    assignmentId: photo.assignmentId,
    type: 'photo',
  });
}

// Notify company owner by UID — used for inventory actions.
// FCM goes directly to /api/fcm-send (server resolves token, no client read needed).
// Expo is best-effort: requires client-side read which may fail for employees.
export async function notifyCompanyOwner(
  ownerUid: string,
  excludeUid: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  if (!ownerUid || ownerUid === excludeUid) return;

  // FCM: always attempt — server-side admin SDK bypasses Firestore rules
  sendFcm([ownerUid], title, body, data).catch(e => console.warn('fcm push failed', e));

  // Expo: best-effort — employees can now read owner doc (rules fixed)
  try {
    const userSnap = await getDoc(doc(db, 'users', ownerUid));
    const token = (userSnap.data() as any)?.expoPushToken;
    if (token) sendExpo([token], title, body, data).catch(e => console.warn('expo push failed', e));
  } catch { /* permission denied — FCM already attempted above */ }
}

export async function sendReplyCreatedNotification(
  reply: any,
  excludeUid: string
) {
  if (!reply) return;
  try {
    const noteSnap = await getDoc(doc(db, 'project_notes', reply.noteId));
    if (!noteSnap.exists()) return;
    const noteData = noteSnap.data() as any;
    if (!noteData.assignmentId) return;
    const displayName = reply.userName || reply.userEmail || 'Mitarbeiter';
    const body = `${displayName}: ${(reply.text || '').substring(0, 50)}`;
    await notifyProjectMembers(noteData.assignmentId, excludeUid, 'Neue Antwort', body, {
      noteId: reply.noteId,
      assignmentId: noteData.assignmentId,
      type: 'note_reply',
    });
  } catch (e) { console.warn('reply notification failed', e); }
}
