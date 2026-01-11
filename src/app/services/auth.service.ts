import { Injectable, inject, signal, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
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
import { defer, Observable, of, firstValueFrom, from } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { AppUser } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private cacheTtlMs = 5 * 60 * 1000;
  private profileCache = new Map<string, { data: AppUser; ts: number }>();

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
      })
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
    } catch (error) {
      console.error('Password change error:', error);
      throw error;
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
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  }

  // --- Email/Password Register ---
  async registerWithEmail(email: string, pass: string, username?: string, additionalData?: any) {
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, pass);
      if (username) {
        await updateProfile(credential.user, { displayName: username });
      }
      await this.updateUserData(credential.user, { username, ...additionalData }); // Save extra data

      // --- Send Email Verification ---
      try {
        await sendEmailVerification(credential.user);
        console.log('Verification email sent');
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
      }

      this.router.navigate(['/']);
      return credential.user;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  // --- Email/Password Login ---
  async loginWithEmail(email: string, pass: string) {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, pass);
      await this.updateUserData(credential.user);
      this.router.navigate(['/']);
      return credential.user;
    } catch (error) {
      console.error('Email login error:', error);
      throw error;
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
      window.localStorage.setItem('emailForSignIn', email);
      return true;
    } catch (error) {
      console.error('Magic link error:', error);
      throw error;
    }
  }

  async verifyMagicLink() {
    if (isSignInWithEmailLink(this.auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        try {
          const result = await signInWithEmailLink(this.auth, email, window.location.href);
          window.localStorage.removeItem('emailForSignIn');
          await this.updateUserData(result.user);
          this.router.navigate(['/']);
          return result.user;
        } catch (error) {
          console.error('Link verification error:', error);
          throw error;
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
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
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
      await updateProfile(u, { displayName, photoURL });
      await this.updateUserData(u, { bio, photoURL }); // Sync to Firestore
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
        })
      );
    });
  }

  // --- Firestore User Data Logic ---
  private async updateUserData(firebaseUser: any, additionalData: any = {}) {
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    const existingSnap = await getDoc(userRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    const data: any = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName:
        firebaseUser.displayName ||
        existingData['displayName'] ||
        additionalData.username ||
        'Névtelen',
      photoURL: firebaseUser.photoURL || existingData['photoURL'] || null,
      lastLogin: serverTimestamp(),
      role: existingData['role'] || 'user',
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
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.profileStorageKey(uid), JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private clearCachedProfile(uid: string) {
    this.profileCache.delete(uid);
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(this.profileStorageKey(uid));
    } catch {
      // ignore cache errors
    }
  }

  private profileStorageKey(uid: string) {
    return `userProfile:${uid}`;
  }
}
