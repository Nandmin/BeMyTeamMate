import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { buildTranslationForLanguage, normalizeAppLanguage } from './translations';

@Injectable({ providedIn: 'root' })
export class AppTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(buildTranslationForLanguage(normalizeAppLanguage(lang)) as Translation);
  }
}
