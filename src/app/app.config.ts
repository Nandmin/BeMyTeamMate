import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { provideAppCheck } from '@angular/fire/app-check';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { environment } from '../environments/environment';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      })
    ),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    ...(environment.firebase.appCheckSiteKey
      ? [
          provideAppCheck(() => {
            if (!environment.production && environment.firebase.appCheckDebugToken) {
              (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
                environment.firebase.appCheckDebugToken;
            }
            return initializeAppCheck(getApp(), {
              provider: new ReCaptchaV3Provider(environment.firebase.appCheckSiteKey),
              isTokenAutoRefreshEnabled: true,
            });
          }),
        ]
      : []),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideServiceWorker('firebase-messaging-sw.js', {
      enabled: true, // Bekapcsolva fejlesztés alatt is a teszteléshez
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
