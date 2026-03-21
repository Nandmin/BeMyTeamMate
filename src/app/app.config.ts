import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideTransloco, translocoConfig } from '@jsverse/transloco';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { provideAppCheck } from '@angular/fire/app-check';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { initializeFirestore, memoryLocalCache, persistentLocalCache } from 'firebase/firestore';
import { environment } from '../environments/environment';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { AppTranslocoLoader } from './i18n/transloco-loader';
import { SUPPORTED_LANGUAGES } from './i18n/translations';

const APP_CHECK_DEBUG_LOG_PATTERNS = [
  'app check debug token',
  'appcheck debug token',
  'firebase_appcheck_debug_token',
  "you will need to add it to your app's app check settings",
];

const shouldSuppressAppCheckDebugLog = (args: unknown[]): boolean =>
  args.some(
    (arg) =>
      typeof arg === 'string' &&
      APP_CHECK_DEBUG_LOG_PATTERNS.some((pattern) => arg.toLowerCase().includes(pattern))
  );

const installAppCheckDebugLogFilter = (): void => {
  const filterFlag = '__BMT_APP_CHECK_LOG_FILTER_INSTALLED__';
  if ((globalThis as any)[filterFlag]) {
    return;
  }
  (globalThis as any)[filterFlag] = true;

  const wrap = (original: (...args: any[]) => void) =>
    (...args: any[]) => {
      if (shouldSuppressAppCheckDebugLog(args)) {
        return;
      }
      original(...args);
    };

  console.log = wrap(console.log.bind(console));
  console.info = wrap(console.info.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
};

const getLocalAppCheckDebugToken = (): string | true | undefined => {
  if (environment.production) {
    return undefined;
  }

  const envToken = environment.firebase.appCheckDebugToken;
  if (typeof envToken === 'string' && envToken.trim().length > 0) {
    return envToken.trim();
  }

  const globalToken = (globalThis as any).__APP_CHECK_DEBUG_TOKEN__;
  if (typeof globalToken === 'string' && globalToken.trim().length > 0) {
    return globalToken.trim();
  }

  try {
    const storageToken = globalThis.localStorage?.getItem('FIREBASE_APPCHECK_DEBUG_TOKEN');
    if (typeof storageToken === 'string' && storageToken.trim().length > 0) {
      return storageToken.trim();
    }
  } catch {
    // localStorage can be unavailable in some browser contexts
  }

  const host = globalThis.location?.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  return undefined;
};

const isFirestoreAlreadyInitializedError = (error: unknown): boolean => {
  if (!(error instanceof Error) || typeof error.message !== 'string') return false;
  return /already been initialized|already started|already exists/i.test(error.message);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideTransloco({
      config: translocoConfig({
        availableLangs: [...SUPPORTED_LANGUAGES],
        defaultLang: 'hu',
        fallbackLang: 'hu',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      }),
      loader: AppTranslocoLoader,
    }),
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
            const debugToken = getLocalAppCheckDebugToken();
            if (debugToken) {
              (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
              installAppCheckDebugLogFilter();
            }
            return initializeAppCheck(getApp(), {
              provider: new ReCaptchaEnterpriseProvider(environment.firebase.appCheckSiteKey),
              isTokenAutoRefreshEnabled: true,
            });
          }),
        ]
      : []),
    provideAuth(() => getAuth()),
    provideFirestore(() => {
      const app = getApp();

      try {
        return initializeFirestore(app, {
          localCache: persistentLocalCache(),
        });
      } catch (error) {
        if (isFirestoreAlreadyInitializedError(error)) {
          return getFirestore(app);
        }
        console.warn('Firestore persistent cache unavailable, using memory cache:', error);
      }

      try {
        return initializeFirestore(app, {
          localCache: memoryLocalCache(),
        });
      } catch (fallbackError) {
        if (isFirestoreAlreadyInitializedError(fallbackError)) {
          return getFirestore(app);
        }
        console.warn('Firestore memory cache init failed, using default Firestore instance:', fallbackError);
        return getFirestore(app);
      }
    }),
    provideServiceWorker('firebase-messaging-sw.js', {
      enabled: true, // Bekapcsolva fejlesztés alatt is a teszteléshez
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
