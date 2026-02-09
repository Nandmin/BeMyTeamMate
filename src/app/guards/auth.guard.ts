import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map((user) => {
      if (user) {
        const isPasswordAccount =
          user.providerData.some((provider) => provider.providerId === 'password') ||
          user.providerData.length === 0;

        if (isPasswordAccount && !user.emailVerified) {
          router.navigate(['/resend-verification'], {
            queryParams: { email: user.email ?? '' },
          });
          return false;
        }

        return true;
      }
      router.navigate(['/login']);
      return false;
    })
  );
};
