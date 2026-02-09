import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Auth, applyActionCode } from '@angular/fire/auth';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';

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

  isLoading = signal(true);
  successMessage = signal('');
  errorMessage = signal('');

  ngOnInit() {
    this.seo.setPageMeta({
      title: 'Email cím hitelesítés - BeMyTeamMate',
      description: 'Itt tudod véglegesíteni az e-mail címed hitelesítését.',
      path: '/verify-email',
      noindex: true,
    });

    void this.verifyFromCurrentUrl();
  }

  private async verifyFromCurrentUrl() {
    const verified = this.pickParam('verified');
    if (verified === '1') {
      this.successMessage.set('Sikeres e-mail cím hitelesítés.' + '\n' + ' Most már be tudsz jelentkezni.');
      this.isLoading.set(false);
      return;
    }

    const mode = this.pickParam('mode');
    const oobCode = this.pickParam('oobCode');

    if (mode !== 'verifyEmail' || !oobCode) {
      this.errorMessage.set('Érvénytelen vagy hiányos hitelesítési link.' + '\n' + '  Kérj újabb hitelesítő e-mailt.');
      this.isLoading.set(false);
      return;
    }

    try {
      await applyActionCode(this.auth, oobCode);
      this.successMessage.set('Sikeres e-mail cím hitelesítés.' + '\n' + ' Most már be tudsz jelentkezni.');
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
        return 'Érvénytelen hitelesítési kód.' + '\n' + ' Kérj újabb hitelesítő e-mailt.';
      case 'auth/expired-action-code':
        return 'A hitelesítési link lejárt.' + '\n' + ' Kérj újabb hitelesítő e-mailt.';
      case 'auth/user-disabled':
        return 'Ez a fiók le van tiltva.';
      default:
        return 'Nem sikerült az e-mail cím hitelesítése.' + '\n' + ' Próbáld újra vagy kérj új linket.';
    }
  }
}
