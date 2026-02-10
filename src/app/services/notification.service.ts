import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  collectionData,
} from '@angular/fire/firestore';
import { AppCheck } from '@angular/fire/app-check';
import { getMessaging, getToken, deleteToken, onMessage } from 'firebase/messaging';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { AppNotification, NotificationType } from '../models/notification.model';
import { Observable, of, defer, concat } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getAppCheckTokenOrNull } from '../utils/app-check.util';

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
  private appCheck = inject(AppCheck, { optional: true });
  private authService = inject(AuthService);
  private tokenStorageKey = 'fcmToken';
  private notificationCacheTtlMs = 60 * 1000;
  private memberCacheTtlMs = 2 * 60 * 1000;
  private readonly maxCacheEntries = 100;
  private notificationCache = new Map<string, { data: AppNotification[]; ts: number }>();
  private memberIdsCache = new Map<string, { data: string[]; ts: number }>();
  private foregroundListenerInitialized = false;

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

    await setDoc(
      this.getPushTokensDocRef(user.uid),
      {
        tokens: arrayUnion(token),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await this.clearLegacyFcmTokensField(user.uid);
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
    await setDoc(
      this.getPushTokensDocRef(user.uid),
      {
        tokens: arrayRemove(token),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await this.clearLegacyFcmTokensField(user.uid);
    this.safeRemoveItem(this.tokenStorageKey);
  }

  async syncTokenForCurrentUser() {
    const user = this.authService.currentUser();
    if (!user) return;
    if (!this.canUsePush()) return;

    const stored = this.safeGetItem(this.tokenStorageKey);
    if (stored) {
      await setDoc(
        this.getPushTokensDocRef(user.uid),
        {
          tokens: arrayUnion(stored),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await this.clearLegacyFcmTokensField(user.uid);
      return;
    }

    if (Notification.permission !== 'granted') return;
    const token = await this.getOrCreateToken();
    if (!token) return;
    await setDoc(
      this.getPushTokensDocRef(user.uid),
      {
        tokens: arrayUnion(token),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await this.clearLegacyFcmTokensField(user.uid);
    this.safeSetItem(this.tokenStorageKey, token);
  }

  listenForForegroundMessages() {
    if (!this.canUsePush()) return;
    if (this.foregroundListenerInitialized) return;
    this.foregroundListenerInitialized = true;
    const messaging = getMessaging();
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || 'Értesítés';
      const body = payload.notification?.body || '';
      const data = (payload.data || {}) as Record<string, string>;
      void this.showForegroundNotification(title, body, data);
    });
  }

  async notifyGroupMembers(payload: GroupNotificationPayload, excludeUserIds: string[] = []) {
    const memberIds = await this.getGroupMemberIds(payload.groupId);
    const targetIds = memberIds.filter((id) => !excludeUserIds.includes(id));
    if (targetIds.length === 0) return;

    await this.writeNotifications(targetIds, payload);
    await this.sendPush(payload, targetIds);
  }

  async notifyUsers(userIds: string[], payload: GroupNotificationPayload) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return;
    await this.writeNotifications(uniqueUserIds, payload);
    await this.sendPush(payload, uniqueUserIds);
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

  private async sendPush(payload: GroupNotificationPayload, targetUserIds: string[] = []) {
    if (!payload.groupId) return;
    if (!this.isValidPushWorkerUrl(environment.cloudflareWorkerUrl)) return;
    const uniqueTargetUserIds = Array.from(new Set(targetUserIds.filter(Boolean)));

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
    const chunks = uniqueTargetUserIds.length > 0
      ? this.chunkArray(uniqueTargetUserIds, 200)
      : [[]];

    try {
      const appCheckToken = await getAppCheckTokenOrNull(this.appCheck);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }
      for (const chunk of chunks) {
        const body: Record<string, unknown> = {
          groupId: payload.groupId,
          eventId: payload.eventId || '',
          type: payload.type,
          title: payload.title,
          body: payload.body,
          writeInApp: false,
        };
        if (payload.link) body['link'] = payload.link;
        if (chunk.length > 0) body['targetUserIds'] = chunk;

        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Push dispatch failed with status:', response.status, errorText);
        }
      }
    } catch (error) {
      console.warn('Push dispatch network/logic error:', error);
    }
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

  private getPushTokensDocRef(uid: string) {
    return doc(this.firestore, `users/${uid}/private/pushTokens`);
  }

  private async clearLegacyFcmTokensField(uid: string) {
    try {
      await updateDoc(doc(this.firestore, `users/${uid}`), {
        fcmTokens: deleteField(),
      });
    } catch (error) {
      console.warn('Legacy fcmTokens cleanup failed:', error);
    }
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

  private async showForegroundNotification(
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    if (!this.canUsePush()) return;
    if (Notification.permission !== 'granted') return;

    const link = typeof data?.['link'] === 'string' ? data['link'] : '';
    const notificationData: Record<string, string> = { ...(data || {}) };
    if (link) notificationData['link'] = link;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title || 'Értesítés', {
          body: body || '',
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          data: notificationData,
          tag: notificationData['type'] || 'general',
        });
        return;
      }
    } catch (error) {
      console.warn('Foreground notification via service worker failed:', error);
    }

    try {
      const instance = new Notification(title || 'Értesítés', {
        body: body || '',
        icon: '/favicon.ico',
      });
      if (link) {
        instance.onclick = () => {
          window.focus();
          window.location.assign(link);
          instance.close();
        };
      }
    } catch (error) {
      console.warn('Foreground notification fallback failed:', error);
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
