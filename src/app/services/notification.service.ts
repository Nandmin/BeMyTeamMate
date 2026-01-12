import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  getDocs,
  query,
  where,
  documentId,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collectionData,
} from '@angular/fire/firestore';
import { getMessaging, getToken, deleteToken, onMessage } from 'firebase/messaging';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { AppNotification, NotificationType } from '../models/notification.model';
import { Observable, of } from 'rxjs';

interface GroupNotificationPayload {
  type: NotificationType;
  groupId: string;
  title: string;
  body: string;
  link?: string;
  eventId?: string;
  actorId?: string;
  actorName?: string;
  actorPhoto?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private tokenStorageKey = 'fcmToken';

  watchNotifications(uid: string): Observable<AppNotification[]> {
    if (!uid) return of([]);
    const notificationsRef = collection(this.firestore, `users/${uid}/notifications`);
    const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(20));
    return collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>;
  }

  isPushEnabled() {
    if (!this.canUsePush()) return false;
    return (
      Notification.permission === 'granted' && !!window.localStorage.getItem(this.tokenStorageKey)
    );
  }

  async markAllAsRead(uid: string) {
    if (!uid) return;
    const notificationsRef = collection(this.firestore, `users/${uid}/notifications`);
    const q = query(notificationsRef, where('read', '==', false), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(this.firestore);
    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
  }

  async enablePushForCurrentUser() {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');
    if (!this.canUsePush()) throw new Error('Push not supported in this browser');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Push permission denied');

    const token = await this.getOrCreateToken();
    if (!token) throw new Error('Unable to get FCM token');

    await updateDoc(doc(this.firestore, `users/${user.uid}`), {
      fcmTokens: arrayUnion(token),
    });
    window.localStorage.setItem(this.tokenStorageKey, token);
    return token;
  }

  async disablePushForCurrentUser() {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');
    if (!this.canUsePush()) return;

    const token = window.localStorage.getItem(this.tokenStorageKey);
    if (!token) return;

    const messaging = getMessaging();
    await deleteToken(messaging);
    await updateDoc(doc(this.firestore, `users/${user.uid}`), {
      fcmTokens: arrayRemove(token),
    });
    window.localStorage.removeItem(this.tokenStorageKey);
  }

  async syncTokenForCurrentUser() {
    const user = this.authService.currentUser();
    if (!user) return;
    if (!this.canUsePush()) return;

    const stored = window.localStorage.getItem(this.tokenStorageKey);
    if (stored) {
      await updateDoc(doc(this.firestore, `users/${user.uid}`), {
        fcmTokens: arrayUnion(stored),
      });
      return;
    }

    if (Notification.permission !== 'granted') return;
    const token = await this.getOrCreateToken();
    if (!token) return;
    await updateDoc(doc(this.firestore, `users/${user.uid}`), {
      fcmTokens: arrayUnion(token),
    });
    window.localStorage.setItem(this.tokenStorageKey, token);
  }

  listenForForegroundMessages() {
    if (!this.canUsePush()) return;
    const messaging = getMessaging();
    onMessage(messaging, () => {
      // Foreground messages are handled by Firestore notifications already.
    });
  }

  async notifyGroupMembers(payload: GroupNotificationPayload, excludeUserIds: string[] = []) {
    const membersRef = collection(this.firestore, `groups/${payload.groupId}/members`);
    const membersSnap = await getDocs(membersRef);
    const memberIds = membersSnap.docs.map((d) => d.data()['userId']).filter(Boolean) as string[];
    const targetIds = memberIds.filter((id) => !excludeUserIds.includes(id));
    if (targetIds.length === 0) return;

    await this.writeNotifications(targetIds, payload);
    await this.sendPushToMembers(targetIds, payload);
  }

  private async writeNotifications(userIds: string[], payload: GroupNotificationPayload) {
    const chunks = this.chunkArray(userIds, 400);
    for (const chunk of chunks) {
      const batch = writeBatch(this.firestore);
      chunk.forEach((uid) => {
        const notificationRef = doc(collection(this.firestore, `users/${uid}/notifications`));
        const data: AppNotification = {
          type: payload.type,
          groupId: payload.groupId,
          eventId: payload.eventId,
          title: payload.title,
          body: payload.body,
          link: payload.link,
          createdAt: serverTimestamp(),
          read: false,
          actorId: payload.actorId,
          actorName: payload.actorName,
          actorPhoto: payload.actorPhoto ?? null,
        };
        batch.set(notificationRef, data);
      });
      await batch.commit();
    }
  }

  private async sendPushToMembers(userIds: string[], payload: GroupNotificationPayload) {
    const tokens = await this.collectTokens(userIds);
    if (tokens.length === 0) return;
    if (!this.isValidPushWorkerUrl(environment.cloudflareWorkerUrl)) return;

    const body = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        groupId: payload.groupId,
        eventId: payload.eventId || '',
        link: payload.link || '',
        type: payload.type,
      },
    };

    try {
      await fetch(environment.cloudflareWorkerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.warn('Push dispatch failed:', error);
    }
  }

  private async collectTokens(userIds: string[]): Promise<string[]> {
    const chunks = this.chunkArray(userIds, 10);
    const tokens: string[] = [];
    for (const chunk of chunks) {
      const q = query(collection(this.firestore, 'users'), where(documentId(), 'in', chunk));
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as { fcmTokens?: string[] };
        if (Array.isArray(data.fcmTokens)) {
          tokens.push(...data.fcmTokens);
        }
      });
    }
    return Array.from(new Set(tokens));
  }

  private async getOrCreateToken() {
    const existing = window.localStorage.getItem(this.tokenStorageKey);
    if (existing) return existing;
    if (!environment.firebase.vapidKey || environment.firebase.vapidKey === 'YOUR_VAPID_KEY') {
      throw new Error('Missing VAPID key configuration');
    }
    const messaging = getMessaging();

    // Register the service worker
    await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    // Wait for the service worker to be active
    const registration = await navigator.serviceWorker.ready;

    if (!registration.active) {
      throw new Error('Push service worker registration failed to activate.');
    }

    const token = await getToken(messaging, {
      vapidKey: environment.firebase.vapidKey,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  }

  private canUsePush() {
    return (
      typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
    );
  }

  private chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private isValidPushWorkerUrl(value?: string) {
    if (!value) return false;
    if (value.includes('your-worker.workers.dev')) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
