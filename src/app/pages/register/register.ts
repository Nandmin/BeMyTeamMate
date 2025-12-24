import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

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

  registerForm = this.fb.group({
    username: ['', [Validators.required]],
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

    try {
      await this.authService.registerWithEmail(email!, password!, username!, {
        bio,
        sports: Array.from(this.selectedSports),
      });
    } catch (error: any) {
      this.errorMessage = 'Hiba a regisztráció során. ' + (error.message || '');
      console.error(error);
    }
  }
}
