import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private seo = inject(SeoService);

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

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  ngOnInit() {
    this.seo.setPageMeta({
      title: 'Bejelentkezés – BeMyTeamMate',
      description: 'Lépj be, szervezd a következő meccset és kezeld a csapatodat egy helyen.',
      path: '/login',
    });
    // Check if we arrived here via a magic link
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
      this.errorMessage = this.getErrorMessage(error.code);
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
      if (error.code !== 'auth/popup-closed-by-user') {
        this.errorMessage = 'Google bejelentkezés sikertelen.';
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onForgotPassword() {
    const email = this.loginForm.get('email')?.value;
    if (!email || this.loginForm.get('email')?.invalid) {
      this.errorMessage = 'Kérlek add meg az email címedet az elfelejtett jelszóhoz.';
      this.successMessage.set('');
      return;
    }

    this.errorMessage = '';
    this.showResendVerificationLink.set(false);
    this.successMessage.set('');
    this.isLoading.set(true);

    try {
      await this.authService.sendPasswordReset(email);
      this.successMessage.set('Jelszó-visszaállító email elküldve! Ellenőrizd a postaládád.');
    } catch (error: any) {
      this.errorMessage = 'Sikertelen jelszó-visszaállítás. Kérlek próbáld újra.';
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
        return 'Helytelen email cím vagy jelszó.';
      case 'auth/invalid-email':
        return 'Érvénytelen email cím formátum.';
      case 'auth/user-disabled':
        return 'Ez a felhasználói fiók le van tiltva.';
      case 'auth/email-not-verified':
        return 'Az email címed még nincs megerősítve.' + '\n' + 'Előbb hitelesítsd az email címed.';
      case 'auth/too-many-requests':
        return 'Túl sok sikertelen próbálkozás. Próbáld meg később.';
      default:
        return 'Sikertelen bejelentkezés. Kérlek próbáld újra.';
    }
  }
}
