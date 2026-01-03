import { Injectable, inject, signal } from '@angular/core';
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
import { Firestore, doc, setDoc, serverTimestamp, docData } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { from, Observable, of, firstValueFrom } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { AppUser } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  // Expose the current user as a signal or observable
  user$ = user(this.auth);
  currentUser = signal<User | null>(null);

  // Expose the full user profile data from Firestore
  userData$: Observable<AppUser | null> = this.user$.pipe(
    switchMap((u) => {
      if (u) {
        const ref = doc(this.firestore, `users/${u.uid}`);
        return docData(ref, { idField: 'uid' }) as Observable<AppUser>;
      } else {
        return of(null);
      }
    })
  );
  fullCurrentUser = signal<AppUser | null>(null);

  constructor() {
    // Sync signal with auth state (optional, for easier template usage)
    this.user$.subscribe((u) => this.currentUser.set(u));
    this.userData$.subscribe((u) => this.fullCurrentUser.set(u));
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
    const userRef = doc(this.firestore, `users/${uid}`);
    return docData(userRef, { idField: 'uid' }) as Observable<AppUser>;
  }

  // --- Firestore User Data Logic ---
  private async updateUserData(firebaseUser: any, additionalData: any = {}) {
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    const existingData = (await firstValueFrom(docData(userRef))) || {};

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

    return setDoc(userRef, data, { merge: true });
  }
}
