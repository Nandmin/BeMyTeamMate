export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyCyPzPGm8lPwJ3fWgbrHciKIorRvJqUDyw',
    authDomain: 'bemyteammate.firebaseapp.com',
    databaseURL: 'https://bemyteammate-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'bemyteammate',
    storageBucket: 'bemyteammate.firebasestorage.app',
    messagingSenderId: '592557549877',
    appId: '1:592557549877:web:4b9655a3f7af4948fcc47c',
    measurementId: 'G-HK3YR5501H',
    vapidKey:
      'BKl1Pd0srJRPM4PjNOhsrvOapWCA7pCiSL_LG3vdJbbNxFBG3i6nDI43VxfCuSQgXIGTua0vGKjKzJtp3og9IoI', // For FCM web push (fill when available)
    appCheckSiteKey: '6LcENkgsAAAAAHV8Sg7826bzbzOczZK1ZDxVxY5d',
    appCheckDebugToken: '8daf3178-779f-44a8-a930-c5ff6b83e63c', // Debug token for localhost development
  },
  cloudflareWorkerUrl: 'https://bemyteammate-push.andras78-nemeth.workers.dev/send-notification',
  contactWorkerUrl: 'https://bemyteammate-push.andras78-nemeth.workers.dev/contact-message',
  turnstileSiteKey: '0x4AAAAAACNoKvz8XnmPqgaq',
};
