import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { TranslationKey } from '../i18n/translations';
import { LanguageService, TranslationParams } from '../services/language.service';

@Pipe({
  name: 't',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private readonly languageService = inject(LanguageService);
  private readonly translocoService = inject(TranslocoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly subscription: Subscription;

  constructor() {
    this.subscription = this.translocoService.langChanges$.subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  transform(key: TranslationKey, params?: TranslationParams): string {
    return this.languageService.t(key, params);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
