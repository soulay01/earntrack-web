import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, FlatList, Modal, Image, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
let ImagePicker = null;
try { ImagePicker = require('expo-image-picker'); } catch (e) {}
import SkeletonLoader from '../components/SkeletonLoader';
import { useProjectAccess } from '../contexts/ProjectAccessContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUnread } from '../contexts/UnreadContext';
import { useTranslation } from '../contexts/LanguageContext';
import { getDb, initializationPromiseExport } from '../firebaseConfig';
import { doc, getDoc, updateDoc, deleteDoc, setDoc, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { hapticsLight } from '../utils/animations';
let FileSystem = null;
try { FileSystem = require('expo-file-system/legacy'); } catch (e) {}
let Sharing = null;
try { Sharing = require('expo-sharing'); } catch (e) {}


const pad2 = (n) => String(n).padStart(2, '0');

const formatTime = (date) => {
  if (!date) return '';
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (date) => {
  if (!date) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDuration = (minutes) => {
  if (!minutes && minutes !== 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
};

const formatTimer = (ms) => {
  if (!ms || ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

const TILES_CONFIG = [
  { key: 'clock', icon: '🕐', titleKey: 'Zeiterfassung', descKey: 'Arbeitszeit eintragen', color: '#16A085' },
  { key: 'history', icon: '📋', titleKey: 'Meine Zeiten', descKey: 'Verlauf anzeigen', color: '#3B82F6' },
  { key: 'notes', icon: '📝', titleKey: 'Notizen', descKey: 'Erfassen & anzeigen', color: '#F59E0B' },
  { key: 'photos', icon: '📷', titleKey: 'Fotos', descKey: 'Aufnehmen & Galerie', color: '#8B5CF6' },
  { key: 'team', icon: '👥', titleKey: 'Team', descKey: 'Projektmitglieder', color: '#6B7280' },
  { key: 'leave', icon: '🚪', titleKey: 'Projekt verlassen', descKey: 'Zugriff entfernen', color: '#EF4444' },
];

export default function EmployeeProjectScreen({ route, navigation }) {
  const { myProjects, loading, isEmployee, removedMessage, setRemovedMessage, addManualEntry, addNote, addPhoto, getClockEntries, getProjectMembers, getProjectNotes, getProjectPhotos, leaveProject, addNoteReply, loadProjectList, clockIn, clockOut, pauseClock, resumeClock } = useProjectAccess();
  const { user } = useAuth();
  const { isDark = false } = useTheme();
  const insets = useSafeAreaInsets();
  const { assignmentUnreadCounts, refreshUnread } = useUnread();
  const { t } = useTranslation();

  const [selectedProject, setSelectedProject] = useState(null);
  const [clockEntries, setClockEntries] = useState([]);
  const [members, setMembers] = useState([]);
  const [notes, setNotes] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [clockInDate, setClockInDate] = useState(() => {
    const d = new Date(); d.setMinutes(0); d.setSeconds(0, 0); return d;
  });
  const [clockOutDate, setClockOutDate] = useState(() => {
    const d = new Date(); d.setMinutes(0); d.setSeconds(0, 0); d.setHours(d.getHours() + 1); return d;
  });
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [entryNote, setEntryNote] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [replyTexts, setReplyTexts] = useState({});
  const [expandedReplies, setExpandedReplies] = useState({});
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const [showClockModal, setShowClockModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerIntervalRef = useRef(null);
  const activeTimerRef = useRef(activeTimer);
  activeTimerRef.current = activeTimer;
  const breakStartRef = useRef(null);
  const [timerStopNote, setTimerStopNote] = useState('');

  useEffect(() => {
    if (myProjects.length > 0) {
      if (!selectedProject || !myProjects.find(p => p.id === selectedProject.id)) {
        setSelectedProject(myProjects[0]);
      }
    } else {
      setSelectedProject(null);
    }
  }, [myProjects]);

  useEffect(() => {
    if (removedMessage) {
      Alert.alert(t('Aus Projekt entfernt'), removedMessage);
      setRemovedMessage(null);
    }
  }, [removedMessage]);

  useFocusEffect(
    useCallback(() => {
      if (!project?.id) return;
      AsyncStorage.setItem(`@earntrack_activity_read_${project.id}`, new Date().toISOString()).then(() => {
        refreshUnread();
      });
    }, [project?.id, refreshUnread])
  );

  const bgColor = isDark ? '#080808' : '#f8fafc';
  const cardBg = isDark ? '#161618' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#0f172a';
  const subtextColor = isDark ? '#98989D' : '#64748b';
  const borderColor = isDark ? 'rgba(255,255,255,0.04)' : '#e5e7eb';
  const accentColor = '#16A085';

  const project = selectedProject;

  const loadProjectData = useCallback(async () => {
    if (!project) return;
    try {
      const results = await Promise.allSettled([
        getClockEntries(project.id),
        getProjectMembers(project.id),
        getProjectNotes(project.id),
        getProjectPhotos(project.id),
      ]);
      setClockEntries(results[0].status === 'fulfilled' ? results[0].value || [] : []);
      setMembers(results[1].status === 'fulfilled' ? results[1].value || [] : []);
      setNotes(results[2].status === 'fulfilled' ? results[2].value || [] : []);
      setPhotos(results[3].status === 'fulfilled' ? results[3].value || [] : []);
      await AsyncStorage.setItem(`@earntrack_activity_read_${project.id}`, new Date().toISOString());
      refreshUnread();
    } catch (error) {
      if (__DEV__) console.error('Load project data error:', error);
    }
  }, [project, user, refreshUnread]);

  const handleRedeemInviteCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setInviteError(t('Bitte gib einen gültigen Einladungscode ein'));
      return;
    }
    setInviteLoading(true);
    setInviteError('');
    try {
      await initializationPromiseExport;
      const db = getDb();
      let inviteRef = doc(db, 'project_invites', code);
      let inviteSnap = await getDoc(inviteRef);
      if (!inviteSnap.exists()) {
        const q = query(collection(db, 'project_invites'), where('code', '==', code));
        const snap = await getDocs(q);
        if (snap.empty) {
          setInviteError(t('Ungültiger oder bereits verwendeter Einladungscode'));
          setInviteLoading(false);
          return;
        }
        inviteSnap = snap.docs[0];
        inviteRef = doc(db, 'project_invites', inviteSnap.id);
      }
      const data = inviteSnap.data();
      if (data.usedBy) {
        setInviteError(t('Dieser Code wurde bereits verwendet'));
        setInviteLoading(false);
        return;
      }
      if (!data.assignmentId) {
        setInviteError(t('Dieser Code ist nicht mehr gültig'));
        setInviteLoading(false);
        return;
      }
      const assignmentRef = doc(db, 'assignments', data.assignmentId);
      const assignmentSnap = await getDoc(assignmentRef);
      if (!assignmentSnap.exists()) {
        setInviteError(t('Das zugehörige Projekt existiert nicht mehr'));
        setInviteLoading(false);
        return;
      }

      await updateDoc(inviteRef, { usedBy: user?.uid, usedAt: new Date().toISOString() });

      await setDoc(doc(db, 'project_members', data.assignmentId), {
        [user.uid]: {
          uid: user.uid,
          displayName: user.displayName || user.email || t('Mitarbeiter'),
          email: user.email || '',
          role: 'employee',
          joinedAt: new Date().toISOString(),
        }
      }, { merge: true });

      await updateDoc(doc(db, 'users', user.uid), {
        linkedToProjects: arrayUnion(data.assignmentId),
        role: 'employee',
      });

      setInviteCode('');
      Alert.alert(t('Erfolg'), t('Du wurdest dem Projekt "{name}" hinzugefügt!', { name: assignmentSnap.data().projekt || assignmentSnap.data().kunde || t('Projekt') }));
      await loadProjectList();
    } catch (e) {
      if (__DEV__) console.error('Invite code error:', e);
      setInviteError(t('Fehler beim Einlösen des Codes'));
    } finally {
      setInviteLoading(false);
    }
  };

  useEffect(() => {
    if (project) {
      loadProjectData();
    }
  }, [project, loadProjectData]);

  useEffect(() => {
    if (!project || !user) {
      setActiveTimer(null);
      return;
    }
    const activeEntry = clockEntries.find(e => e.userId === user.uid && !e.clockOut);
    if (activeEntry) {
      const clockInDate = activeEntry.clockIn?.toDate ? activeEntry.clockIn.toDate() : new Date(activeEntry.clockIn);
      const breakStartDate = activeEntry.breakStart?.toDate ? activeEntry.breakStart.toDate() : null;
      setActiveTimer({
        entryId: activeEntry.id,
        clockIn: clockInDate,
        isPaused: activeEntry.isPaused || false,
        breakStart: breakStartDate,
        totalBreakMinutes: activeEntry.totalBreakMinutes || 0,
      });
    }
  }, [clockEntries, user, project?.id]);

  useEffect(() => {
    if (!activeTimer) {
      setTimerElapsed(0);
      return;
    }

    const update = () => {
      const current = activeTimerRef.current;
      if (!current) return;
      const now = Date.now();
      const clockInTime = current.clockIn.getTime();
      const breakMs = (current.totalBreakMinutes || 0) * 60000;

      if (current.isPaused) {
        const pauseStart = current.breakStart?.getTime() || now;
        setTimerElapsed(Math.max(0, pauseStart - clockInTime - breakMs));
      } else {
        setTimerElapsed(Math.max(0, now - clockInTime - breakMs));
      }
    };

    update();
    const id = setInterval(update, 1000);
    timerIntervalRef.current = id;
    return () => {
      clearInterval(id);
      timerIntervalRef.current = null;
    };
  }, [activeTimer]);

  const adjustTime = (setter, field, delta) => {
    setter(prev => {
      if (!prev) return prev;
      const d = new Date(prev);
      if (field === 'hour') d.setHours(d.getHours() + delta);
      if (field === 'min') d.setMinutes(d.getMinutes() + delta);
      return d;
    });
  };

  const toggleDate = (setter) => {
    setter(prev => {
      if (!prev) return prev;
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const handleSaveManualEntry = async () => {
    if (!clockInDate || !clockOutDate) {
      Alert.alert(t('Fehler'), t('Bitte Start- und Endzeit wählen'));
      return;
    }
    if (clockOutDate <= clockInDate) {
      Alert.alert(t('Fehler'), t('Endzeit muss nach Startzeit liegen'));
      return;
    }
    setSavingEntry(true);
    try {
      const result = await addManualEntry(project.id, {
        clockIn: clockInDate,
        clockOut: clockOutDate,
        totalBreakMinutes: parseInt(breakMinutes) || 0,
        notes: entryNote || '',
      });
      if (result.success) {
        Alert.alert(t('Erfolg'), t('Arbeitszeit wurde gespeichert'));
        setEntryNote('');
        const d = new Date(); d.setMinutes(0); d.setSeconds(0, 0);
        setClockInDate(d);
        const d2 = new Date(d); d2.setHours(d2.getHours() + 1);
        setClockOutDate(d2);
        setBreakMinutes('0');
        loadProjectData();
      } else {
        Alert.alert(t('Fehler'), result.error || t('Speichern fehlgeschlagen'));
      }
    } catch (e) {
      if (__DEV__) console.error('Save manual entry error:', e);
      Alert.alert(t('Fehler'), t('Speichern fehlgeschlagen'));
    } finally {
      setSavingEntry(false);
    }
  };

  const handleStartTimer = async () => {
    try {
      const result = await clockIn(project.id);
      if (result.success) {
        setActiveTimer({
          entryId: result.entryId,
          clockIn: new Date(),
          isPaused: false,
          breakStart: null,
          totalBreakMinutes: 0,
        });
      } else {
        Alert.alert(t('Fehler'), result.error || t('Timer konnte nicht gestartet werden'));
      }
    } catch (e) {
      if (__DEV__) console.error('Start timer error:', e);
      Alert.alert(t('Fehler'), t('Timer konnte nicht gestartet werden'));
    }
  };

  const handlePauseTimer = async () => {
    const current = activeTimerRef.current;
    if (current) {
      const now = Date.now();
      const clockInTime = current.clockIn.getTime();
      const breakMs = (current.totalBreakMinutes || 0) * 60000;
      setTimerElapsed(Math.max(0, now - clockInTime - breakMs));
    }
    breakStartRef.current = new Date();
    setActiveTimer(prev => ({
      ...prev,
      isPaused: true,
    }));
    try {
      const result = await pauseClock(project.id);
      if (!result.success) {
        Alert.alert(t('Fehler'), result.error || t('Pausieren fehlgeschlagen'));
      }
    } catch (e) {
      if (__DEV__) console.error('Pause timer error:', e);
    }
  };

  const handleResumeTimer = async () => {
    const breakStartTime = breakStartRef.current;
    breakStartRef.current = null;
    if (breakStartTime) {
      const now = new Date();
      const breakMinutes = Math.round((now - breakStartTime) / 60000);
      setActiveTimer(prev => ({
        ...prev,
        isPaused: false,
        breakStart: null,
        totalBreakMinutes: (prev.totalBreakMinutes || 0) + breakMinutes,
      }));
      const current = activeTimerRef.current;
      if (current) {
        const clockInTime = current.clockIn.getTime();
        const totalBreakMs = ((current.totalBreakMinutes || 0) + breakMinutes) * 60000;
        setTimerElapsed(Math.max(0, now.getTime() - clockInTime - totalBreakMs));
      }
    } else {
      setActiveTimer(prev => ({
        ...prev,
        isPaused: false,
        breakStart: null,
      }));
    }
    try {
      const result = await resumeClock(project.id);
      if (!result.success) {
        Alert.alert(t('Fehler'), result.error || t('Fortsetzen fehlgeschlagen'));
      }
    } catch (e) {
      if (__DEV__) console.error('Resume timer error:', e);
    }
  };

  const handleStopTimer = async () => {
    try {
      const result = await clockOut(project.id, timerStopNote || '');
      if (result.success) {
        setActiveTimer(null);
        setTimerElapsed(0);
        setTimerStopNote('');
        Alert.alert(t('Erfolg'), t('Arbeitszeit wurde gespeichert'));
        setShowClockModal(false);
      } else {
        Alert.alert(t('Fehler'), result.error || t('Stoppen fehlgeschlagen'));
      }
    } catch (e) {
      if (__DEV__) console.error('Stop timer error:', e);
      Alert.alert(t('Fehler'), t('Stoppen fehlgeschlagen'));
    }
  };

  const handleLeaveProject = async () => {
    Alert.alert(
      t('Projekt verlassen'),
      t('Möchtest du dieses Projekt wirklich verlassen? Du verlierst den Zugriff auf alle Daten.'),
      [
        { text: t('Abbrechen'), style: 'cancel' },
        {
          text: t('Verlassen'),
          style: 'destructive',
          onPress: async () => {
            const result = await leaveProject(project.id);
            if (result?.success) {
              if (myProjects.length <= 1) {
                Alert.alert(t('Erfolg'), t('Du hast das Projekt verlassen.'));
              }
            } else {
              Alert.alert(t('Fehler'), t('Projekt konnte nicht verlassen werden. Bitte versuche es erneut.'));
            }
          },
        },
      ]
    );
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    try {
      const result = await addNote(project.id, newNoteText.trim());
      if (result.success) {
        setNewNoteText('');
        loadProjectData();
      } else {
        Alert.alert(t('Fehler'), t('Notiz konnte nicht gespeichert werden'));
      }
    } catch (e) {
      if (__DEV__) console.error('Add note error:', e);
      Alert.alert(t('Fehler'), t('Notiz konnte nicht gespeichert werden'));
    }
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker?.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert(t('Berechtigung'), t('Bitte erteile Zugriff auf deine Fotos'));
        return;
      }

      const result = await ImagePicker?.launchImageLibraryAsync({
        mediaTypes: ImagePicker?.MediaTypeOptions?.Images,
        quality: 0.7,
        allowsEditing: true,
      });

      if (!result?.canceled && result?.assets[0]) {
        await addPhoto(project.id, result.assets[0].uri);
        loadProjectData();
      }
    } catch (e) {
      if (__DEV__) console.error('Pick image error:', e);
      Alert.alert(t('Fehler'), t('Foto konnte nicht geladen werden'));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker?.requestCameraPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert(t('Berechtigung'), t('Bitte erteile Zugriff auf die Kamera'));
        return;
      }

      const result = await ImagePicker?.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
      });

      if (!result?.canceled && result?.assets[0]) {
        await addPhoto(project.id, result.assets[0].uri);
        loadProjectData();
      }
    } catch (e) {
      if (__DEV__) console.error('Take photo error:', e);
      Alert.alert(t('Fehler'), t('Foto konnte nicht aufgenommen werden'));
    }
  };

  const myClockEntries = clockEntries
    .filter(e => e.userId === user?.uid)
    .sort((a, b) => {
      const dateA = a.clockInDate?.toDate?.() || new Date(a.clockInDate);
      const dateB = b.clockInDate?.toDate?.() || new Date(b.clockInDate);
      return dateB - dateA;
    });

  const pinnedNotes = notes.filter(n => n.isPinned);
  const pinnedPhotos = photos.filter(p => p.isPinned);
  const myNotes = notes.filter(n => n.userId === user?.uid);
  const myPhotos = photos.filter(p => p.userId === user?.uid);

  const onRefresh = useCallback(async () => {
    hapticsLight();
    setRefreshing(true);
    await Promise.allSettled([loadProjectData(), loadProjectList()]);
    setRefreshing(false);
  }, [loadProjectData, loadProjectList]);

  const handleReplyToNote = async (noteId) => {
    const text = replyTexts[noteId];
    if (!text?.trim()) return;
    const result = await addNoteReply(noteId, text.trim());
    if (result?.success) {
      setReplyTexts(prev => ({ ...prev, [noteId]: '' }));
      setExpandedReplies(prev => ({ ...prev, [noteId]: true }));
      loadProjectData();
    } else {
      Alert.alert(t('Fehler'), t('Antwort konnte nicht gesendet werden. Bitte versuche es erneut.'));
    }
  };

  const handleTilePress = (key) => {
    switch (key) {
      case 'clock': setShowClockModal(true); break;
      case 'history': setShowHistoryModal(true); break;
      case 'notes': setShowNotesModal(true); break;
      case 'photos': setShowPhotosModal(true); break;
      case 'team': setShowMembers(true); break;
      case 'leave': handleLeaveProject(); break;
    }
  };

  const handleDownloadImage = async (uri) => {
    if (!Sharing || !FileSystem) {
      Alert.alert(t('Fehler'), t('Download ist auf diesem Gerät nicht verfügbar'));
      return;
    }
    try {
      let localUri;
      let ext;
      if (uri.startsWith('data:')) {
        const matches = uri.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) throw new Error('Invalid data URI');
        ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        localUri = FileSystem.cacheDirectory + `photo_${Date.now()}.${ext}`;
        await FileSystem.writeAsStringAsync(localUri, matches[2], { encoding: 'base64' });
      } else {
        ext = (uri.split('.').pop() || 'jpg').split('?')[0];
        localUri = FileSystem.cacheDirectory + `photo_${Date.now()}.${ext}`;
        await FileSystem.downloadAsync(uri, localUri);
      }
      await Sharing.shareAsync(localUri, {
        mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        dialogTitle: t('Foto speichern'),
      });
    } catch (e) {
      if (__DEV__) console.error('Download image error:', e);
      Alert.alert(t('Fehler'), t('Foto konnte nicht heruntergeladen werden'));
    }
  };

  const renderTile = (tile) => {
    const isLeave = tile.key === 'leave';
    return (
      <TouchableOpacity
        key={tile.key}
        style={[styles.tileCard, { backgroundColor: cardBg, borderColor }]}
        onPress={() => handleTilePress(tile.key)}
        activeOpacity={0.7}
      >
        <View style={[styles.tileIconCircle, { backgroundColor: isLeave ? '#FEE2E2' : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9') }]}>
          <Text style={styles.tileIcon}>{tile.icon}</Text>
        </View>
        <Text style={[styles.tileTitle, { color: textColor }]}>{t(tile.titleKey)}</Text>
        <Text style={[styles.tileDesc, { color: subtextColor }]}>{t(tile.descKey)}</Text>
      </TouchableOpacity>
    );
  };

  const renderClockTimePicker = (label, date, setter, showDate = true) => (
    <View style={[styles.modalTimeRow, { borderBottomColor: borderColor }]}>
      <Text style={[styles.modalTimeLabel, { color: textColor }]}>{label}</Text>
      <View style={styles.modalTimeControls}>
        {showDate && (
          <Text style={[styles.modalDateText, { color: subtextColor }]}>
            {pad2(date.getDate())}.{pad2(date.getMonth()+1)}.{date.getFullYear()}
          </Text>
        )}
        <View style={styles.modalHmRow}>
          <TouchableOpacity style={[styles.modalAdjBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }]} onPress={() => toggleDate(setter)}>
            <Text style={[styles.modalAdjBtnText, { color: textColor }]}>◀</Text>
          </TouchableOpacity>
          <View style={styles.modalHmGroup}>
            <TouchableOpacity onPress={() => adjustTime(setter, 'hour', 1)} style={styles.modalArrowBtn}>
              <Text style={[styles.modalArrowText, { color: subtextColor }]}>▲</Text>
            </TouchableOpacity>
            <Text style={[styles.modalHmText, { color: textColor }]}>{pad2(date.getHours())}</Text>
            <TouchableOpacity onPress={() => adjustTime(setter, 'hour', -1)} style={styles.modalArrowBtn}>
              <Text style={[styles.modalArrowText, { color: subtextColor }]}>▼</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.modalHmSep, { color: textColor }]}>:</Text>
          <View style={styles.modalHmGroup}>
            <TouchableOpacity onPress={() => adjustTime(setter, 'min', 1)} style={styles.modalArrowBtn}>
              <Text style={[styles.modalArrowText, { color: subtextColor }]}>▲</Text>
            </TouchableOpacity>
            <Text style={[styles.modalHmText, { color: textColor }]}>{pad2(date.getMinutes())}</Text>
            <TouchableOpacity onPress={() => adjustTime(setter, 'min', -1)} style={styles.modalArrowBtn}>
              <Text style={[styles.modalArrowText, { color: subtextColor }]}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: bgColor }]}>
        <SkeletonLoader variant="employee-project" />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>{t('Projekt')}</Text>
        </View>
        <ScrollView 
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
        >
          <Text style={{ fontSize: 64, marginBottom: 16 }}>📋</Text>
          <Text style={[styles.emptyTitle, { color: textColor }]}>{t('Kein Projekt zugewiesen')}</Text>
          <Text style={[styles.emptyDesc, { color: subtextColor }]}>
            {t('Du wurdest noch keinem Projekt zugeordnet.')}
          </Text>

          <View style={[styles.inviteCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.inviteLabel, { color: textColor }]}>{t('Einladungscode eingeben')}</Text>
            <TextInput
              style={[styles.inviteInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', color: textColor, borderColor }]}
              placeholder="XXXXXX"
              placeholderTextColor={subtextColor}
              value={inviteCode}
              onChangeText={(t) => { setInviteCode(t); setInviteError(''); }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
            />
            {inviteError ? (
              <Text style={styles.inviteError}>{inviteError}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.inviteBtn, inviteLoading && { opacity: 0.6 }]}
              onPress={handleRedeemInviteCode}
              disabled={inviteLoading}
            >
              {inviteLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.inviteBtnText}>{t('Beitreten')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity 
          style={styles.headerContent} 
          onPress={() => myProjects.length > 1 && setShowProjectPicker(true)}
          activeOpacity={myProjects.length > 1 ? 0.7 : 1}
        >
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
              {project.projekt || project.kunde || t('Projekt')}
            </Text>
            {assignmentUnreadCounts[project?.id] > 0 && (
              <View style={styles.headerUnreadDot}>
                <Text style={styles.headerUnreadDotText}>
                  {assignmentUnreadCounts[project.id] > 99 ? '99+' : assignmentUnreadCounts[project.id]}
                </Text>
              </View>
            )}
            {myProjects.length > 1 && (
              <Text style={[styles.headerDropdownIcon, { color: subtextColor }]}>▼</Text>
            )}
          </View>
          <Text style={[styles.headerSubtitle, { color: subtextColor }]}>
            {project.kunde}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setShowMembers(true)} 
          style={[styles.membersBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }]}
        >
          <Text style={{ fontSize: 20 }}>👥</Text>
          <Text style={[styles.membersCount, { color: textColor }]}>{members.length}</Text>
        </TouchableOpacity>
      </View>

      {activeTimer && (
        <TouchableOpacity
          style={[styles.timerActiveBar, { backgroundColor: accentColor }]}
          onPress={() => setShowClockModal(true)}
          activeOpacity={0.9}
        >
          <Text style={styles.timerActiveBarText}>
            ⏱️ {t('Timer läuft')}: {formatTimer(timerElapsed)}
          </Text>
          <Text style={styles.timerActiveBarAction}>{t('Verwalten')} ›</Text>
        </TouchableOpacity>
      )}

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
      >
        {(pinnedNotes.length > 0 || pinnedPhotos.length > 0) && (
            <View style={[styles.announceCard, { backgroundColor: cardBg, borderColor, borderLeftColor: accentColor }]}>
              <View style={styles.announceHeader}>
                <Text style={[styles.announceIcon]}>📌</Text>
                <Text style={[styles.announceTitle, { color: textColor }]}>{t('Ankündigungen')}</Text>
                {(pinnedNotes.length + pinnedPhotos.length) > 1 && (
                  <View style={styles.announceBadge}>
                    <Text style={styles.announceBadgeText}>{pinnedNotes.length + pinnedPhotos.length}</Text>
                  </View>
                )}
              </View>
              {pinnedNotes.slice(0, showAllAnnouncements ? pinnedNotes.length : 2).map((note) => (
                <View key={note.id} style={[styles.announceItem, { borderLeftColor: note.isImportant ? '#f59e0b' : accentColor }]}>
                  <View style={styles.announceItemRow}>
                    {note.isImportant && <Text style={{ color: '#f59e0b', marginRight: 4 }}>❗</Text>}
                    <Text style={[styles.announceItemText, { color: textColor }]} numberOfLines={showAllAnnouncements ? undefined : 2}>{note.note}</Text>
                  </View>
                  <Text style={[styles.announceItemMeta, { color: subtextColor }]}>
                    {formatDate(note.createdAt)} — {note.userName}
                  </Text>
                  <View style={styles.announceReplyRow}>
                    <TextInput
                      style={[styles.announceReplyInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', color: textColor, borderColor }]}
                      placeholder={t('Antworten...')}
                      placeholderTextColor={subtextColor}
                      value={replyTexts[note.id] || ''}
                      onChangeText={(t) => setReplyTexts(prev => ({ ...prev, [note.id]: t }))}
                    />
                    <TouchableOpacity
                      style={[styles.announceReplyBtn, { backgroundColor: accentColor }]}
                      onPress={() => handleReplyToNote(note.id)}
                      disabled={!replyTexts[note.id]?.trim()}
                    >
                      <Text style={styles.announceReplyBtnText}>↩</Text>
                    </TouchableOpacity>
                  </View>
                  {(note.replies && note.replies.length > 0) && (
                    <TouchableOpacity
                      onPress={() => setExpandedReplies(prev => ({ ...prev, [note.id]: !prev[note.id] }))}
                      style={styles.announceRepliesToggle}
                    >
                      <Text style={[styles.announceRepliesToggleText, { color: accentColor }]}>
                        💬 {note.replies.length} {note.replies.length === 1 ? t('Antwort') : t('Antworten')} {expandedReplies[note.id] ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {expandedReplies[note.id] && note.replies?.map((reply, idx) => (
                    <View key={idx} style={[styles.announceReplyItem, { borderLeftColor: accentColor }]}>
                      <Text style={[styles.announceReplyName, { color: accentColor }]}>{reply.userName}</Text>
                      <Text style={[styles.announceReplyText, { color: textColor }]}>{reply.text}</Text>
                      <Text style={[styles.announceReplyTime, { color: subtextColor }]}>
                        {reply.createdAt ? new Date(reply.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
              {pinnedNotes.length > 2 && (
                <TouchableOpacity onPress={() => setShowAllAnnouncements(prev => !prev)} style={styles.announceMoreBtn}>
                  <Text style={[styles.announceMoreBtnText, { color: accentColor }]}>
                    {showAllAnnouncements ? t('Weniger anzeigen') : `+${pinnedNotes.length - 2} ${t('weitere')}`}
                  </Text>
                </TouchableOpacity>
              )}
              {pinnedPhotos.length > 0 && (
                <View style={styles.announcePhotosRow}>
                  {pinnedPhotos.slice(0, 4).map((photo) => (
                    <TouchableOpacity key={photo.id} onPress={() => { setSelectedImage(photo.photoUri); if (!showPhotosModal) setShowPhotosModal(true); }}>
                      <Image source={{ uri: photo.photoUri }} style={styles.announcePhotoThumb} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.tileGrid}>
            {TILES_CONFIG.map(renderTile)}
          </View>
          <View style={{ height: 80 }} />
        </ScrollView>

      <Modal visible={showClockModal} animationType="slide" onRequestClose={() => setShowClockModal(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: bgColor }]} edges={['bottom', 'left', 'right']}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>{t('🕐 Zeiterfassung')}</Text>
            <TouchableOpacity onPress={() => setShowClockModal(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: accentColor, fontSize: 24, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {activeTimer ? (
              <View style={[styles.timerSection, { backgroundColor: isDark ? '#1C2E2A' : '#e8f5f0', borderColor: accentColor }]}>
                <Text style={[styles.timerDisplay, { color: textColor }]}>
                  ⏱️ {formatTimer(timerElapsed)}
                </Text>
                <Text style={[styles.timerStatus, { color: activeTimer.isPaused ? '#F59E0B' : accentColor }]}>
                  {activeTimer.isPaused ? t('⏸ Pausiert') : t('▶️ Läuft')}
                </Text>
                <View style={styles.timerActions}>
                  {activeTimer.isPaused ? (
                    <TouchableOpacity style={[styles.timerBtn, { backgroundColor: '#F59E0B' }]} onPress={handleResumeTimer} activeOpacity={0.8}>
                      <Text style={styles.timerBtnText}>{t('Fortsetzen')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.timerBtn, { backgroundColor: '#F59E0B' }]} onPress={handlePauseTimer} activeOpacity={0.8}>
                      <Text style={styles.timerBtnText}>{t('Pausieren')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.timerBtn, { backgroundColor: '#EF4444' }]} onPress={handleStopTimer} activeOpacity={0.8}>
                    <Text style={styles.timerBtnText}>{t('Stoppen')}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.timerNoteInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff', color: textColor, borderColor }]}
                  value={timerStopNote}
                  onChangeText={setTimerStopNote}
                  placeholder={t('Notiz (optional)...')}
                  placeholderTextColor={subtextColor}
                />
              </View>
            ) : (
              <TouchableOpacity style={[styles.timerStartBtn, { backgroundColor: accentColor }]} onPress={handleStartTimer} activeOpacity={0.8}>
                <Text style={styles.timerStartBtnText}>{t('▶ Timer starten')}</Text>
              </TouchableOpacity>
            )}

            {!activeTimer && (
              <>
                <View style={[styles.timerDivider, { borderBottomColor: borderColor }]} />
                <Text style={[styles.timerManualTitle, { color: subtextColor }]}>{t('ODER manuelle Eingabe')}</Text>

                {renderClockTimePicker(t('Beginn'), clockInDate, setClockInDate)}
                {renderClockTimePicker(t('Ende'), clockOutDate, setClockOutDate)}

                <View style={[styles.modalTimeRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.modalTimeLabel, { color: textColor }]}>{t('Pause')}</Text>
                  <View style={styles.modalBreakRow}>
                    <TextInput
                      style={[styles.modalBreakInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', color: textColor, borderColor }]}
                      value={breakMinutes}
                      onChangeText={setBreakMinutes}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={subtextColor}
                    />
                    <Text style={[styles.modalBreakUnit, { color: subtextColor }]}>{t('Minuten')}</Text>
                  </View>
                </View>

                <View style={[styles.modalTimeRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.modalTimeLabel, { color: textColor }]}>{t('Notiz')}</Text>
                  <TextInput
                    style={[styles.modalEntryNoteInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', color: textColor, borderColor }]}
                    value={entryNote}
                    onChangeText={setEntryNote}
                    placeholder={t('Optionale Notiz...')}
                    placeholderTextColor={subtextColor}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: accentColor, opacity: savingEntry ? 0.6 : 1 }]}
                  onPress={async () => {
                    await handleSaveManualEntry();
                    if (!savingEntry) setShowClockModal(false);
                  }}
                  disabled={savingEntry}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalSaveBtnText}>{savingEntry ? t('Wird gespeichert...') : t('Speichern')}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showHistoryModal} animationType="slide" onRequestClose={() => setShowHistoryModal(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: bgColor }]} edges={['bottom', 'left', 'right']}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>{t('📋 Meine Zeiten')}</Text>
            <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: accentColor, fontSize: 24, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={myClockEntries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modalList}
            renderItem={({ item }) => (
              <View style={[styles.modalHistoryItem, { borderBottomColor: borderColor }]}>
                <View style={styles.modalHistoryInfo}>
                  <Text style={[styles.modalHistoryDate, { color: textColor }]}>
                    {formatDate(item.clockInDate)}
                  </Text>
                  <Text style={[styles.modalHistoryTime, { color: subtextColor }]}>
                    {formatTime(item.clockInDate)} - {item.clockOutDate ? formatTime(item.clockOutDate) : t('offen')}
                  </Text>
                </View>
                <View style={styles.modalHistoryDuration}>
                  <Text style={[styles.modalDurationText, { color: accentColor }]}>
                    {formatDuration(item.totalMinutes)}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.modalEmptyState}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>⏰</Text>
                <Text style={[styles.modalEmptyText, { color: subtextColor }]}>
                  {t('Noch keine Zeiten erfasst')}
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={showNotesModal} animationType="slide" onRequestClose={() => setShowNotesModal(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: bgColor }]} edges={['bottom', 'left', 'right']}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>{t('📝 Notizen')}</Text>
            <TouchableOpacity onPress={() => setShowNotesModal(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: accentColor, fontSize: 24, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <FlatList
              data={myNotes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalList}
              ListHeaderComponent={
                <View style={[styles.modalNoteInputCard, { backgroundColor: cardBg, borderColor }]}>
                  <TextInput
                    style={[styles.modalNoteInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', color: textColor, borderColor }]}
                    placeholder={t('Notiz eingeben...')}
                    placeholderTextColor={subtextColor}
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.modalAddNoteBtn, { backgroundColor: accentColor }]}
                    onPress={() => {
                      handleAddNote();
                    }}
                    disabled={!newNoteText.trim()}
                  >
                    <Text style={styles.modalAddNoteBtnText}>{t('Hinzufügen')}</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.modalNoteItem, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.modalNoteText, { color: textColor }]}>{item.note}</Text>
                  <Text style={[styles.modalNoteMeta, { color: subtextColor }]}>
                    {formatDate(item.createdAt)}
                  </Text>
                  {item.replies && item.replies.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setExpandedReplies(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      style={styles.announceRepliesToggle}
                    >
                      <Text style={[styles.announceRepliesToggleText, { color: accentColor }]}>
                        💬 {item.replies.length} {item.replies.length === 1 ? t('Antwort') : t('Antworten')} {expandedReplies[item.id] ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {expandedReplies[item.id] && item.replies?.map((reply, idx) => (
                    <View key={idx} style={[styles.announceReplyItem, { borderLeftColor: accentColor }]}>
                      <Text style={[styles.announceReplyName, { color: accentColor }]}>{reply.userName}</Text>
                      <Text style={[styles.announceReplyText, { color: textColor }]}>{reply.text}</Text>
                      <Text style={[styles.announceReplyTime, { color: subtextColor }]}>
                        {reply.createdAt ? new Date(reply.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmptyState}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>📝</Text>
                  <Text style={[styles.modalEmptyText, { color: subtextColor }]}>
                    {t('Noch keine Notizen')}
                  </Text>
                </View>
              }
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showPhotosModal} animationType="slide" onRequestClose={() => setShowPhotosModal(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: bgColor }]} edges={['bottom', 'left', 'right']}>
          {selectedImage ? (
            <View style={styles.photoPreviewContainer}>
              <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
                <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.photoPreviewBackBtn}>
                  <Text style={[styles.photoPreviewBackBtnText, { color: accentColor }]}>← {t('Zurück')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDownloadImage(selectedImage)} style={styles.photoPreviewDownloadBtn}>
                  <Text style={[styles.photoPreviewBackBtnText, { color: accentColor }]}>{t('Speichern')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.photoPreviewImageWrap}>
                <Image source={{ uri: selectedImage }} style={styles.photoPreviewImage} resizeMode="contain" />
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
                <Text style={[styles.modalTitle, { color: textColor }]}>{t('📷 Fotos')}</Text>
                <TouchableOpacity onPress={() => setShowPhotosModal(false)} style={styles.modalCloseBtn}>
                  <Text style={{ color: accentColor, fontSize: 24, fontWeight: '600' }}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={photos}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.modalList}
                numColumns={3}
                columnWrapperStyle={styles.modalPhotoColumnWrapper}
                ListHeaderComponent={
                  <View style={[styles.modalPhotoActions, { backgroundColor: cardBg, borderColor }]}>
                    <TouchableOpacity
                      style={[styles.modalPhotoBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }]}
                      onPress={() => { handleTakePhoto(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 28 }}>📷</Text>
                      <Text style={[styles.modalPhotoBtnText, { color: textColor }]}>{t('Kamera')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalPhotoBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }]}
                      onPress={() => { handlePickImage(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 28 }}>🖼️</Text>
                      <Text style={[styles.modalPhotoBtnText, { color: textColor }]}>{t('Galerie')}</Text>
                    </TouchableOpacity>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalPhotoThumb} onPress={() => setSelectedImage(item.photoUri)}>
                    <Image source={{ uri: item.photoUri }} style={styles.modalPhotoThumbImg} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmptyState}>
                    <Text style={{ fontSize: 48, marginBottom: 12 }}>🖼️</Text>
                    <Text style={[styles.modalEmptyText, { color: subtextColor }]}>
                      {t('Noch keine Fotos')}
                    </Text>
                  </View>
                }
              />
            </>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={showProjectPicker} animationType="slide" onRequestClose={() => setShowProjectPicker(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: bgColor }]} edges={['bottom', 'left', 'right']}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>{t('📁 Projekt wechseln')}</Text>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: accentColor, fontSize: 24, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={myProjects}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modalList}
            renderItem={({ item }) => {
              const isActive = selectedProject?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.projectPickerItem, { borderBottomColor: borderColor, backgroundColor: isActive ? (isDark ? '#1C2E2A' : '#e8f5f0') : 'transparent' }]}
                  onPress={() => {
                    setSelectedProject(item);
                    setShowProjectPicker(false);
                  }}
                >
                  <View style={styles.projectPickerInfo}>
                    <View style={styles.projectPickerNameRow}>
                      <Text style={[styles.projectPickerName, { color: textColor, fontWeight: isActive ? '700' : '500' }]}>
                        {item.projekt || item.kunde || t('Projekt')}
                      </Text>
                      {assignmentUnreadCounts[item.id] > 0 && (
                        <View style={styles.pickerUnreadBadge}>
                          <Text style={styles.pickerUnreadBadgeText}>
                            {assignmentUnreadCounts[item.id] > 99 ? '99+' : assignmentUnreadCounts[item.id]}
                          </Text>
                        </View>
                      )}
                    </View>
                    {item.kunde ? (
                      <Text style={[styles.projectPickerKunde, { color: subtextColor }]}>{item.kunde}</Text>
                    ) : null}
                  </View>
                  {isActive && (
                    <Text style={{ color: accentColor, fontSize: 18 }}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.modalEmptyState}>
                <Text style={{ color: subtextColor, textAlign: 'center', paddingVertical: 40 }}>
                  {t('Keine Projekte verfügbar')}
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={showMembers} animationType="slide" onRequestClose={() => setShowMembers(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: bgColor }]} edges={['bottom', 'left', 'right']}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>{t('👥 Projektmitglieder')}</Text>
            <TouchableOpacity onPress={() => setShowMembers(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: accentColor, fontSize: 24, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={members}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={styles.modalList}
            renderItem={({ item }) => (
              <View style={[styles.memberItem, { borderBottomColor: borderColor }]}>
                <View style={[styles.memberAvatar, { backgroundColor: accentColor }]}>
                  <Text style={styles.memberAvatarText}>
                    {(item.displayName || item.email || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: textColor }]}>
                    {item.displayName || item.email}
                  </Text>
                  <Text style={[styles.memberRole, { color: subtextColor }]}>
                    {item.role === 'owner' ? t('👑 Inhaber') : t('👷 Mitarbeiter')}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.modalEmptyState}>
                <Text style={{ color: subtextColor, textAlign: 'center', paddingVertical: 40 }}>
                  {t('Keine Mitglieder gefunden')}
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {!!selectedImage && !showPhotosModal && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity activeOpacity={1} style={styles.imageOverlayBg} onPress={() => setSelectedImage(null)}>
            <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />
          </TouchableOpacity>
          <View style={styles.imageOverlayBottomBar}>
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.imageModalIconBtn}>
              <Text style={styles.imageModalIconBtnText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDownloadImage(selectedImage)} style={styles.imageModalIconBtn}>
              <Text style={styles.imageModalIconBtnText}>⬇</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDropdownIcon: { fontSize: 10, marginTop: 4 },
  headerUnreadDot: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerUnreadDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  membersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  membersCount: { fontSize: 14, fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  inviteCard: {
    width: '100%',
    marginTop: 32,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  inviteLabel: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  inviteInput: {
    width: '100%',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  inviteError: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  inviteBtn: {
    backgroundColor: '#16A085',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  inviteBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  announceCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  announceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  announceIcon: { fontSize: 16 },
  announceTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  announceBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  announceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  announceItem: { paddingVertical: 10, borderLeftWidth: 2, paddingLeft: 10, marginBottom: 8 },
  announceItemRow: { flexDirection: 'row', alignItems: 'flex-start' },
  announceItemText: { fontSize: 14, fontWeight: '600', lineHeight: 20, flex: 1 },
  announceItemMeta: { fontSize: 11, marginTop: 4 },
  announceReplyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  announceReplyInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    minHeight: 36,
  },
  announceReplyBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  announceReplyBtnText: { color: '#fff', fontSize: 16 },
  announceRepliesToggle: { paddingTop: 8 },
  announceRepliesToggleText: { fontSize: 13, fontWeight: '600' },
  announceReplyItem: { paddingLeft: 12, borderLeftWidth: 2, marginTop: 8, marginLeft: 8 },
  announceReplyName: { fontSize: 12, fontWeight: '700' },
  announceReplyText: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  announceReplyTime: { fontSize: 10, marginTop: 2 },
  announceMoreBtn: { paddingVertical: 8, alignItems: 'center' },
  announceMoreBtnText: { fontSize: 13, fontWeight: '600' },
  announcePhotosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  announcePhotoThumb: { width: 60, height: 60, borderRadius: 8 },

  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tileCard: {
    width: '48%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 130,
    justifyContent: 'center',
  },
  tileIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  tileIcon: { fontSize: 24 },
  tileTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  tileDesc: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 4, opacity: 0.7 },

  modalSafeArea: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalCloseBtn: { padding: 12, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: 20, paddingBottom: 40 },
  modalList: { padding: 16, paddingBottom: 40 },
  modalEmptyState: { alignItems: 'center', paddingVertical: 60 },
  modalEmptyText: { fontSize: 15, textAlign: 'center' },

  modalTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  modalTimeLabel: { fontSize: 15, fontWeight: '600', width: 70 },
  modalTimeControls: { flex: 1, alignItems: 'flex-end' },
  modalDateText: { fontSize: 13, marginBottom: 4 },
  modalHmRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modalHmGroup: { alignItems: 'center' },
  modalArrowBtn: { padding: 2 },
  modalArrowText: { fontSize: 10 },
  modalHmText: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'center' },
  modalHmSep: { fontSize: 22, fontWeight: '700', marginHorizontal: 2 },
  modalAdjBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 8 },
  modalAdjBtnText: { fontSize: 13, fontWeight: '600' },
  modalBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalBreakInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, fontSize: 16, fontWeight: '700', borderWidth: 1, width: 80, textAlign: 'center' },
  modalBreakUnit: { fontSize: 14 },
  modalEntryNoteInput: { flex: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, borderWidth: 1, minHeight: 36, textAlignVertical: 'top', marginLeft: 8 },
  modalSaveBtn: { marginTop: 24, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  modalSaveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  modalHistoryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5 },
  modalHistoryInfo: { flex: 1 },
  modalHistoryDate: { fontWeight: '600', fontSize: 15 },
  modalHistoryTime: { fontSize: 13, marginTop: 2 },
  modalHistoryDuration: { marginLeft: 12 },
  modalDurationText: { fontWeight: '700', fontSize: 15 },

  modalNoteInputCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 16 },
  modalNoteInput: { borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  modalAddNoteBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalAddNoteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalNoteItem: { paddingVertical: 14, borderBottomWidth: 0.5 },
  modalNoteText: { fontSize: 15, fontWeight: '500' },
  modalNoteMeta: { fontSize: 12, marginTop: 4 },

  modalPhotoActions: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 16, flexDirection: 'row', gap: 12 },
  modalPhotoBtn: { flex: 1, padding: 20, borderRadius: 14, alignItems: 'center', gap: 8 },
  modalPhotoBtnText: { fontSize: 14, fontWeight: '600' },
  modalPhotoColumnWrapper: { gap: 8 },
  modalPhotoThumb: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e5e7eb', marginBottom: 8 },
  modalPhotoThumbImg: { width: '100%', height: '100%' },

  projectPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  projectPickerInfo: { flex: 1 },
  projectPickerName: { fontSize: 16 },
  projectPickerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectPickerKunde: { fontSize: 13, marginTop: 2 },
  pickerUnreadBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerUnreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberInfo: { marginLeft: 14, flex: 1 },
  memberName: { fontWeight: '600', fontSize: 16 },
  memberRole: { fontSize: 13, marginTop: 2 },
  photoPreviewContainer: { flex: 1 },
  photoPreviewBackBtn: { paddingVertical: 8, paddingRight: 16 },
  photoPreviewBackBtnText: { fontSize: 16, fontWeight: '600' },
  photoPreviewDownloadBtn: { paddingVertical: 8, paddingLeft: 16 },
  photoPreviewImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  photoPreviewImage: { width: '100%', height: '100%' },
  imageOverlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  imageOverlayBottomBar: { position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24 },
  imageModalIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  imageModalIconBtnText: { color: '#fff', fontSize: 18 },
  fullImage: { width: '100%', height: '80%' },

  timerActiveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  timerActiveBarText: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  timerActiveBarAction: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.9 },

  timerSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  timerDisplay: { fontSize: 42, fontWeight: '800', fontVariant: ['tabular-nums'], marginBottom: 4 },
  timerStatus: { fontSize: 14, fontWeight: '600', marginBottom: 16 },
  timerActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  timerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  timerNoteInput: {
    width: '100%',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    minHeight: 40,
  },

  timerStartBtn: {
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  timerStartBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },

  timerDivider: { borderBottomWidth: 0.5, marginVertical: 12 },
  timerManualTitle: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8, letterSpacing: 1 },
});
