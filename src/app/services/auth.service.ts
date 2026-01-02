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
import { Firestore, doc, setDoc, getDoc, serverTimestamp } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { from, Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

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

  constructor() {
    // Sync signal with auth state (optional, for easier template usage)
    this.user$.subscribe((u) => this.currentUser.set(u));
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

  async updateProfile(displayName: string, photoURL?: string) {
    const u = this.auth.currentUser;
    if (u) {
      await updateProfile(u, { displayName, photoURL });
      await this.updateUserData(u); // Sync to Firestore
    }
  }

  // --- Firestore User Data Logic ---
  private async updateUserData(user: User, additionalData: any = {}) {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const data = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || additionalData.username || null,
      photoURL: user.photoURL,
      lastLogin: serverTimestamp(),
      ...additionalData,
    };

    // Use setDoc with merge: true to avoid overwriting existing data completely
    // but update lastLogin
    return setDoc(userRef, data, { merge: true });
  }
}
