import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-resend-verification',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './resend-verification.html',
  styleUrl: './resend-verification.scss',
})
export class ResendVerificationPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  currentYear = new Date().getFullYear();
  errorMessage = '';
  successMessage = signal('');
  isLoading = signal(false);
  showPassword = signal(false);

  resendForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  ngOnInit() {
    this.seo.setPageMeta({
      title: 'Email hitelesítés újraküldése – BeMyTeamMate',
      description: 'Ha nem kaptad meg az aktivációs emailed, innen újra küldheted.',
      path: '/resend-verification',
    });

    const emailFromQuery = this.route.snapshot.queryParamMap.get('email');
    if (emailFromQuery) {
      this.resendForm.patchValue({ email: emailFromQuery });
    }

    const registered = this.route.snapshot.queryParamMap.get('registered');
    if (registered === '1') {
      this.successMessage.set(
        'Sikeres regisztráció. Ellenőrizd az emailed, vagy küldd újra innen az aktivációs levelet.'
      );
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
        this.successMessage.set('Ez az email cím már hitelesített.' + '\n' + ' Jelentkezz be a fiókodba.');
      } else {
        this.successMessage.set('Újra elküldtük az aktivációs emailt.' + '\n' + 'Ellenőrizd a postaládádat.');
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
        return 'Hibás e-mail cím vagy jelszó.';
      case 'auth/invalid-email':
        return 'Érvénytelen e-mail cím formátum.';
      case 'auth/unauthorized-continue-uri':
      case 'auth/invalid-continue-uri':
      case 'auth/missing-continue-uri':
        return 'A hitelesítő link domain nincs engedélyezve. Ellenőrizd az Auth domain beállításokat.';
      case 'auth/too-many-requests':
        return 'Túl sok próbálkozás.' + '\n' + 'Próbáld újra később.';
      default:
        return 'Sikertelen megerősítő e-mail küldés.' + '\n' + 'Próbáld újra.';
    }
  }
}
