export const environment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_AUTH_DOMAIN',
    databaseURL: 'YOUR_DATABASE_URL',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_STORAGE_BUCKET',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID',
    measurementId: 'YOUR_MEASUREMENT_ID',
    vapidKey: 'YOUR_VAPID_KEY',
    appCheckSiteKey: 'YOUR_RECAPTCHA_V3_SITE_KEY',
    appCheckDebugToken: false,
  },
  cloudflareWorkerUrl: 'https://your-worker.workers.dev/send-notification',
  contactWorkerUrl: 'https://your-worker.workers.dev/contact-message',
  turnstileSiteKey: 'YOUR_TURNSTILE_SITE_KEY',
};
