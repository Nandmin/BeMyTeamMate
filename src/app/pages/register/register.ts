import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterPage {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private seo = inject(SeoService);
  private router = inject(Router);

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
    this.seo.setPageMeta({
      title: 'Ingyenes regisztráció – BeMyTeamMate',
      description: 'Hozz létre fiókot 1 perc alatt, és kezdj el kiegyensúlyozott csapatokat generálni.',
      path: '/register',
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
      this.errorMessage = 'A jelszavak nem egyeznek.';
      return;
    }

    this.errorMessage = '';
    this.isLoading.set(true);

    try {
      await this.authService.registerWithEmail(email!, password!, username!, {
        bio,
        sports: Array.from(this.selectedSports),
      });
      this.successMessage.set('Sikeres regisztráció! Az aktiváló emailt elküldtük.');
      await this.router.navigate(['/resend-verification'], {
        queryParams: { email: email ?? '', registered: '1' },
      });
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
      console.error(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Ez az email cím már használatban van.';
      case 'auth/invalid-email':
        return 'Érvénytelen email cím formátum.';
      case 'auth/operation-not-allowed':
        return 'Az email/jelszó regisztráció nincs engedélyezve.';
      case 'auth/weak-password':
        return 'A jelszó túl gyenge (legalább 6 karakter).';
      case 'auth/unauthorized-continue-uri':
      case 'auth/invalid-continue-uri':
      case 'auth/missing-continue-uri':
        return 'A hitelesítő email link beállítás hibás. Jelezd az adminnak.';
      default:
        return 'Sikertelen regisztráció. Kérlek próbáld újra.';
    }
  }
}


