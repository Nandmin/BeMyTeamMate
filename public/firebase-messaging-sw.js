importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

// Import Angular Service Worker
try {
  importScripts('./ngsw-worker.js');
} catch (e) {
  console.log('Angular Service Worker not available (normal in development)');
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

firebase.initializeApp({
  apiKey: 'AIzaSyCyPzPGm8lPwJ3fWgbrHciKIorRvJqUDyw',
  authDomain: 'bemyteammate.firebaseapp.com',
  databaseURL: 'https://bemyteammate-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'bemyteammate',
  storageBucket: 'bemyteammate.firebasestorage.app',
  messagingSenderId: '592557549877',
  appId: '1:592557549877:web:4b9655a3f7af4948fcc47c',
  measurementId: 'G-HK3YR5501H',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Uj ertesites';
  const options = {
    body: payload.notification?.body || '',
    data: payload.data || {},
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    tag: payload.data?.type || 'general',
    renotify: true,
    requireInteraction: false,
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification?.data?.link;
  if (link) {
    event.waitUntil(clients.openWindow(link));
  }
});
