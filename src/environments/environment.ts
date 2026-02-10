type RuntimePublicConfig = {
  vapidKey?: string;
  turnstileSiteKey?: string;
};

const runtimePublicConfig = ((globalThis as any).__BMT_RUNTIME_CONFIG__ || {}) as RuntimePublicConfig;

const getRuntimePublicValue = (value: string | undefined, fallback = ''): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
};

export const environment = {
  production: false,
  appBaseUrl: 'http://localhost:4200',
  firebase: {
    apiKey: 'AIzaSyCyPzPGm8lPwJ3fWgbrHciKIorRvJqUDyw',
    authDomain: 'bemyteammate.firebaseapp.com',
    databaseURL: 'https://bemyteammate-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'bemyteammate',
    storageBucket: 'bemyteammate.firebasestorage.app',
    messagingSenderId: '592557549877',
    appId: '1:592557549877:web:4b9655a3f7af4948fcc47c',
    measurementId: 'G-HK3YR5501H',
    vapidKey: getRuntimePublicValue(runtimePublicConfig.vapidKey, 'YOUR_VAPID_KEY'),
    appCheckSiteKey: '6LcENkgsAAAAAHV8Sg7826bzbzOczZK1ZDxVxY5d',
    appCheckDebugToken: undefined as string | undefined,
  },
  cloudflareWorkerUrl: 'https://bemyteammate-push.andras78-nemeth.workers.dev/send-notification',
  contactWorkerUrl: 'https://bemyteammate-push.andras78-nemeth.workers.dev/contact-message',
  turnstileSiteKey: getRuntimePublicValue(runtimePublicConfig.turnstileSiteKey),
};
