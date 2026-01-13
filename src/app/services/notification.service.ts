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
import { Observable, of, defer, concat } from 'rxjs';
import { tap } from 'rxjs/operators';

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
  private notificationCacheTtlMs = 60 * 1000;
  private memberCacheTtlMs = 2 * 60 * 1000;
  private tokenCacheTtlMs = 5 * 60 * 1000;
  private notificationCache = new Map<string, { data: AppNotification[]; ts: number }>();
  private memberIdsCache = new Map<string, { data: string[]; ts: number }>();
  private tokenCache = new Map<string, { data: string[]; ts: number }>();

  watchNotifications(uid: string): Observable<AppNotification[]> {
    if (!uid) return of([]);
    return defer(() => {
      const cached = this.getCachedNotifications(uid);
      const notificationsRef = collection(this.firestore, `users/${uid}/notifications`);
      const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(20));
      const realtime$ = collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>;
      const streaming$ = realtime$.pipe(
        tap((items) => this.setCachedNotifications(uid, items))
      );
      return cached ? concat(of(cached), streaming$) : streaming$;
    });
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

  async deleteAllNotifications(uid: string) {
    if (!uid) return;
    const notificationsRef = collection(this.firestore, `users/${uid}/notifications`);
    while (true) {
      const q = query(notificationsRef, limit(400));
      const snap = await getDocs(q);
      if (snap.empty) break;
      const batch = writeBatch(this.firestore);
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }
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
    const memberIds = await this.getGroupMemberIds(payload.groupId);
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
    const tokens: string[] = [];
    const missingIds: string[] = [];

    userIds.forEach((uid) => {
      const cached = this.getCachedTokens(uid);
      if (cached) {
        tokens.push(...cached);
      } else {
        missingIds.push(uid);
      }
    });

    if (missingIds.length > 0) {
      const chunks = this.chunkArray(missingIds, 10);
      for (const chunk of chunks) {
        const q = query(collection(this.firestore, 'users'), where(documentId(), 'in', chunk));
        const snap = await getDocs(q);
        const found = new Set<string>();
        snap.docs.forEach((docSnap) => {
          found.add(docSnap.id);
          const data = docSnap.data() as { fcmTokens?: string[] };
          const userTokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
          this.setCachedTokens(docSnap.id, userTokens);
          tokens.push(...userTokens);
        });
        chunk.forEach((uid) => {
          if (!found.has(uid)) {
            this.setCachedTokens(uid, []);
          }
        });
      }
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

    // Wait for the service worker to be ready (already registered in app.config.ts)
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

  private getCachedNotifications(uid: string): AppNotification[] | null {
    const inMemory = this.notificationCache.get(uid);
    if (inMemory && Date.now() - inMemory.ts < this.notificationCacheTtlMs) {
      return inMemory.data;
    }
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.notificationStorageKey(uid));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: AppNotification[]; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.notificationCacheTtlMs) {
        window.localStorage.removeItem(this.notificationStorageKey(uid));
        return null;
      }
      this.notificationCache.set(uid, { data: parsed.data, ts: parsed.ts });
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedNotifications(uid: string, items: AppNotification[]) {
    const entry = { data: items, ts: Date.now() };
    this.notificationCache.set(uid, entry);
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.notificationStorageKey(uid), JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private notificationStorageKey(uid: string) {
    return `notifications:${uid}`;
  }

  private getCachedMemberIds(groupId: string): string[] | null {
    const entry = this.memberIdsCache.get(groupId);
    if (entry && Date.now() - entry.ts < this.memberCacheTtlMs) return entry.data;
    return null;
  }

  private setCachedMemberIds(groupId: string, memberIds: string[]) {
    this.memberIdsCache.set(groupId, { data: memberIds, ts: Date.now() });
  }

  private getCachedTokens(uid: string): string[] | null {
    const entry = this.tokenCache.get(uid);
    if (entry && Date.now() - entry.ts < this.tokenCacheTtlMs) return entry.data;
    return null;
  }

  private setCachedTokens(uid: string, tokens: string[]) {
    this.tokenCache.set(uid, { data: tokens, ts: Date.now() });
  }

  private async getGroupMemberIds(groupId: string): Promise<string[]> {
    const cached = this.getCachedMemberIds(groupId);
    if (cached) return cached;

    const membersRef = collection(this.firestore, `groups/${groupId}/members`);
    const membersSnap = await getDocs(membersRef);
    const memberIds = membersSnap.docs.map((d) => d.data()['userId']).filter(Boolean) as string[];
    this.setCachedMemberIds(groupId, memberIds);
    return memberIds;
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
