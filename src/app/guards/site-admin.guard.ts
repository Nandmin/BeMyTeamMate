import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const siteAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.userData$.pipe(
    take(1),
    map((user) => {
      if (user?.role === 'siteadmin') {
        return true;
      }
      if (!user) {
        router.navigate(['/login']);
      } else {
        router.navigate(['/']);
      }
      return false;
    })
  );
};
