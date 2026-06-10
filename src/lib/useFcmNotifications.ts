'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || 'BDK-WFJQ5PQYAjM6pES0WqUEh7eP8eO_ZfqAzHTwZhftx1kfYXO8WYNH-Y3q_HgLb3Pn9R0fB1bQv5jQs_VaGgs4';

interface FcmNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

type FcmPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export function useFcmNotifications(userId: string | undefined) {
  const [permission, setPermission] = useState<FcmPermissionStatus>('prompt');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onMessageRef = useRef<((notification: FcmNotification) => void) | null>(null);
  const initializedRef = useRef(false);

  // Initialize messaging and register token
  const initialize = useCallback(async () => {
    if (!userId || initializedRef.current) return;
    initializedRef.current = true;
    setLoading(true);

    try {
      const messaging = await getMessagingInstance();
      if (!messaging) {
        setPermission('unsupported');
        setLoading(false);
        return;
      }

      // Check permission
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission as FcmPermissionStatus);
      }

      // Try to get existing token from Firestore
      try {
        const userSnap = await getDoc(doc(db, 'users', userId));
        const userData = userSnap.data();
        if (userData?.fcmToken) {
          setToken(userData.fcmToken);
        }
      } catch {}

      // Set up foreground message handler
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || 'EarnTrack';
        const body = payload.notification?.body || payload.data?.body || '';
        const data = payload.data as Record<string, string> | undefined;

        // Show notification
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/logo.png?v=2',
            tag: data?.tag || data?.assignmentId || 'earntrack',
            ...({ badge: '/favicon-new.png', vibrate: [200, 100, 200], requireInteraction: true } as any),
            data: { url: data?.url || '/' },
          });
        }

        // Play notification sound
        try {
          playNotificationSound();
        } catch {}

        // Notify callback
        if (onMessageRef.current) {
          onMessageRef.current({ title, body, data });
        }
      });
    } catch (e: any) {
      console.error('FCM init error:', e);
      setError(e.message || 'FCM init failed');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Request permission and get token
  const requestPermission = useCallback(async () => {
    if (!userId) return null;
    setLoading(true);
    setError(null);

    try {
      const messaging = await getMessagingInstance();
      if (!messaging) {
        setError('Push-Benachrichtigungen werden in diesem Browser nicht unterstützt.');
        setLoading(false);
        return null;
      }

      // Request Notification permission
      let perm: NotificationPermission;
      if (typeof Notification !== 'undefined') {
        perm = await Notification.requestPermission();
        setPermission(perm as FcmPermissionStatus);
        if (perm !== 'granted') {
          setError('Benachrichtigungen wurden nicht erlaubt.');
          setLoading(false);
          return null;
        }
      }

      // Get FCM token
      const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (!fcmToken) {
        setError('Konnte Push-Token nicht registrieren.');
        setLoading(false);
        return null;
      }

      setToken(fcmToken);

      // Store in Firestore
      await updateDoc(doc(db, 'users', userId), {
        fcmToken,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });

      setLoading(false);
      return fcmToken;
    } catch (e: any) {
      console.error('FCM permission error:', e);
      if (e.code === 'messaging/permission-blocked') {
        setPermission('denied');
        setError('Push-Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.');
      } else if (e.code === 'messaging/notifications-blocked') {
        setPermission('denied');
        setError('Benachrichtigungen wurden blockiert.');
      } else {
        setError(e.message || 'Fehler bei der Registrierung');
      }
      setLoading(false);
      return null;
    }
  }, [userId]);

  // Remove token
  const removeToken = useCallback(async () => {
    if (!userId) return;
    try {
      setToken(null);
      await updateDoc(doc(db, 'users', userId), {
        fcmToken: null,
        fcmTokenUpdatedAt: null,
      });
    } catch (e: any) {
      console.error('FCM token removal error:', e);
    }
  }, [userId]);

  // Set a callback for incoming messages
  const onNotification = useCallback((callback: (notification: FcmNotification) => void) => {
    onMessageRef.current = callback;
  }, []);

  return {
    permission,
    token,
    loading,
    error,
    requestPermission,
    removeToken,
    onNotification,
  };
}

function playNotificationSound() {
  try {
    // Use AudioContext for a short notification sound
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Audio not available
  }
}
