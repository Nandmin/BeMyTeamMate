import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { LanguageService } from '../../services/language.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-privacy-policy-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './privacy-policy.page.html',
  styleUrl: './privacy-policy.page.scss',
})
export class PrivacyPolicyPage {
  private readonly seo = inject(SeoService);
  protected readonly languageService = inject(LanguageService);
  protected readonly contactEmail = environment.contactEmail;
  protected readonly isEnglish = computed(() => this.languageService.currentLanguage() === 'en');

  constructor() {
    effect(() => {
      const isEnglish = this.isEnglish();
      this.seo.setPageMeta({
        title: isEnglish ? 'Privacy Policy - BeMyTeamMate' : 'Adatkezelési Tájékoztató - BeMyTeamMate',
        description: isEnglish
          ? 'The BeMyTeamMate privacy policy, including the scope of processed data, legal basis, processors, and data subject rights.'
          : 'A BeMyTeamMate adatkezelési tájékoztatója, beleértve a kezelt adatok körét, jogalapját, az adatfeldolgozókat és az érintetti jogokat.',
        path: '/privacy-policy',
      });
    });
  }
}
