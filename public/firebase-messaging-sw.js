// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCwpSQWyEPNUWXY2R3r75UiSuxfrJswbg0',
  authDomain: 'earntrack-new.firebaseapp.com',
  projectId: 'earntrack-new',
  storageBucket: 'earntrack-new.firebasestorage.app',
  messagingSenderId: '996234536261',
  appId: '1:996234536261:web:1769e789843e1d68ccca2c',
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage(function (payload) {
  const data = payload.data || {};

  // Build notification from payload
  let title = payload.notification?.title || data.title || 'EarnTrack';
  let body = payload.notification?.body || data.body || '';
  let icon = payload.notification?.icon || '/logo.png?v=2';
  let badge = '/favicon-new.png';
  let tag = data.tag || data.assignmentId || 'earntrack-default';
  let vibrate = [200, 100, 200];
  let requireInteraction = true;
  let silent = data.silent === 'true';

  // Sound for push (if not silent)
  if (!silent && data.sound !== 'false') {
    vibrate = [200, 100, 200, 100, 200];
  }

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    vibrate,
    requireInteraction,
    renotify: true,
    silent,
    data: {
      ...data,
      url: data.url || '/',
      clickAction: data.url || '/',
      time: new Date().getTime(),
    },
    actions: [
      {
        action: 'open',
        title: 'Öffnen',
      },
    ],
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function (event) {
  const clickedNotification = event.notification;
  clickedNotification.close();

  const data = clickedNotification.data || {};
  const urlToOpen = data.url || data.clickAction || '/';
  const action = event.action;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) || client.url.includes(window.location.origin)) {
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
