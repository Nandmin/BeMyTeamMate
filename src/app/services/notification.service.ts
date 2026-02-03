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

export interface GroupNotificationPayload {
  type: NotificationType;
  groupId: string;
  title: string;
  body: string;
  link?: string;
  eventId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
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
  private readonly maxCacheEntries = 100;
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
      const streaming$ = realtime$.pipe(tap((items) => this.setCachedNotifications(uid, items)));
      return cached ? concat(of(cached), streaming$) : streaming$;
    });
  }

  isPushEnabled() {
    if (!this.canUsePush()) return false;
    return (
      Notification.permission === 'granted' && !!this.safeGetItem(this.tokenStorageKey)
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
    this.safeSetItem(this.tokenStorageKey, token);
    return token;
  }

  async disablePushForCurrentUser() {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');
    if (!this.canUsePush()) return;

    const token = this.safeGetItem(this.tokenStorageKey);
    if (!token) return;

    const messaging = getMessaging();
    await deleteToken(messaging);
    await updateDoc(doc(this.firestore, `users/${user.uid}`), {
      fcmTokens: arrayRemove(token),
    });
    this.safeRemoveItem(this.tokenStorageKey);
  }

  async syncTokenForCurrentUser() {
    const user = this.authService.currentUser();
    if (!user) return;
    if (!this.canUsePush()) return;

    const stored = this.safeGetItem(this.tokenStorageKey);
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
    this.safeSetItem(this.tokenStorageKey, token);
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

    await this.notifyUsers(targetIds, payload);
  }

  async notifyUsers(userIds: string[], payload: GroupNotificationPayload) {
    if (userIds.length === 0) return;
    await this.writeNotifications(userIds, payload);
    await this.sendPushToMembers(userIds, payload);
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
          eventId: payload.eventId ?? null,
          title: payload.title,
          body: payload.body,
          link: payload.link || '',
          createdAt: serverTimestamp(),
          read: false,
          actorId: payload.actorId || null,
          actorName: payload.actorName || 'Ismeretlen',
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

    const user = this.authService.currentUser();
    let authToken = '';
    if (user) {
      try {
        authToken = await user.getIdToken();
      } catch (err) {
        console.error('Push: Error getting ID token:', err);
      }
    }

    // Ensure environment URL is used directly
    const url = environment.cloudflareWorkerUrl;

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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Push dispatch failed with status:', response.status, errorText);
      }
    } catch (error) {
      console.warn('Push dispatch network/logic error:', error);
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
    const existing = this.safeGetItem(this.tokenStorageKey);
    if (existing) return existing;
    if (!environment.firebase.vapidKey || environment.firebase.vapidKey === 'YOUR_VAPID_KEY') {
      throw new Error('Missing VAPID key configuration');
    }
    const messaging = getMessaging();

    // Wait for the service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    if (!registration.active) {
      throw new Error('Push service worker registration failed to activate.');
    }

    try {
      const token = await getToken(messaging, {
        vapidKey: environment.firebase.vapidKey,
        serviceWorkerRegistration: registration,
      });
      return token || null;
    } catch (err: any) {
      // If we get an error about unsubscribing or invalid registration, try to clear and retry
      if (
        err?.code === 'messaging/invalid-registration-token' ||
        err?.message?.includes('unsubscribe') ||
        err?.message?.includes('registration')
      ) {
        console.warn('Stale push registration detected, attempting to reset:', err.message);
        try {
          await deleteToken(messaging);
          const newToken = await getToken(messaging, {
            vapidKey: environment.firebase.vapidKey,
            serviceWorkerRegistration: registration,
          });
          return newToken || null;
        } catch (retryErr) {
          console.error('Failed to recover from stale push registration:', retryErr);
          // If retry fails, throw the original error or the new one
          throw this.toSafeError(err, 'Nem sikerült újra létrehozni az értesítési tokent.');
        }
      }
      throw this.toSafeError(err, 'Nem sikerült létrehozni az értesítési tokent.');
    }
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
    this.safeSetCacheItem(this.notificationStorageKey(uid), entry);
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

  private storageAvailable() {
    return typeof window !== 'undefined' && !!window.localStorage;
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

  private safeRemoveItem(key: string) {
    if (!this.storageAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn('LocalStorage remove failed:', err);
    }
  }

  private safeSetCacheItem(key: string, entry: { data: AppNotification[]; ts: number }) {
    if (!this.storageAvailable()) return;
    try {
      this.enforceStorageQuota();
      window.localStorage.setItem(key, JSON.stringify(entry));
    } catch (err) {
      console.warn('LocalStorage write failed, using memory-only cache:', err);
      this.evictOldestCacheEntries(1);
      try {
        window.localStorage.setItem(key, JSON.stringify(entry));
      } catch (retryErr) {
        console.warn('LocalStorage retry failed, keeping memory-only cache:', retryErr);
      }
    }
  }

  private enforceStorageQuota() {
    if (!this.storageAvailable()) return;
    const keys = this.getCacheKeys();
    if (keys.length < this.maxCacheEntries) return;
    const entries = keys
      .map((key) => ({ key, ts: this.readCacheTimestamp(key) }))
      .sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, entries.length - this.maxCacheEntries + 1);
    toRemove.forEach((entry) => this.safeRemoveItem(entry.key));
  }

  private evictOldestCacheEntries(count: number) {
    if (!this.storageAvailable()) return;
    const keys = this.getCacheKeys();
    if (keys.length === 0) return;
    const entries = keys
      .map((key) => ({ key, ts: this.readCacheTimestamp(key) }))
      .sort((a, b) => a.ts - b.ts);
    entries.slice(0, count).forEach((entry) => this.safeRemoveItem(entry.key));
  }

  private getCacheKeys() {
    return Object.keys(window.localStorage).filter((key) => key.startsWith('notifications:'));
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
      'messaging/unsupported-browser': 'A böngésződ nem támogatja a push értesítéseket.',
      'messaging/permission-blocked': 'Az értesítések engedélyezése le van tiltva a böngészőben.',
      'messaging/permission-default': 'Az értesítési engedély nincs megadva.',
      'messaging/invalid-vapid-key': 'Értesítési beállítási hiba történt.',
      'messaging/invalid-registration-token': 'Érvénytelen értesítési token.',
      'messaging/token-unsubscribe-failed': 'Nem sikerült frissíteni az értesítési tokent.',
      'network-request-failed': 'Hálózati hiba. Ellenőrizd a kapcsolatot.',
      'permission-denied': 'Nincs jogosultságod ehhez a művelethez.',
      unauthenticated: 'Bejelentkezés szükséges.',
      unavailable: 'A szolgáltatás jelenleg nem érhető el.',
    };

    return errorMessages[errorCode] || fallbackMessage;
  }
}
