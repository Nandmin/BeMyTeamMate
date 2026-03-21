import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, TranslatePipe],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly seo = inject(SeoService);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  currentYear = new Date().getFullYear();

  private readonly noAccentsValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '') as string;
    if (!value) return null;
    const normalized = value.normalize('NFD');
    const withoutDiacritics = normalized.replace(/[\u0300-\u036f]/g, '');
    return value === withoutDiacritics ? null : { noAccents: true };
  };

  registerForm = this.fb.group({
    username: ['', [Validators.required, this.noAccentsValidator]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    bio: [''],
  });

  selectedSports = new Set<string>();
  sports = [
    { id: 'soccer', label: 'Foci', icon: 'sports_soccer' },
    { id: 'basketball', label: 'Kosárlabda', icon: 'sports_basketball' },
    { id: 'volleyball', label: 'Röplabda', icon: 'sports_volleyball' },
    { id: 'tennis', label: 'Tenisz', icon: 'sports_tennis' },
  ];

  errorMessage = '';
  successMessage = signal('');
  isLoading = signal(false);

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('register.meta.title'),
        description: this.languageService.t('register.meta.description'),
        path: '/register',
      });
    });
  }

  toggleSport(sportId: string) {
    if (this.selectedSports.has(sportId)) {
      this.selectedSports.delete(sportId);
    } else {
      this.selectedSports.add(sportId);
    }
  }

  isSportSelected(sportId: string): boolean {
    return this.selectedSports.has(sportId);
  }

  async onRegister() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { username, email, password, confirmPassword, bio } = this.registerForm.value;

    if (password !== confirmPassword) {
      this.errorMessage = this.languageService.t('register.passwordMismatch');
      return;
    }

    this.errorMessage = '';
    this.isLoading.set(true);

    try {
      await this.authService.registerWithEmail(email!, password!, username!, {
        bio,
        sports: Array.from(this.selectedSports),
      });
      this.successMessage.set(this.languageService.t('register.success'));
      await this.router.navigate(['/resend-verification'], {
        queryParams: { email: email ?? '', registered: '1' },
      });
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error?.code);
      console.error(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return this.languageService.t('auth.error.emailAlreadyInUse');
      case 'auth/username-already-in-use':
        return this.languageService.t('auth.error.usernameTaken');
      case 'auth/invalid-username':
        return this.languageService.t('auth.error.invalidUsername');
      case 'auth/invalid-email':
        return this.languageService.t('auth.error.invalidEmail');
      case 'auth/operation-not-allowed':
        return this.languageService.t('auth.error.unavailable');
      case 'auth/weak-password':
        return this.languageService.t('register.passwordMinLength');
      case 'auth/unauthorized-continue-uri':
      case 'auth/invalid-continue-uri':
      case 'auth/missing-continue-uri':
        return this.languageService.t('resend.error.domain');
      default:
        return this.languageService.t('auth.fallback.register');
    }
  }
}
