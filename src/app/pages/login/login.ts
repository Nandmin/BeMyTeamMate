import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, TranslatePipe],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly seo = inject(SeoService);
  private readonly languageService = inject(LanguageService);

  currentYear = new Date().getFullYear();

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  errorMessage = '';
  successMessage = signal('');
  isLoading = signal(false);
  showPassword = signal(false);
  showResendVerificationLink = signal(false);
  emailForResend = '';

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('login.meta.title'),
        description: this.languageService.t('login.meta.description'),
        path: '/login',
      });
    });
  }

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  ngOnInit() {
    this.authService.verifyMagicLink().catch((err) => {
      console.error('Magic link verify failed', err);
    });
  }

  async onLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    this.showResendVerificationLink.set(false);
    this.isLoading.set(true);

    const { email, password } = this.loginForm.value;
    this.emailForResend = email ?? '';
    try {
      await this.authService.loginWithEmail(email!, password!);
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error?.code);
      this.showResendVerificationLink.set(error?.code === 'auth/email-not-verified');
      console.error(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onGoogleLogin() {
    this.errorMessage = '';
    this.showResendVerificationLink.set(false);
    this.isLoading.set(true);
    try {
      await this.authService.loginWithGoogle();
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        this.errorMessage = this.languageService.t('login.googleFailed');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onForgotPassword() {
    const email = this.loginForm.get('email')?.value;
    if (!email || this.loginForm.get('email')?.invalid) {
      this.errorMessage = this.languageService.t('login.emailRequiredForReset');
      this.successMessage.set('');
      return;
    }

    this.errorMessage = '';
    this.showResendVerificationLink.set(false);
    this.successMessage.set('');
    this.isLoading.set(true);

    try {
      await this.authService.sendPasswordReset(email);
      this.successMessage.set(this.languageService.t('login.resetEmailSent'));
    } catch (error: any) {
      this.errorMessage = this.languageService.t('login.resetFailed');
      console.error(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return this.languageService.t('auth.fallback.login');
      case 'auth/invalid-email':
        return this.languageService.t('auth.error.invalidEmail');
      case 'auth/user-disabled':
        return this.languageService.t('auth.error.userDisabled');
      case 'auth/email-not-verified':
        return this.languageService.t('auth.error.emailNotVerified');
      case 'auth/too-many-requests':
        return this.languageService.t('auth.error.tooManyRequests');
      default:
        return this.languageService.t('auth.fallback.login');
    }
  }
}
