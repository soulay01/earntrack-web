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

    const tokens: string[] = [];
    const uidArr = Array.from(recipientUids);
    for (const uid of uidArr) {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const token = (userSnap.data() as any)?.expoPushToken;
        if (token) tokens.push(token);
      } catch (e) { console.warn('push token fetch failed', e); }
    }

    if (tokens.length === 0) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(
        tokens.map((token) => ({ to: token, title, body, data }))
      ),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) console.warn('push notification status', res.status);
  } catch (e) { console.warn('push notification failed', e); }
}

export async function sendNoteCreatedNotification(
  note: any,
  noteId: string,
  excludeUid: string
) {
  if (!note.assignmentId) return;
  const isPinned = note.isPinned || false;
  const title = isPinned ? '📌 Neue Ankündigung' : '📝 Neue Notiz';
  const displayName = note.userName || note.userEmail || 'Mitarbeiter';
  const body = `${displayName}: ${(note.text || note.note || '').substring(0, 50)}`;
  await notifyProjectMembers(note.assignmentId, excludeUid, title, body, {
    assignmentId: note.assignmentId,
    type: isPinned ? 'pinned_note' : 'note',
  });
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
    await notifyProjectMembers(noteData.assignmentId, excludeUid, '💬 Neue Antwort', body, {
      noteId: reply.noteId,
      assignmentId: noteData.assignmentId,
      type: 'note_reply',
    });
  } catch (e) { console.warn('reply notification failed', e); }
}
