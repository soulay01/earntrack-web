import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, deleteField, query, where, onSnapshot, serverTimestamp, orderBy, Timestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getDb, initializationPromiseExport, hasRealConfig } from '../firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';
import { AuthContext } from './AuthContext';
import { getT } from './LanguageContext';
import { sendPushNotification } from '../utils/notifications';

export const ProjectAccessContext = createContext({
  myProjects: [],
  loading: false,
  isEmployee: false,
  removedMessage: null,
  leaveProject: async () => ({ success: false }),
  removeProjectMember: async () => ({ success: false }),
  clockIn: async () => ({ success: false }),
  clockOut: async () => ({ success: false }),
  pauseClock: async () => ({ success: false }),
  resumeClock: async () => ({ success: false }),
  addNote: async () => ({}),
  addPhoto: async () => ({}),
  getProjectMembers: async () => [],
  getClockEntries: async () => [],
  getProjectNotes: async () => [],
  getProjectPhotos: async () => [],
  updateClockEntry: async () => ({ success: false, error: getT()('Not initialized') }),
  togglePinNote: async () => ({ success: false }),
  togglePinPhoto: async () => ({ success: false }),
  addNoteReply: async () => ({ success: false }),
});

export const ProjectAccessProvider = ({ children }) => {
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEmployee, setIsEmployee] = useState(false);
  const [removedMessage, setRemovedMessage] = useState(null);
  const { user } = useContext(AuthContext);
  const clockingInRef = useRef(false);

  const loadProjects = useCallback(async () => {
    if (!user || !hasRealConfig) {
      setMyProjects([]);
      setIsEmployee(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await initializationPromiseExport;
      const db = getDb();

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.exists() ? userDoc.data() : {};
      const userRole = userData.role || 'owner';
      const companyId = userData.companyId;
      setIsEmployee(userRole === 'employee');

      if (userData.removedFromProject) {
        const projectName = userData.removedFromProjectName || getT()('einem Projekt');
        setRemovedMessage(`${getT()('Du wurdest von')} "${projectName}" ${getT()('entfernt.')}`);
        await updateDoc(doc(db, 'users', user.uid), {
          removedFromProject: null,
          removedFromProjectName: null,
        });
      }

      if (userRole === 'employee') {
        const projectIds = userData.linkedToProjects || (userData.linkedToProject ? [userData.linkedToProject] : []);
        if (projectIds.length > 0) {
          const results = await Promise.allSettled(
            projectIds.map(pid => getDoc(doc(db, 'assignments', pid)))
          );
          const projects = [];
          results.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value.exists()) {
              projects.push({
                id: projectIds[i],
                ...r.value.data(),
                isEmployee: true,
              });
            }
          });
          setMyProjects(projects);
        } else {
          setMyProjects([]);
        }
      } else if (userRole === 'owner') {
        const companyIdForQuery = userData.companyId;
        const assignmentsQuery = companyIdForQuery
          ? query(
              collection(db, 'assignments'),
              where('companyId', '==', companyIdForQuery)
            )
          : query(
              collection(db, 'assignments')
            );
        const snapshot = await getDocs(assignmentsQuery);
        const projects = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          isOwner: true,
        }));
        setMyProjects(projects);
      } else {
        setMyProjects([]);
      }
    } catch (error) {
      if (__DEV__) console.error('Error loading projects:', error);
      setMyProjects([]);
      setIsEmployee(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const leaveProject = async (assignmentId) => {
    if (!user) return { success: false };

    try {
      await initializationPromiseExport;
      const db = getDb();

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const currentProjects = userData.linkedToProjects || [];
      await updateDoc(doc(db, 'users', user.uid), {
        linkedToProjects: currentProjects.filter(pid => pid !== assignmentId),
        leftAt: serverTimestamp(),
      });
      if (currentProjects.length <= 1) {
        await updateDoc(doc(db, 'users', user.uid), {
          linkedToProject: null,
        });
      }

      if (!isEmployee) {
        const membersData = await getDoc(doc(db, 'project_members', assignmentId));
        if (membersData.exists()) {
          const members = membersData.data();
          delete members[user.uid];
          await setDoc(doc(db, 'project_members', assignmentId), members);
        }
      }

      await loadProjects();
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Leave project error:', error);
      return { success: false };
    }
  };

  const clockIn = async (assignmentId) => {
    if (!user) return { success: false, error: getT()('Nicht eingeloggt') };
    if (clockingInRef.current) return { success: false, error: getT()('Bereits am Einstempeln...') };

    clockingInRef.current = true;
    try {
      await initializationPromiseExport;
      const db = getDb();

      const activeResult = await getDocs(
        query(
          collection(db, 'clock_entries'),
          where('assignmentId', '==', assignmentId),
          where('userId', '==', user.uid),
          where('clockOut', '==', null)
        )
      ).catch(() => null);

      if (activeResult && !activeResult.empty) {
        return { success: false, error: getT()('Bereits eingestempelt') };
      }

      const entryRef =       await addDoc(collection(db, 'clock_entries'), {
        assignmentId,
        userId: user.uid,
        userEmail: user.email,
        clockIn: serverTimestamp(),
        clockOut: null,
        totalMinutes: null,
        totalBreakMinutes: 0,
        breakStart: null,
        breakEnd: null,
        isPaused: false,
        notes: '',
        createdAt: serverTimestamp(),
      });

      return { success: true, entryId: entryRef.id };
    } catch (error) {
      if (__DEV__) console.error('Clock in error:', error);
      return { success: false, error: getT()('Fehler beim Einstempeln') };
    } finally {
      clockingInRef.current = false;
    }
  };

  const pauseClock = async (assignmentId) => {
    if (!user) return { success: false, error: getT()('Nicht eingeloggt') };

    try {
      await initializationPromiseExport;
      const db = getDb();

      const activeEntry = await getDocs(
        query(
          collection(db, 'clock_entries'),
          where('assignmentId', '==', assignmentId),
          where('userId', '==', user.uid),
          where('clockOut', '==', null)
        )
      ).catch(() => null);

      if (!activeEntry || activeEntry.empty) {
        return { success: false, error: getT()('Nicht eingestempelt') };
      }

      const entryDoc = activeEntry.docs[0];
      if (entryDoc.data().isPaused) {
        return { success: false, error: getT()('Bereits pausiert') };
      }

      await updateDoc(doc(db, 'clock_entries', entryDoc.id), {
        breakStart: serverTimestamp(),
        isPaused: true,
      });

      try {
        const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (assignmentDoc.exists()) {
          const ownerId = assignmentDoc.data().createdBy;
          if (ownerId && ownerId !== user.uid) {
            const ownerDoc = await getDoc(doc(db, 'users', ownerId)).catch(() => null);
            if (ownerDoc?.exists() && ownerDoc.data().expoPushToken) {
              sendPushNotification({
                to: ownerDoc.data().expoPushToken,
                title: getT()('☕ Mitarbeiter in Pause'),
                body: `${user.email} ${getT()('macht Pause bei')} "${assignmentDoc.data().projekt || getT()('Projekt')}"`,
                data: { assignmentId, userId: user.uid, type: 'clock_pause' },
              }).catch(() => {});
            }
          }
        }
      } catch {}

      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Pause clock error:', error);
      return { success: false, error: getT()('Fehler beim Pausieren') };
    }
  };

  const resumeClock = async (assignmentId) => {
    if (!user) return { success: false, error: getT()('Nicht eingeloggt') };

    try {
      await initializationPromiseExport;
      const db = getDb();

      const activeEntry = await getDocs(
        query(
          collection(db, 'clock_entries'),
          where('assignmentId', '==', assignmentId),
          where('userId', '==', user.uid),
          where('clockOut', '==', null)
        )
      ).catch(() => null);

      if (!activeEntry || activeEntry.empty) {
        return { success: false, error: getT()('Nicht eingestempelt') };
      }

      const entryDoc = activeEntry.docs[0];
      const data = entryDoc.data();
      if (!data.isPaused) {
        return { success: false, error: getT()('Nicht pausiert') };
      }

      const breakStartTime = data.breakStart?.toDate() || new Date();
      const now = new Date();
      const breakMinutes = Math.round((now - breakStartTime) / 60000);
      const totalBreak = (data.totalBreakMinutes || 0) + breakMinutes;

      await updateDoc(doc(db, 'clock_entries', entryDoc.id), {
        breakStart: null,
        breakEnd: serverTimestamp(),
        isPaused: false,
        totalBreakMinutes: totalBreak,
      });

      try {
        const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (assignmentDoc.exists()) {
          const ownerId = assignmentDoc.data().createdBy;
          if (ownerId && ownerId !== user.uid) {
            const ownerDoc = await getDoc(doc(db, 'users', ownerId)).catch(() => null);
            if (ownerDoc?.exists() && ownerDoc.data().expoPushToken) {
              sendPushNotification({
                to: ownerDoc.data().expoPushToken,
                title: getT()('▶️ Mitarbeiter继续'),
                body: `${user.email} ${getT()('macht weiter mit')} "${assignmentDoc.data().projekt || getT()('Projekt')}"`,
                data: { assignmentId, userId: user.uid, type: 'clock_resume' },
              }).catch(() => {});
            }
          }
        }
      } catch {}

      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Resume clock error:', error);
      return { success: false, error: getT()('Fehler beim Fortsetzen') };
    }
  };

  const clockOut = async (assignmentId, notes = '') => {
    if (!user) return { success: false, error: getT()('Nicht eingeloggt') };

    try {
      await initializationPromiseExport;
      const db = getDb();

      const activeEntry = await getDocs(
        query(
          collection(db, 'clock_entries'),
          where('assignmentId', '==', assignmentId),
          where('userId', '==', user.uid),
          where('clockOut', '==', null)
        )
      ).catch(() => null);

      if (!activeEntry || activeEntry.empty) {
        return { success: false, error: getT()('Nicht eingestempelt') };
      }

      const entryDoc = activeEntry.docs[0];
      const entryData = entryDoc.data();
      const clockInTime = entryData.clockIn?.toDate();
      const now = new Date();

      const updateData = {
        clockOut: serverTimestamp(),
        notes,
      };

      let totalBreak = entryData.totalBreakMinutes || 0;
      if (entryData.isPaused && entryData.breakStart) {
        const breakStartTime = entryData.breakStart?.toDate?.() || new Date();
        const breakMinutes = Math.round((now - breakStartTime) / 60000);
        totalBreak = (entryData.totalBreakMinutes || 0) + breakMinutes;
        updateData.totalBreakMinutes = totalBreak;
        updateData.isPaused = false;
        updateData.breakEnd = serverTimestamp();
        updateData.breakStart = null;
      }

      const totalMinutes = Math.round((now - clockInTime) / 60000) - totalBreak;
      updateData.totalMinutes = totalMinutes;

      await updateDoc(doc(db, 'clock_entries', entryDoc.id), updateData);

      try {
        const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (assignmentDoc.exists()) {
          const ownerId = assignmentDoc.data().createdBy;
          if (ownerId && ownerId !== user.uid) {
            const ownerDoc = await getDoc(doc(db, 'users', ownerId)).catch(() => null);
            if (ownerDoc?.exists() && ownerDoc.data().expoPushToken) {
              const hours = Math.floor(totalMinutes / 60);
              const mins = totalMinutes % 60;
              sendPushNotification({
                to: ownerDoc.data().expoPushToken,
                title: getT()('🏁 Mitarbeiter ausgestempelt'),
                body: `${user.email} ${getT()('hat')} "${assignmentDoc.data().projekt || getT()('Projekt')}" ${getT()('verlassen. Arbeitszeit:')} ${hours}h ${mins}min`,
                data: { assignmentId, userId: user.uid, type: 'clock_out', totalMinutes },
              }).catch(() => {});
            }
          }
        }
      } catch {}

      return { success: true, totalMinutes };
    } catch (error) {
      if (__DEV__) console.error('Clock out error:', error);
      return { success: false, error: getT()('Fehler beim Ausstempeln') };
    }
  };

  const notifyProjectMembers = async (assignmentId, excludeUid, title, body, data) => {
    try {
      const db = getDb();
      const [membersDoc, assignmentSnap] = await Promise.allSettled([
        getDoc(doc(db, 'project_members', assignmentId)),
        getDoc(doc(db, 'assignments', assignmentId)),
      ]);

      const recipientUids = new Set();
      const assignmentData = assignmentSnap.status === 'fulfilled' && assignmentSnap.value.exists() ? assignmentSnap.value.data() : null;
      const ownerId = assignmentData ? (assignmentData.createdBy || assignmentData.userId) : null;
      if (ownerId && ownerId !== excludeUid) recipientUids.add(ownerId);
      if (membersDoc.status === 'fulfilled' && membersDoc.value.exists()) {
        Object.keys(membersDoc.value.data()).forEach(mUid => {
          if (mUid !== excludeUid) recipientUids.add(mUid);
        });
      }

      await Promise.allSettled(Array.from(recipientUids).map(async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists() && userDoc.data().expoPushToken) {
            await sendPushNotification({ to: userDoc.data().expoPushToken, title, body, data }).catch(() => {});
          }
        } catch {}
      }));
    } catch (e) {
      if (__DEV__) console.error('Error sending push to project members:', e);
    }
  };

  const addNote = async (assignmentId, note, options = {}) => {
    if (!user) return { success: false };

    try {
      await initializationPromiseExport;
      const db = getDb();
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      let displayName = userDoc.exists() ? (userDoc.data().displayName || user.email) : user.email;
      if (displayName === user.email) {
        try {
          const companyDoc = await getDoc(doc(db, 'companies', user.uid));
          if (companyDoc.exists() && companyDoc.data().name) {
            displayName = companyDoc.data().name;
          }
        } catch (e) { if (__DEV__) console.warn('Error fetching company name:', e); }
      }

      const noteData = {
        assignmentId,
        userId: user.uid,
        userName: displayName,
        userEmail: user.email,
        note,
        createdAt: serverTimestamp(),
      };
      if (options.isPinned) {
        noteData.isPinned = true;
        noteData.pinnedBy = user.uid;
        noteData.replies = [];
      }

      await addDoc(collection(db, 'project_notes'), noteData);

      notifyProjectMembers(assignmentId, user.uid,
        options.isPinned ? getT()('📌 Neue Ankündigung') : getT()('📝 Neue Notiz'),
        `${displayName}: ${note.substring(0, 50)}`,
        { assignmentId, type: options.isPinned ? 'pinned_note' : 'note' }
      );

      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Add note error:', error);
      return { success: false };
    }
  };

  const addPhoto = async (assignmentId, photoUri, options = {}) => {
    if (!user) return { success: false };

    try {
      await initializationPromiseExport;
      const db = getDb();
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      let displayName = userDoc.exists() ? (userDoc.data().displayName || user.email) : user.email;
      if (displayName === user.email) {
        try {
          const companyDoc = await getDoc(doc(db, 'companies', user.uid));
          if (companyDoc.exists() && companyDoc.data().name) {
            displayName = companyDoc.data().name;
          }
        } catch (e) { if (__DEV__) console.warn('Error fetching company name:', e); }
      }

      let photoUriStored = photoUri;

      if (photoUri && !photoUri.startsWith('https://') && !photoUri.startsWith('data:image/')) {
        try {
          const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: FileSystem.EncodingType.Base64 });
          const ext = photoUri.split('.').pop()?.toLowerCase() || 'jpg';
          const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`;
          photoUriStored = dataUri.length < 800000 ? dataUri : photoUri;
        } catch (err) {
          if (__DEV__) console.error('Base64 conversion failed:', err);
        }
      }

      const photoData = {
        assignmentId,
        userId: user.uid,
        userName: displayName,
        userEmail: user.email,
        photoUri: photoUriStored,
        createdAt: serverTimestamp(),
      };
      if (options.isPinned) {
        photoData.isPinned = true;
        photoData.pinnedBy = user.uid;
      }

      await addDoc(collection(db, 'project_photos'), photoData);

      notifyProjectMembers(assignmentId, user.uid,
        getT()('📷 Neues Foto'),
        `${displayName} ${getT()('hat ein Foto geteilt')}`,
        { assignmentId, type: 'photo' }
      );

      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Add photo error:', error);
      return { success: false };
    }
  };

  const getProjectMembers = async (assignmentId) => {
    try {
      await initializationPromiseExport;
      const db = getDb();

      const [membersResult, assignmentSnap] = await Promise.allSettled([
        getDoc(doc(db, 'project_members', assignmentId)),
        getDoc(doc(db, 'assignments', assignmentId)),
      ]);

      const membersDoc = membersResult.status === 'fulfilled' ? membersResult.value : null;
      const assignmentDoc = assignmentSnap.status === 'fulfilled' ? assignmentSnap.value : null;

      const members = [];
      if (membersDoc?.exists()) {
        const membersData = membersDoc.data();
        members.push(...Object.values(membersData).map(m => ({
          uid: m.uid,
          email: m.email,
          displayName: m.displayName || m.email,
          role: m.role || 'employee',
          joinedAt: m.joinedAt,
        })));
      }

      const ownerId = assignmentDoc?.exists() ? (assignmentDoc.data().createdBy || assignmentDoc.data().userId) : null;
      if (ownerId && !members.some(m => m.uid === ownerId)) {
        const userDoc = await getDoc(doc(db, 'users', ownerId)).catch(() => null);
        if (userDoc?.exists()) {
          const uData = userDoc.data();
          members.unshift({
            uid: ownerId,
            email: uData.email || '',
            displayName: uData.displayName || uData.email || getT()('Inhaber'),
            role: 'owner',
            joinedAt: null,
          });
        }
      }

      return members;
    } catch (error) {
      if (__DEV__) console.error('Get project members error:', error);
      return [];
    }
  };

  const getClockEntries = async (assignmentId) => {
    try {
      await initializationPromiseExport;
      const db = getDb();

      const entriesQuery = query(
        collection(db, 'clock_entries'),
        where('assignmentId', '==', assignmentId),
        orderBy('clockIn', 'desc')
      );

      const snapshot = await getDocs(entriesQuery);
      return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        clockInDate: docSnap.data().clockIn?.toDate(),
        clockOutDate: docSnap.data().clockOut?.toDate(),
        breakStartDate: docSnap.data().breakStart?.toDate(),
        breakEndDate: docSnap.data().breakEnd?.toDate(),
      }));
    } catch (error) {
      if (__DEV__) console.error('Get clock entries error:', error);
      return [];
    }
  };

  const getProjectNotes = async (assignmentId) => {
    try {
      await initializationPromiseExport;
      const db = getDb();
      const notesQuery = query(
        collection(db, 'project_notes'),
        where('assignmentId', '==', assignmentId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(notesQuery);
      const notes = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
      }));

      // Fetch replies from separate collection (employee can create, not update)
      const noteIds = notes.map(n => n.id);
      if (noteIds.length > 0) {
        const repliesByNote = {};
        for (let i = 0; i < noteIds.length; i += 10) {
          const batch = noteIds.slice(i, i + 10);
          const repliesQuery = query(
            collection(db, 'project_note_replies'),
            where('noteId', 'in', batch)
          );
          const repliesSnap = await getDocs(repliesQuery);
          repliesSnap.forEach(d => {
            const r = d.data();
            const nid = r.noteId;
            if (!repliesByNote[nid]) repliesByNote[nid] = [];
            repliesByNote[nid].push({
              ...r,
              createdAt: r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt,
            });
          });
        }
        notes.forEach(n => {
          n.replies = repliesByNote[n.id] || [];
        });
      }

      return notes;
    } catch (error) {
      if (__DEV__) console.error('Get project notes error:', error);
      return [];
    }
  };

  const getProjectPhotos = async (assignmentId) => {
    try {
      await initializationPromiseExport;
      const db = getDb();
      const photosQuery = query(
        collection(db, 'project_photos'),
        where('assignmentId', '==', assignmentId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(photosQuery);
      return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
      }));
    } catch (error) {
      if (__DEV__) console.error('Get project photos error:', error);
      return [];
    }
  };

  const addManualEntry = async (assignmentId, { clockIn, clockOut, totalBreakMinutes, notes }) => {
    if (!user) return { success: false, error: getT()('Nicht eingeloggt') };
    if (!clockIn || !clockOut) return { success: false, error: getT()('Start- und Endzeit erforderlich') };
    if (clockOut <= clockIn) return { success: false, error: getT()('Endzeit muss nach Startzeit liegen') };

    try {
      await initializationPromiseExport;
      const db = getDb();
      const diff = Math.round((clockOut - clockIn) / 60000);
      const breakMin = Math.max(0, parseInt(totalBreakMinutes, 10) || 0);
      const totalMinutes = Math.max(0, diff - breakMin);

      const entryRef = await addDoc(collection(db, 'clock_entries'), {
        assignmentId,
        userId: user.uid,
        userEmail: user.email,
        clockIn: Timestamp.fromDate(clockIn),
        clockOut: Timestamp.fromDate(clockOut),
        totalMinutes,
        totalBreakMinutes: breakMin,
        breakStart: null,
        breakEnd: null,
        isPaused: false,
        notes: notes || '',
        createdAt: serverTimestamp(),
      });

      const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
      if (assignmentDoc.exists()) {
        const ownerId = assignmentDoc.data().createdBy;
        if (ownerId && ownerId !== user.uid) {
          const ownerDoc = await getDoc(doc(db, 'users', ownerId));
          if (ownerDoc.exists() && ownerDoc.data().expoPushToken) {
            try {
              await sendPushNotification({
                to: ownerDoc.data().expoPushToken,
                title: getT()('⏰ Arbeitszeit eingetragen'),
                body: `${user.email} ${getT()('hat Arbeitszeit für')} "${assignmentDoc.data().projekt || getT()('Projekt')}" ${getT()('eingetragen.')}`,
                data: { assignmentId, userId: user.uid, type: 'manual_entry' },
              });
            } catch (pushErr) {
              if (__DEV__) console.warn('Push notification failed:', pushErr);
            }
          }
        }
      }

      return { success: true, entryId: entryRef.id };
    } catch (error) {
      if (__DEV__) console.error('Add manual entry error:', error);
      return { success: false, error: getT()('Fehler beim Speichern') };
    }
  };

  const updateClockEntry = async (entryId, { clockIn, clockOut }) => {
    if (!user) return { success: false, error: getT()('Nicht eingeloggt') };

    try {
      await initializationPromiseExport;
      const db = getDb();
      const updateData = {};
      if (clockIn instanceof Date) updateData.clockIn = Timestamp.fromDate(clockIn);
      if (clockOut instanceof Date) updateData.clockOut = Timestamp.fromDate(clockOut);

      if (clockIn || clockOut) {
        const entrySnap = await getDoc(doc(db, 'clock_entries', entryId));
        if (entrySnap.exists()) {
          const entry = entrySnap.data();
          const effectiveClockIn = clockIn || entry.clockIn?.toDate();
          const effectiveClockOut = clockOut || entry.clockOut?.toDate();
          if (effectiveClockIn && effectiveClockOut) {
            const diff = Math.round((effectiveClockOut - effectiveClockIn) / 60000);
            updateData.totalMinutes = Math.max(0, diff - (entry.totalBreakMinutes || 0));
          }
        }
      }

      await updateDoc(doc(db, 'clock_entries', entryId), updateData);
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Update clock entry error:', error);
      return { success: false, error: getT()('Fehler beim Aktualisieren') };
    }
  };

  const togglePinNote = async (noteId, isPinned) => {
    if (!user) return { success: false };
    try {
      await initializationPromiseExport;
      const db = getDb();
      await updateDoc(doc(db, 'project_notes', noteId), {
        isPinned: !!isPinned,
        pinnedBy: isPinned ? user.uid : null,
      });
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Toggle pin note error:', error);
      return { success: false };
    }
  };

  const togglePinPhoto = async (photoId, isPinned) => {
    if (!user) return { success: false };
    try {
      await initializationPromiseExport;
      const db = getDb();
      await updateDoc(doc(db, 'project_photos', photoId), {
        isPinned: !!isPinned,
        pinnedBy: isPinned ? user.uid : null,
      });
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Toggle pin photo error:', error);
      return { success: false };
    }
  };

  const toggleImportant = async (noteId, isImportant) => {
    if (!user) return { success: false };
    try {
      await initializationPromiseExport;
      const db = getDb();
      await updateDoc(doc(db, 'project_notes', noteId), {
        isImportant: !!isImportant,
      });
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Toggle important error:', error);
      return { success: false };
    }
  };

  const deleteNote = async (noteId) => {
    if (!user) return { success: false };
    try {
      await initializationPromiseExport;
      const db = getDb();
      await deleteDoc(doc(db, 'project_notes', noteId));
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Delete note error:', error);
      return { success: false };
    }
  };

  const deletePhoto = async (photoId) => {
    if (!user) return { success: false };
    try {
      await initializationPromiseExport;
      const db = getDb();
      await deleteDoc(doc(db, 'project_photos', photoId));
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Delete photo error:', error);
      return { success: false };
    }
  };

  const addNoteReply = async (noteId, text) => {
    if (!user || !text?.trim()) return { success: false };
    try {
      await initializationPromiseExport;
      const db = getDb();

      let displayName = user.email || getT()('Mitarbeiter');
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          displayName = userDoc.data().displayName || user.email || getT()('Mitarbeiter');
        }
      } catch (e) { if (__DEV__) console.warn('Error fetching user displayName:', e); }
      if (displayName === user.email || !displayName) {
        try {
          const companyDoc = await getDoc(doc(db, 'companies', user.uid));
          if (companyDoc.exists() && companyDoc.data().name) {
            displayName = companyDoc.data().name;
          }
        } catch (e) { if (__DEV__) console.warn('Error fetching company name:', e); }
      }

      // Look up note to get assignmentId for reply + notification
      let noteAssignmentId = null;
      try {
        const noteSnap = await getDoc(doc(db, 'project_notes', noteId));
        if (noteSnap.exists()) {
          noteAssignmentId = noteSnap.data().assignmentId;
        }
      } catch (e) {}

      const reply = {
        noteId,
        assignmentId: noteAssignmentId,
        userId: user.uid,
        userEmail: user.email,
        userName: displayName || user.email || getT()('Mitarbeiter'),
        text: text.trim(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'project_note_replies'), reply);

      // Push Notification an alle Projektmitglieder außer dem Antwortenden
      if (noteAssignmentId) {
        try {
          notifyProjectMembers(noteAssignmentId, user.uid,
            getT()('💬 Neue Antwort'),
            `${displayName}: ${text.trim().substring(0, 50)}`,
            { noteId, assignmentId: noteAssignmentId, type: 'note_reply' }
          );
        } catch (pushError) {
          if (__DEV__) console.warn('Push notification error in reply:', pushError);
        }
      }

      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Add note reply error:', error);
      return { success: false };
    }
  };

  const removeProjectMember = async (assignmentId, memberUid, projectName = getT()('dem Projekt')) => {
    try {
      await initializationPromiseExport;
      const db = getDb();

      const membersData = await getDoc(doc(db, 'project_members', assignmentId));
      if (membersData.exists()) {
        const members = membersData.data();
        if (!(memberUid in members)) return { success: false, error: getT()('Mitglied nicht gefunden') };
        if (Object.keys(members).length === 1) {
          await deleteDoc(doc(db, 'project_members', assignmentId));
        } else {
          await updateDoc(doc(db, 'project_members', assignmentId), {
            [memberUid]: deleteField(),
          });
        }
      }

      const memberUserDoc = await getDoc(doc(db, 'users', memberUid));
      const memberUserData = memberUserDoc.exists() ? memberUserDoc.data() : {};
      const memberProjects = memberUserData.linkedToProjects || [];
      await updateDoc(doc(db, 'users', memberUid), {
        linkedToProjects: memberProjects.filter(pid => pid !== assignmentId),
        removedFromProject: serverTimestamp(),
        removedFromProjectName: projectName,
      });
      if (memberProjects.length <= 1) {
        await updateDoc(doc(db, 'users', memberUid), {
          linkedToProject: null,
        });
      }

      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Remove project member error:', error);
      return { success: false, error: error.message };
    }
  };

  const value = {
    myProjects,
    loading,
    isEmployee,
    removedMessage,
    setRemovedMessage,
    loadProjectList: loadProjects,
    leaveProject,
    removeProjectMember,
    clockIn,
    clockOut,
    pauseClock,
    resumeClock,
    addNote,
    addPhoto,
    getProjectMembers,
    getClockEntries,
    getProjectNotes,
    getProjectPhotos,
    updateClockEntry,
    addManualEntry,
    togglePinNote,
    togglePinPhoto,
    toggleImportant,
    deleteNote,
    deletePhoto,
    addNoteReply,
    refreshProjects: loadProjects,
  };

  return (
    <ProjectAccessContext.Provider value={value}>
      {children}
    </ProjectAccessContext.Provider>
  );
};

export const useProjectAccess = () => useContext(ProjectAccessContext);