import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

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

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  errorMessage = '';

  ngOnInit() {
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
    const { email, password } = this.loginForm.value;
    try {
      await this.authService.loginWithEmail(email!, password!);
    } catch (error: any) {
      this.errorMessage = 'Hiba a bejelentkezés során. Ellenőrizd az adataidat.';
      console.error(error);
    }
  }

  async onGoogleLogin() {
    try {
      await this.authService.loginWithGoogle();
    } catch (error) {
      this.errorMessage = 'Google bejelentkezés sikertelen.';
    }
  }
}
