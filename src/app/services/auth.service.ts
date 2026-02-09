import { Injectable, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActionCodeSettings,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  user,
  User,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
} from '@angular/fire/auth';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp, getDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { defer, Observable, of, from } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { AppUser } from '../models/user.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private cacheTtlMs = 5 * 60 * 1000;
  private profileCache = new Map<string, { data: AppUser; ts: number }>();
  private readonly maxProfileCacheEntries = 100;

  // Expose the current user as an observable and signals
  public readonly user$: Observable<User | null>;
  public currentUser: Signal<User | null | undefined>;

  // Expose the full user profile data from Firestore
  public readonly userData$: Observable<AppUser | null>;
  public fullCurrentUser: Signal<AppUser | null | undefined>;

  constructor() {
    // Initialize observables inside the constructor to ensure context safety
    this.user$ = user(this.auth);
    this.currentUser = toSignal(this.user$, { initialValue: null });

    this.userData$ = this.user$.pipe(
      switchMap((u) => {
        if (u) {
          return this.getUserProfile(u.uid);
        } else {
          return of(null);
        }
      }),
    );
    this.fullCurrentUser = toSignal(this.userData$, { initialValue: null });
  }

  // --- Change Password (reauthenticate + update) ---
  async changePassword(currentPassword: string, newPassword: string) {
    const u = this.auth.currentUser as any;
    if (!u) throw new Error('Nincs bejelentkezett felhasználó.');
    if (!u.email) throw new Error('A felhasználónak nincs regisztrált e-mail címe.');

    try {
      const credential = EmailAuthProvider.credential(u.email, currentPassword);
      await reauthenticateWithCredential(u, credential);
      await updatePassword(u, newPassword);
      return true;
    } catch (error: any) {
      console.error('Password change error:', error);
      throw this.toSafeError(error, 'Nem sikerült a jelszó módosítása.');
    }
  }

  // --- Google Sign-In ---
  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const credential = await signInWithPopup(this.auth, provider);
      await this.updateUserData(credential.user);
      this.router.navigate(['/']); // Navigate to home/dashboard
      return credential.user;
    } catch (error: any) {
      console.error('Google login error:', error);
      throw this.toSafeError(error, 'Sikertelen Google bejelentkezés.');
    }
  }

  // --- Email/Password Register ---
  async registerWithEmail(email: string, pass: string, username?: string, additionalData?: any) {
    let createdUser: User | null = null;
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, pass);
      createdUser = credential.user;
      if (username) {
        await updateProfile(credential.user, { displayName: username });
      }
      await this.updateUserData(credential.user, { username, ...additionalData }); // Save extra data

      await this.sendVerificationEmailWithFallback(credential.user);
      return credential.user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw this.toSafeError(error, 'Sikertelen regisztráció.');
    } finally {
      if (createdUser) {
        try {
          await signOut(this.auth);
        } catch (logoutError) {
          console.warn('Auto logout after registration failed:', logoutError);
        }
      }
    }
  }

  // --- Email/Password Login ---
  async loginWithEmail(email: string, pass: string) {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, pass);

      await credential.user.reload();
      if (this.requiresEmailVerification(credential.user)) {
        try {
          await signOut(this.auth);
        } catch (logoutError) {
          console.warn('Logout after blocked login failed:', logoutError);
        }
        throw this.createEmailNotVerifiedError();
      }

      await this.updateUserData(credential.user);
      this.router.navigate(['/']);
      return credential.user;
    } catch (error: any) {
      console.error('Email login error:', error);
      throw this.toSafeError(error, 'Sikertelen bejelentkezĂ©s.');
    }
  }

  async resendVerificationEmail(email: string, pass: string): Promise<'sent' | 'already-verified'> {
    let signedInUser: User | null = null;
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, pass);
      signedInUser = credential.user;
      await signedInUser.reload();

      if (this.requiresEmailVerification(signedInUser)) {
        await this.sendVerificationEmailWithFallback(signedInUser);
        return 'sent';
      }

      await this.updateUserData(signedInUser);
      return 'already-verified';
    } catch (error: any) {
      console.error('Resend verification error:', error);
      throw this.toSafeError(error, 'Sikertelen megerositő email küldés.');
    } finally {
      if (signedInUser) {
        try {
          await signOut(this.auth);
        } catch (logoutError) {
          console.warn('Logout after resend verification failed:', logoutError);
        }
      }
    }
  }

  // --- Magic Link (Email Link) ---
  async sendMagicLink(email: string) {
    const actionCodeSettings = {
      url: window.location.origin + '/login', // Redirect back to login page to handle the link
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(this.auth, email, actionCodeSettings);
      this.safeSetItem('emailForSignIn', email);
      return true;
    } catch (error: any) {
      console.error('Magic link error:', error);
      throw this.toSafeError(error, 'Sikertelen belépési link küldés.');
    }
  }

  async verifyMagicLink() {
    if (isSignInWithEmailLink(this.auth, window.location.href)) {
      let email = this.safeGetItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        try {
          const result = await signInWithEmailLink(this.auth, email, window.location.href);
          this.safeRemoveItem('emailForSignIn');
          await this.updateUserData(result.user);
          this.router.navigate(['/']);
          return result.user;
        } catch (error: any) {
          console.error('Link verification error:', error);
          throw this.toSafeError(error, 'Sikertelen belépés a varázslinkkel.');
        }
      }
    }
    return null;
  }

  // --- Password Reset ---
  async sendPasswordReset(email: string) {
    try {
      await sendPasswordResetEmail(this.auth, email);
      return true;
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw this.toSafeError(error, 'Sikertelen jelszó-helyreállítás.');
    }
  }

  // --- Logout ---
  async logout() {
    await signOut(this.auth);
    this.router.navigate(['/login']);
  }

  async updateProfile(displayName: string, photoURL?: string, bio?: string) {
    const u = this.auth.currentUser;
    if (u) {
      const modifiedFields: string[] = ['displayName'];
      if (photoURL !== undefined) modifiedFields.push('photoURL');
      if (bio !== undefined) modifiedFields.push('bio');

      await updateProfile(u, { displayName, photoURL });
      await this.updateUserData(u, {
        bio,
        photoURL,
        profileUpdatedAt: serverTimestamp(),
        lastModifiedFields: modifiedFields,
      }); // Sync to Firestore
    }
  }

  getUserProfile(uid: string): Observable<AppUser | null> {
    return defer(() => {
      const cached = this.getCachedProfile(uid);
      if (cached) return of(cached);

      const userRef = doc(this.firestore, `users/${uid}`);
      return from(getDoc(userRef)).pipe(
        map((snap) => (snap.exists() ? ({ ...(snap.data() as AppUser), uid } as AppUser) : null)),
        tap((data) => {
          if (data) this.setCachedProfile(uid, data);
        }),
      );
    });
  }

  async getIdToken(): Promise<string | null> {
    const u = this.auth.currentUser;
    if (u) {
      return u.getIdToken();
    }
    return null;
  }

  // --- Firestore User Data Logic ---
  private async updateUserData(firebaseUser: any, additionalData: any = {}) {
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    const existingSnap = await getDoc(userRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    const data: any = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      emailVerified: firebaseUser.emailVerified ?? existingData['emailVerified'] ?? false,
      displayName:
        firebaseUser.displayName ||
        existingData['displayName'] ||
        additionalData.username ||
        'Névtelen',
      photoURL: firebaseUser.photoURL || existingData['photoURL'] || null,
      role: existingData['role'] ?? 'user',
      lastLogin: serverTimestamp(),
      // Alapértelmezett értékek, ha még nem léteznek:
      elo: existingData['elo'] ?? 1200,
      formFactor: existingData['formFactor'] ?? 1.0,
      createdAt: existingData['createdAt'] || serverTimestamp(),
      ...additionalData,
    };

    if (additionalData.bio) {
      data.bio = additionalData.bio;
    }

    const result = await setDoc(userRef, data, { merge: true });
    this.clearCachedProfile(firebaseUser.uid);
    return result;
  }

  private getCachedProfile(uid: string): AppUser | null {
    const inMemory = this.profileCache.get(uid);
    if (inMemory && Date.now() - inMemory.ts < this.cacheTtlMs) {
      return inMemory.data;
    }

    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.profileStorageKey(uid));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: AppUser; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(this.profileStorageKey(uid));
        return null;
      }
      this.profileCache.set(uid, { data: parsed.data, ts: parsed.ts });
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedProfile(uid: string, data: AppUser) {
    const entry = { data, ts: Date.now() };
    this.profileCache.set(uid, entry);
    this.safeSetCacheItem(this.profileStorageKey(uid), entry);
  }

  private clearCachedProfile(uid: string) {
    this.profileCache.delete(uid);
    this.safeRemoveItem(this.profileStorageKey(uid));
  }

  private profileStorageKey(uid: string) {
    return `userProfile:${uid}`;
  }

  private storageAvailable() {
    return typeof window !== 'undefined' && !!window.localStorage;
  }

  private safeSetItem(key: string, value: string) {
    if (!this.storageAvailable()) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn('LocalStorage write failed:', err);
      return false;
    }
  }

  private safeGetItem(key: string) {
    if (!this.storageAvailable()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      console.warn('LocalStorage read failed:', err);
      return null;
    }
  }

  private safeRemoveItem(key: string) {
    if (!this.storageAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn('LocalStorage remove failed:', err);
    }
  }

  private safeSetCacheItem(key: string, entry: { data: AppUser; ts: number }) {
    if (!this.storageAvailable()) return;
    try {
      this.enforceProfileStorageQuota();
      window.localStorage.setItem(key, JSON.stringify(entry));
    } catch (err) {
      console.warn('LocalStorage write failed, using memory-only cache:', err);
      this.evictOldestProfileEntries(1);
      try {
        window.localStorage.setItem(key, JSON.stringify(entry));
      } catch (retryErr) {
        console.warn('LocalStorage retry failed, keeping memory-only cache:', retryErr);
      }
    }
  }

  private enforceProfileStorageQuota() {
    if (!this.storageAvailable()) return;
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith('userProfile:'));
    if (keys.length < this.maxProfileCacheEntries) return;
    const entries = keys
      .map((key) => ({ key, ts: this.readCacheTimestamp(key) }))
      .sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, entries.length - this.maxProfileCacheEntries + 1);
    toRemove.forEach((entry) => this.safeRemoveItem(entry.key));
  }

  private evictOldestProfileEntries(count: number) {
    if (!this.storageAvailable()) return;
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith('userProfile:'));
    if (keys.length === 0) return;
    const entries = keys
      .map((key) => ({ key, ts: this.readCacheTimestamp(key) }))
      .sort((a, b) => a.ts - b.ts);
    entries.slice(0, count).forEach((entry) => this.safeRemoveItem(entry.key));
  }

  private readCacheTimestamp(key: string) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { ts?: number };
      return typeof parsed?.ts === 'number' ? parsed.ts : 0;
    } catch {
      return 0;
    }
  }

  private requiresEmailVerification(firebaseUser: User): boolean {
    const providerIds = firebaseUser.providerData.map((provider) => provider.providerId);
    const isPasswordAccount = providerIds.includes('password') || providerIds.length === 0;
    return isPasswordAccount && !firebaseUser.emailVerified;
  }

  private getEmailVerificationActionCodeSettings(): ActionCodeSettings {
    const appBaseUrl = this.resolveVerificationAppBaseUrl();
    return {
      url: `${appBaseUrl}/verify-email`,
      handleCodeInApp: true,
    };
  }

  private resolveVerificationAppBaseUrl(): string {
    if (typeof window !== 'undefined' && !environment.production) {
      return window.location.origin.replace(/\/+$/, '');
    }

    const configured = environment.appBaseUrl?.trim();
    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    return 'https://bemyteammate.eu';
  }

  private async sendVerificationEmailWithFallback(firebaseUser: User) {
    const actionCodeSettings = this.getEmailVerificationActionCodeSettings();
    const retryWithoutSettingsCodes = new Set(['auth/argument-error']);

    try {
      if (actionCodeSettings) {
        await sendEmailVerification(firebaseUser, actionCodeSettings);
      } else {
        await sendEmailVerification(firebaseUser);
      }
      console.log('Verification email sent');
    } catch (error: any) {
      if (actionCodeSettings && retryWithoutSettingsCodes.has(error?.code)) {
        console.warn(
          'Custom verification link failed, retrying with default Firebase action handler:',
          error
        );
        await sendEmailVerification(firebaseUser);
        console.log('Verification email sent (fallback handler)');
        return;
      }
      throw error;
    }
  }

  private createEmailNotVerifiedError() {
    const error = new Error('Az email cim meg nincs megerősítve.');
    (error as any).code = 'auth/email-not-verified';
    return error;
  }

  private toSafeError(error: any, fallbackMessage?: string) {
    const safeMessage = this.getSafeErrorMessage(
      error,
      fallbackMessage || 'Váratlan hiba történt. Kérlek próbáld újra később.'
    );
    const safeError = new Error(safeMessage);
    if (error?.code) {
      (safeError as any).code = error.code;
    }
    return safeError;
  }

  private getSafeErrorMessage(error: any, fallbackMessage: string) {
    const errorCode = error?.code || 'unknown';
    const errorMessages: Record<string, string> = {
      'auth/email-not-verified': 'Az email cím még nincs megerősítve.',
      'auth/wrong-password': 'Hibás jelenlegi jelszó.',
      'auth/weak-password': 'Az új jelszó túl gyenge.',
      'auth/user-not-found': 'A felhasználó nem található.',
      'auth/invalid-email': 'Érvénytelen e-mail cím.',
      'auth/email-already-in-use': 'Ez az e-mail cím már használatban van.',
      'auth/popup-closed-by-user': 'A bejelentkezési ablak bezárult.',
      'auth/cancelled-popup-request': 'A bejelentkezési ablak már meg van nyitva.',
      'auth/too-many-requests': 'Túl sok próbálkozás. Próbáld újra később.',
      'auth/network-request-failed': 'Hálózati hiba. Ellenőrizd a kapcsolatot.',
      'auth/requires-recent-login': 'A művelethez újra be kell jelentkezned.',
      'auth/unauthorized-continue-uri': 'A verifikációs link domain nincs engedélyezve.',
      'auth/invalid-continue-uri': 'Érvénytelen verifikációs visszairányítási URL.',
      'auth/missing-continue-uri': 'Hiányzik a verifikációs visszairányítási URL.',
      'permission-denied': 'Nincs jogosultságod ehhez a művelethez.',
      'unauthenticated': 'Bejelentkezés szükséges.',
      unavailable: 'A szolgáltatás jelenleg nem érhető el.',
    };

    return errorMessages[errorCode] || fallbackMessage;
  }
}
