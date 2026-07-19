import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

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

    const expoTokens: string[] = [];
    const fcmUids: string[] = [];
    const uidArr = Array.from(recipientUids);
    for (const uid of uidArr) {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const userData = userSnap.data() as any;
        // Expo push (mobile app)
        if (userData?.expoPushToken) expoTokens.push(userData.expoPushToken);
        // FCM push (web app) — nur die uid sammeln, /api/fcm-send löst den Token
        // serverseitig auf und prüft dabei die Firmenzugehörigkeit (siehe dort).
        if (userData?.fcmToken) fcmUids.push(uid);
      } catch (e) { console.warn('push token fetch failed', e); }
    }

    // Send Expo pushes (mobile)
    if (expoTokens.length > 0) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(
            expoTokens.map((token) => ({ to: token, title, body, data: { ...data, sound: 'default' } }))
          ),
          signal: controller.signal,
        });
      } catch (e) { console.warn('expo push failed', e); }
      clearTimeout(timeout);
    }

    // Send FCM pushes (web)
    if (fcmUids.length > 0) {
      try {
        const { getAuth } = await import('firebase/auth');
        const idToken = await getAuth().currentUser?.getIdToken();
        await fetch('/api/fcm-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
          body: JSON.stringify({
            uids: fcmUids,
            title,
            body,
            data: { ...data, sound: 'default' },
          }),
        });
      } catch (e) { console.warn('fcm push failed', e); }
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

// Notify a single user by UID (e.g. company owner for inventory actions).
// Skips if uid === excludeUid so owners are never notified about their own actions.
export async function notifyCompanyOwner(
  ownerUid: string,
  excludeUid: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  if (!ownerUid || ownerUid === excludeUid) return;
  try {
    const userSnap = await getDoc(doc(db, 'users', ownerUid));
    const userData = userSnap.data() as any;

    const expoTokens: string[] = [];
    const fcmUids: string[] = [];
    if (userData?.expoPushToken) expoTokens.push(userData.expoPushToken);
    if (userData?.fcmToken) fcmUids.push(ownerUid);

    if (expoTokens.length > 0) {
      try {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(expoTokens.map(to => ({ to, title, body, data: { ...data, sound: 'default' } }))),
        });
      } catch (e) { console.warn('expo push failed', e); }
    }
    if (fcmUids.length > 0) {
      try {
        const { getAuth } = await import('firebase/auth');
        const idToken = await getAuth().currentUser?.getIdToken();
        await fetch('/api/fcm-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
          body: JSON.stringify({ uids: fcmUids, title, body, data: { ...data, sound: 'default' } }),
        });
      } catch (e) { console.warn('fcm push failed', e); }
    }
  } catch (e) { console.warn('notifyCompanyOwner failed', e); }
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
