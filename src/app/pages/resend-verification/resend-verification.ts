import { Component, effect, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-resend-verification',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, TranslatePipe],
  templateUrl: './resend-verification.html',
  styleUrl: './resend-verification.scss',
})
export class ResendVerificationPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly languageService = inject(LanguageService);

  currentYear = new Date().getFullYear();
  errorMessage = '';
  successMessage = signal('');
  isLoading = signal(false);
  showPassword = signal(false);

  resendForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('resend.meta.title'),
        description: this.languageService.t('resend.meta.description'),
        path: '/resend-verification',
      });
    });
  }

  ngOnInit() {
    const emailFromQuery = this.route.snapshot.queryParamMap.get('email');
    if (emailFromQuery) {
      this.resendForm.patchValue({ email: emailFromQuery });
    }

    const registered = this.route.snapshot.queryParamMap.get('registered');
    if (registered === '1') {
      this.successMessage.set(this.languageService.t('resend.registeredSuccess'));
    }
  }

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  async onResendVerification() {
    if (this.resendForm.invalid) {
      this.resendForm.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    this.successMessage.set('');
    this.isLoading.set(true);

    const { email, password } = this.resendForm.value;
    try {
      const result = await this.authService.resendVerificationEmail(email!, password!);
      if (result === 'already-verified') {
        this.successMessage.set(this.languageService.t('resend.alreadyVerified'));
      } else {
        this.successMessage.set(this.languageService.t('resend.resendSuccess'));
      }
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error?.code);
      console.error(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return this.languageService.t('resend.error.invalidCredentials');
      case 'auth/invalid-email':
        return this.languageService.t('resend.error.invalidEmail');
      case 'auth/unauthorized-continue-uri':
      case 'auth/invalid-continue-uri':
      case 'auth/missing-continue-uri':
        return this.languageService.t('resend.error.domain');
      case 'auth/too-many-requests':
        return this.languageService.t('resend.error.tooManyRequests');
      default:
        return this.languageService.t('resend.error.default');
    }
  }
}
