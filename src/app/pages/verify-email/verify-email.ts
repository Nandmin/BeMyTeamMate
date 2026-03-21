import { CommonModule } from '@angular/common';
import { Component, computed, effect, OnInit, inject, signal } from '@angular/core';
import { Auth, applyActionCode } from '@angular/fire/auth';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmailPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly languageService = inject(LanguageService);

  isLoading = signal(true);
  successMessage = signal('');
  errorMessage = signal('');
  protected readonly titleLabel = computed(() => this.languageService.t('verify.title'));
  protected readonly loadingLabel = computed(() => this.languageService.t('verify.loading'));
  protected readonly loginLabel = computed(() => this.languageService.t('common.nav.login'));
  protected readonly resendLabel = computed(() => this.languageService.t('verify.resendLink'));

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('verify.meta.title'),
        description: this.languageService.t('verify.meta.description'),
        path: '/verify-email',
        noindex: true,
      });
    });
  }

  ngOnInit() {
    void this.verifyFromCurrentUrl();
  }

  private async verifyFromCurrentUrl() {
    const verified = this.pickParam('verified');
    if (verified === '1') {
      this.successMessage.set(this.languageService.t('verify.success'));
      this.isLoading.set(false);
      return;
    }

    const mode = this.pickParam('mode');
    const oobCode = this.pickParam('oobCode');

    if (mode !== 'verifyEmail' || !oobCode) {
      this.errorMessage.set(this.languageService.t('verify.error.invalidLink'));
      this.isLoading.set(false);
      return;
    }

    try {
      await applyActionCode(this.auth, oobCode);
      this.successMessage.set(this.languageService.t('verify.success'));
    } catch (error: any) {
      this.errorMessage.set(this.getErrorMessage(error?.code));
      console.error('Email verification failed:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private pickParam(key: 'mode' | 'oobCode' | 'verified'): string | null {
    const direct = this.route.snapshot.queryParamMap.get(key);
    if (direct) return direct;

    const linkParam = this.route.snapshot.queryParamMap.get('link');
    if (linkParam) {
      const fromLink = this.pickParamFromUrl(linkParam, key);
      if (fromLink) return fromLink;
    }

    const continueUrlParam = this.route.snapshot.queryParamMap.get('continueUrl');
    if (continueUrlParam) {
      const fromContinue = this.pickParamFromUrl(continueUrlParam, key);
      if (fromContinue) return fromContinue;
    }

    return null;
  }

  private pickParamFromUrl(urlLike: string, key: 'mode' | 'oobCode' | 'verified'): string | null {
    try {
      const parsed = new URL(urlLike);
      return parsed.searchParams.get(key);
    } catch {
      try {
        const parsedRelative = new URL(urlLike, window.location.origin);
        return parsedRelative.searchParams.get(key);
      } catch {
        return null;
      }
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/invalid-action-code':
        return this.languageService.t('verify.error.invalidCode');
      case 'auth/expired-action-code':
        return this.languageService.t('verify.error.expiredCode');
      case 'auth/user-disabled':
        return this.languageService.t('verify.error.disabled');
      default:
        return this.languageService.t('verify.error.default');
    }
  }
}
