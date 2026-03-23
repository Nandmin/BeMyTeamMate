import { DOCUMENT } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { effect, inject, Inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { map, startWith, take } from 'rxjs/operators';
import {
  AppLanguage,
  normalizeAppLanguage,
  SUPPORTED_LANGUAGES,
  TranslationKey,
} from '../i18n/translations';

export type TranslationParams = Record<string, string | number>;

const DEFAULT_LANGUAGE: AppLanguage = 'en';
const LANGUAGE_STORAGE_KEY = 'app-language';
const OG_LOCALES: Record<AppLanguage, string> = {
  hu: 'hu_HU',
  en: 'en_US',
};

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly translocoService = inject(TranslocoService);
  readonly supportedLanguages = SUPPORTED_LANGUAGES;
  readonly currentLanguage = toSignal(
    this.translocoService.langChanges$.pipe(
      map((language) => normalizeAppLanguage(language)),
      startWith(normalizeAppLanguage(this.translocoService.getActiveLang()))
    ),
    { initialValue: DEFAULT_LANGUAGE }
  );

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.translocoService.setAvailableLangs([...SUPPORTED_LANGUAGES]);
    this.translocoService.setDefaultLang(DEFAULT_LANGUAGE);
    const initialLanguage = this.resolveInitialLanguage();

    if (initialLanguage !== DEFAULT_LANGUAGE) {
      this.preloadLanguage(DEFAULT_LANGUAGE);
    }
    this.activateLanguage(initialLanguage);

    effect(() => {
      const language = this.currentLanguage();
      this.document.documentElement.lang = language;
      this.safeSetStoredLanguage(language);
    });
  }

  setLanguage(language: AppLanguage): void {
    this.activateLanguage(language);
  }

  toggleLanguage(): void {
    this.activateLanguage(this.currentLanguage() === 'hu' ? 'en' : 'hu');
  }

  isLanguage(language: AppLanguage): boolean {
    return this.currentLanguage() === language;
  }

  t(key: TranslationKey, params?: TranslationParams): string {
    return this.translocoService.translate(key, params, this.currentLanguage());
  }

  getOgLocale(): string {
    return OG_LOCALES[this.currentLanguage()];
  }

  private activateLanguage(language: AppLanguage): void {
    this.translocoService.load(language).pipe(take(1)).subscribe({
      next: () => {
        this.translocoService.setActiveLang(language);
      },
      error: (error) => {
        console.error(`Failed to activate translations for "${language}"`, error);
        this.translocoService.setActiveLang(language);
      },
    });
  }

  private preloadLanguage(language: AppLanguage): void {
    this.translocoService.load(language).pipe(take(1)).subscribe({
      error: (error) => {
        console.error(`Failed to preload translations for "${language}"`, error);
      },
    });
  }

  private resolveInitialLanguage(): AppLanguage {
    const storedLanguage = this.safeGetStoredLanguage();
    if (storedLanguage) {
      return storedLanguage;
    }

    const browserLanguage = this.document.defaultView?.navigator?.language
      ?.toLowerCase()
      .split('-')[0];

    return browserLanguage === 'hu' ? 'hu' : 'en';
  }

  private safeGetStoredLanguage(): AppLanguage | null {
    try {
      const stored = this.document.defaultView?.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
      return normalizeAppLanguage(stored) === stored ? (stored as AppLanguage) : null;
    } catch {
      return null;
    }
  }

  private safeSetStoredLanguage(language: AppLanguage): void {
    try {
      this.document.defaultView?.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  }
}
