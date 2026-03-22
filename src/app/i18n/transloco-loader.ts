import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { from, Observable, of } from 'rxjs';
import {
  AppLanguage,
  buildTranslationForLanguage,
  isAppLanguage,
  normalizeAppLanguage,
} from './translations';

type ScopedTranslationLoader = () => Promise<Translation>;

const SCOPED_TRANSLATION_LOADERS: Record<string, Record<AppLanguage, ScopedTranslationLoader>> = {
  privacyPolicy: {
    hu: () => import('../pages/privacy-policy/i18n/hu').then((module) => module.default as Translation),
    en: () => import('../pages/privacy-policy/i18n/en').then((module) => module.default as Translation),
  },
  termOfUse: {
    hu: () => import('../pages/termofuse/i18n/hu').then((module) => module.default as Translation),
    en: () => import('../pages/termofuse/i18n/en').then((module) => module.default as Translation),
  },
};

function resolveScopedTranslationLoader(path: string): ScopedTranslationLoader | null {
  const [scope, language, ...rest] = path.split('/');
  if (!scope || !language || rest.length > 0 || !isAppLanguage(language)) {
    return null;
  }

  return SCOPED_TRANSLATION_LOADERS[scope]?.[language] ?? null;
}

@Injectable({ providedIn: 'root' })
export class AppTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    const scopedLoader = resolveScopedTranslationLoader(lang);
    if (scopedLoader) {
      return from(scopedLoader());
    }

    return of(buildTranslationForLanguage(normalizeAppLanguage(lang)) as Translation);
  }
}
