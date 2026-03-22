import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../../services/language.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-termofuse-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './termofuse.page.html',
  styleUrl: './termofuse.page.scss',
})
export class TermOfUsePage {
  private readonly seo = inject(SeoService);
  protected readonly languageService = inject(LanguageService);
  protected readonly contactEmail = environment.contactEmail;
  protected readonly isEnglish = computed(() => this.languageService.currentLanguage() === 'en');

  constructor() {
    effect(() => {
      const isEnglish = this.isEnglish();
      this.seo.setPageMeta({
        title: isEnglish ? 'Terms of Use - BeMyTeamMate' : 'Felhasználási feltételek - BeMyTeamMate',
        description: isEnglish
          ? 'The terms of use and general conditions of BeMyTeamMate for using the service.'
          : 'A BeMyTeamMate felhasználási feltételei és általános szerződési feltételei a szolgáltatás használatához.',
        path: '/termofuse',
      });
    });
  }
}
