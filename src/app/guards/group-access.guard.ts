import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from '../services/auth.service';
import { from, of } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';

export const groupAccessGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const firestore = inject(Firestore);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        return of(router.createUrlTree(['/login']));
      }

      const groupId = route.paramMap.get('id');
      if (!groupId) {
        return of(router.createUrlTree(['/groups']));
      }

      const groupRef = doc(firestore, `groups/${groupId}`);
      const memberRef = doc(firestore, `groups/${groupId}/members/${user.uid}`);
      const inviteRef = doc(firestore, `groups/${groupId}/invites/${user.uid}`);

      return from(getDoc(groupRef)).pipe(
        switchMap((groupSnap) => {
          if (!groupSnap.exists()) {
            return of(router.createUrlTree(['/groups']));
          }

          const group = groupSnap.data() as { type?: string; ownerId?: string };
          if (group?.type === 'open') {
            return of(true);
          }
          if (group?.ownerId === user.uid) {
            return of(true);
          }

          return from(getDoc(memberRef)).pipe(
            switchMap((memberSnap) => {
              if (memberSnap.exists()) {
                return of(true);
              }

              return from(getDoc(inviteRef)).pipe(
                map((inviteSnap) => {
                  const status = inviteSnap.exists()
                    ? (inviteSnap.data() as { status?: string })?.status
                    : null;
                  return status === 'pending' ? true : router.createUrlTree(['/groups']);
                }),
                catchError(() => of(router.createUrlTree(['/groups']))),
              );
            }),
            catchError(() => of(router.createUrlTree(['/groups']))),
          );
        }),
        catchError(() => of(router.createUrlTree(['/groups']))),
      );
    }),
  );
};
