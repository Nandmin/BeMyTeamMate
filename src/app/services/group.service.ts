import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  serverTimestamp,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  increment,
  deleteDoc,
  collectionGroup,
  writeBatch,
  documentId,
  collectionData,
  limit,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { Observable, of, from, defer, concat } from 'rxjs';
import { tap, switchMap, map, catchError } from 'rxjs/operators';

export interface Group {
  id?: string;
  name: string;
  type: 'open' | 'closed';
  ownerId: string;
  ownerName: string;
  ownerPhoto?: string | null;
  createdAt: any;
  memberCount: number;
  description?: string;
  image?: number | string;
}

export interface GroupMember {
  id?: string;
  userId: string;
  name: string;
  photo?: string | null;
  role: string;
  isAdmin: boolean;
  joinedAt: any;
  skillLevel?: number;
  elo?: number;
}

export interface JoinRequest {
  id: string; // userId
  groupId: string;
  userId: string;
  userName: string;
  userPhoto?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private cacheTtlMs = 5 * 60 * 1000;
  private groupCache = new Map<string, { data: Group; ts: number }>();
  private groupsListCache: { data: Group[]; ts: number } | null = null;
  private userGroupsCache = new Map<string, { data: Group[]; ts: number }>();
  private listCacheVersion = this.readCacheVersion('groups:list:version');
  private groupItemCacheVersion = this.readCacheVersion('groups:item:version');
  private readonly maxCacheEntries = 100;

  private get groupsCollection() {
    return collection(this.firestore, 'groups');
  }

  private async writeGroupAuditLog(
    groupId: string,
    action: string,
    meta: Record<string, string> = {},
  ) {
    const user = this.authService.currentUser();
    if (!user) return;
    try {
      const logRef = doc(collection(this.firestore, `groups/${groupId}/auditLogs`));
      await setDoc(logRef, {
        groupId,
        actorId: user.uid,
        action,
        createdAt: serverTimestamp(),
        ...meta,
      });
    } catch (error) {
      console.warn('Audit log write failed:', error);
    }
  }

  async createGroup(name: string, type: 'open' | 'closed', description: string = '') {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in to create a group');

    const groupRef = doc(this.groupsCollection);
    const groupData: Omit<Group, 'id'> = {
      name,
      type,
      description,
      ownerId: user.uid,
      ownerName: user.displayName || 'Ismeretlen',
      ownerPhoto: user.photoURL || null,
      createdAt: serverTimestamp(),
      memberCount: 1, // The owner is the first member
      image: 0, // Default image id
    };

    const ownerMemberRef = doc(this.firestore, `groups/${groupRef.id}/members/${user.uid}`);
    await setDoc(groupRef, groupData);
    await setDoc(ownerMemberRef, {
      userId: user.uid,
      name: user.displayName || 'Ismeretlen',
      photo: user.photoURL || null,
      role: 'Csapatkapitány',
      isAdmin: true,
      joinedAt: serverTimestamp(),
      skillLevel: 100,
      elo: 1200,
    });
    await this.writeGroupAuditLog(groupRef.id, 'group_create', {
      groupName: name,
      groupType: type,
    });

    const fullGroup: Group = { id: groupRef.id, ...groupData };
    this.setCachedGroup(groupRef.id, fullGroup);
    this.invalidateGroupsListCache();
    this.invalidateUserGroupsCache(user.uid);
    return groupRef;
  }

  getGroups(forceRefresh = false): Observable<Group[]> {
    return defer(() =>
      this.authService.user$.pipe(
        switchMap((user) => {
          if (!user) return of([]);
          if (forceRefresh) {
            this.invalidateGroupsListCache();
          }
          const cached = this.getCachedGroupsList();
          if (cached) {
            return concat(of(cached), this.fetchGroupsList());
          }
          const q = query(this.groupsCollection, orderBy('createdAt', 'desc'));
          return from(getDocs(q)).pipe(
            map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }))),
            tap((groups) => this.setCachedGroupsList(groups)),
            catchError((err: any) => {
              console.error('getGroups error:', err);
              return of([]);
            }),
          );
        }),
      ),
    );
  }

  getUserGroups(userId?: string): Observable<Group[]> {
    const user$: Observable<any> = userId ? of({ uid: userId }) : this.authService.user$;

    return user$.pipe(
      switchMap((user: any) => {
        if (!user?.uid) return of([]);
        return this.getUserGroupsInternal(user.uid);
      }),
    );
  }

  getGroupsForMember(userId: string): Observable<Group[]> {
    return defer(() => {
      if (!userId) return of([]);

      // Strictly query MEMBERSHIP only.
      // If a user is owner but NOT in members (e.g. left), they should not see the group.
      const membersQuery = query(
        collectionGroup(this.firestore, 'members'),
        where('userId', '==', userId),
      );

      return from(getDocs(membersQuery)).pipe(
        switchMap((membersSnap) => {
          const ids = membersSnap.docs
            .map((d) => d.ref.parent?.parent?.id)
            .filter(Boolean) as string[];

          const uniqueIds = Array.from(new Set(ids));

          if (uniqueIds.length === 0) {
            return of([]);
          }

          return from(this.fetchGroupsByIds(uniqueIds)).pipe(
            map((groups) => groups.sort((a, b) => a.name.localeCompare(b.name))),
          );
        }),
      );
    });
  }

  getGroup(id: string): Observable<Group | undefined> {
    return defer(() => {
      const cached = this.getCachedGroup(id);
      if (cached) {
        return concat(of(cached), this.fetchGroupById(id));
      }
      const docRef = doc(this.firestore, `groups/${id}`);
      return from(getDoc(docRef)).pipe(
        map((snap) =>
          snap.exists() ? ({ id: snap.id, ...(snap.data() as Group) } as Group) : undefined,
        ),
        tap((group) => {
          if (group) this.setCachedGroup(id, group);
        }),
      );
    });
  }

  getGroupMembers(groupId: string): Observable<GroupMember[]> {
    return defer(() => {
      const membersCollection = collection(this.firestore, `groups/${groupId}/members`);
      const q = query(membersCollection, orderBy('joinedAt', 'asc'));
      return from(getDocs(q)).pipe(
        map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as GroupMember) }))),
        switchMap((members) => {
          const hasOwner = members.some((m) => m.role === 'Csapatkapitány');
          if (hasOwner) return of(members);

          return this.getGroup(groupId).pipe(
            map((group) => {
              if (!group) return members;
              const ownerMember: GroupMember = {
                id: 'owner-fallback',
                userId: group.ownerId,
                name: group.ownerName,
                photo: group.ownerPhoto,
                role: 'Csapatkapitány',
                isAdmin: true,
                joinedAt: group.createdAt,
                skillLevel: 100,
              };
              return [ownerMember, ...members];
            }),
          );
        }),
      );
    });
  }

  async joinGroup(groupId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User logged in required');

    await this.addMemberToGroup(groupId, {
      userId: user.uid,
      name: user.displayName || 'Ismeretlen',
      photo: user.photoURL || null,
      role: 'user',
      isAdmin: false,
      joinedAt: serverTimestamp(),
      skillLevel: 50,
    });
    await this.writeGroupAuditLog(groupId, 'member_join', {
      targetUserId: user.uid,
      targetUserName: user.displayName || 'Ismeretlen',
    });

    const group = await this.getGroupOnce(groupId);
    if (group) {
      await this.notificationService.notifyGroupMembers(
        {
          type: 'group_join',
          groupId,
          title: `${group.name} - Taglétszám változás`,
          body: `${user.displayName || 'Ismeretlen'} csatlakozott a csoporthoz.`,
          link: `/groups/${groupId}`,
          actorId: user.uid,
          actorName: user.displayName || 'Ismeretlen',
          actorPhoto: user.photoURL || null,
        },
        [user.uid],
      );
    }
  }

  async findGroupByName(name: string): Promise<Group | null> {
    const q = query(this.groupsCollection, where('name', '==', name), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...(snap.docs[0].data() as Group) };
  }

  async requestJoinGroup(groupId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    // Check if already member
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${user.uid}`);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) throw new Error('Már tag vagy ebben a csoportban.');

    // Check if request already exists
    const requestRef = doc(this.firestore, `groups/${groupId}/joinRequests/${user.uid}`);
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists()) throw new Error('Már elküldted a csatlakozási kérelmet.');

    const group = await this.getGroupOnce(groupId);
    if (!group) throw new Error('Csoport nem található');

    const requestData: JoinRequest = {
      id: user.uid,
      groupId,
      userId: user.uid,
      userName: user.displayName || 'Ismeretlen',
      userPhoto: user.photoURL || null,
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    await setDoc(requestRef, requestData);
    await this.writeGroupAuditLog(groupId, 'join_request', {
      targetUserId: user.uid,
      targetUserName: user.displayName || 'Ismeretlen',
    });

    // Notify Owner and Admins
    const members = await getDocs(collection(this.firestore, `groups/${groupId}/members`));
    const adminIds = members.docs
      .filter((d) => d.data()['isAdmin'] === true || d.id === group.ownerId) // Owner might not be marked isAdmin explicitly in members sometimes based on logic, but usually is. Checking ownerId is safe.
      .map((d) => d.data()['userId']);

    // Always include owner
    if (!adminIds.includes(group.ownerId)) adminIds.push(group.ownerId);

    const uniqueAdminIds = [...new Set(adminIds)];

    await this.notificationService.notifyUsers(uniqueAdminIds, {
      type: 'group_join', // using group_join type for now or add new type
      groupId,
      title: 'Csatlakozási kérelem',
      body: `${user.displayName || 'Valaki'} csatlakozni szeretne a(z) ${group.name} csoporthoz.`,
      link: `/groups/${groupId}/settings`,
      eventId: null, // Explicitly set to null to avoid undefined error
      actorId: user.uid,
      actorName: user.displayName || 'Ismeretlen',
      actorPhoto: user.photoURL || null,
    });
  }

  getJoinRequests(groupId: string): Observable<JoinRequest[]> {
    const requestsRef = collection(this.firestore, `groups/${groupId}/joinRequests`);
    const q = query(requestsRef, orderBy('createdAt', 'desc')); // orderBy might need index
    // To avoid index issues for now, maybe just getDocs or client side sort if small.
    // `createdAt` sorting usually works fine on single collection queries.
    return collectionData(q, { idField: 'id' }) as Observable<JoinRequest[]>;
  }

  async approveJoinRequest(requestId: string, groupId: string) {
    const requestRef = doc(this.firestore, `groups/${groupId}/joinRequests/${requestId}`);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) return;
    const request = requestSnap.data() as JoinRequest;

    await this.addMemberToGroup(groupId, {
      userId: request.userId,
      name: request.userName,
      photo: request.userPhoto,
      role: 'user',
      isAdmin: false,
      joinedAt: serverTimestamp(),
      skillLevel: 50,
      elo: 1200,
    });

    await deleteDoc(requestRef);
    await this.writeGroupAuditLog(groupId, 'join_approve', {
      targetUserId: request.userId,
      targetUserName: request.userName,
    });

    // Notify the user
    await this.notificationService.notifyUsers([request.userId], {
      type: 'group_join',
      groupId,
      title: 'Csatlakozási kérelem elfogadva',
      body: `Csatlakoztál a csoporthoz!`,
      link: `/groups/${groupId}`,
      eventId: null,
      actorId: this.authService.currentUser()?.uid,
    });
  }

  async rejectJoinRequest(requestId: string, groupId: string) {
    const group = await this.getGroupOnce(groupId);
    await this.notificationService.notifyUsers([requestId], {
      type: 'group_leave', // Using group_leave as a proxy for "not joined/rejected" or potentially new type
      groupId,
      title: 'Csatlakozási kérelem elutasítva',
      body: `Sajnos a(z) ${group?.name || 'csoport'} csatlakozási kérelmedet elutasították.`,
      link: `/groups`,
      eventId: null,
      actorId: this.authService.currentUser()?.uid,
      actorName: 'Rendszer',
      actorPhoto: null,
    });

    const requestRef = doc(this.firestore, `groups/${groupId}/joinRequests/${requestId}`);
    await deleteDoc(requestRef);
    await this.writeGroupAuditLog(groupId, 'join_reject', {
      targetUserId: requestId,
    });
  }

  private async addMemberToGroup(groupId: string, memberData: any) {
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberData.userId}`);
    // Check duplication protection again just in case
    const snap = await getDoc(memberRef);
    if (snap.exists()) return;

    await setDoc(memberRef, memberData);

    const groupRef = doc(this.firestore, `groups/${groupId}`);
    await updateDoc(groupRef, {
      memberCount: increment(1),
    });

    const group = await this.getGroupOnce(groupId);
    if (group) {
      const updatedGroup = { ...group, memberCount: (group.memberCount || 0) + 1 };
      this.setCachedGroup(groupId, updatedGroup);
      this.invalidateUserGroupsCache(memberData.userId); // Invalidate cache so next fetch gets fresh list
    }
  }

  // --- Group Management ---
  async updateGroup(groupId: string, data: Partial<Omit<Group, 'id' | 'ownerId' | 'createdAt'>>) {
    const groupRef = doc(this.firestore, `groups/${groupId}`);
    const result = await updateDoc(groupRef, data);
    await this.writeGroupAuditLog(groupId, 'group_update');
    const cached = this.getCachedGroup(groupId);
    if (cached) {
      const updated = { ...cached, ...data } as Group;
      this.setCachedGroup(groupId, updated);
    }
    const user = this.authService.currentUser();
    if (user) {
      // Updated group -> invalidate cache for owner/updater?
      this.invalidateUserGroupsCache(user.uid);
    }
    return result;
  }

  // --- Member Management ---
  async deleteGroup(groupId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    // Clean up subcollections first (client-side best effort)
    try {
      // Delete members
      const membersRef = collection(this.firestore, `groups/${groupId}/members`);
      const membersSnap = await getDocs(membersRef);
      const membersBatch = writeBatch(this.firestore);
      membersSnap.docs.forEach((doc) => membersBatch.delete(doc.ref));
      await membersBatch.commit();

      // Delete join requests
      const requestsRef = collection(this.firestore, `groups/${groupId}/joinRequests`);
      const requestsSnap = await getDocs(requestsRef);
      const requestsBatch = writeBatch(this.firestore);
      requestsSnap.docs.forEach((doc) => requestsBatch.delete(doc.ref));
      await requestsBatch.commit();

      // Delete events
      const eventsRef = collection(this.firestore, `groups/${groupId}/events`);
      const eventsSnap = await getDocs(eventsRef);
      const eventsBatch = writeBatch(this.firestore);
      eventsSnap.docs.forEach((doc) => eventsBatch.delete(doc.ref));
      await eventsBatch.commit();
    } catch (error) {
      console.warn('Error cleaning up subcollections:', error);
    }

    // Delete group document
    const groupRef = doc(this.firestore, `groups/${groupId}`);
    await deleteDoc(groupRef);
    await this.writeGroupAuditLog(groupId, 'group_delete');

    // Clear caches
    this.invalidateGroupsListCache();
    this.invalidateUserGroupsCache(user.uid);
    this.groupCache.delete(groupId);
    this.safeRemoveItem(this.groupStorageKey(groupId));
    this.bumpGroupItemCacheVersion();
  }

  async leaveGroup(groupId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    const group = await this.getGroupOnce(groupId);
    if (group?.ownerId === user.uid) {
      throw new Error('A csoport tulajdonosa nem lĂ©phet ki.');
    }

    const memberRef = doc(this.firestore, `groups/${groupId}/members/${user.uid}`);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) return;

    await this.removeMember(groupId, user.uid);
  }

  async removeMember(groupId: string, memberId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    // Delete the member document
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberId}`);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) return;
    const memberData = memberSnap.exists() ? (memberSnap.data() as GroupMember) : null;

    const group = await this.getGroupOnce(groupId);
    if (group && memberData?.userId) {
      await this.notificationService.notifyGroupMembers(
        {
          type: 'group_leave',
          groupId,
          title: `${group.name} - Taglétszám változás`,
          body: `${memberData.name || 'Ismeretlen'} kilépett a csoportból.`,
          link: `/groups/${groupId}`,
          actorId: memberData.userId,
          actorName: memberData.name || 'Ismeretlen',
          actorPhoto: memberData.photo || null,
        },
        [memberData.userId],
      );
    }

    await deleteDoc(memberRef);
    if (memberData?.userId) {
      await this.writeGroupAuditLog(groupId, 'member_remove', {
        targetUserId: memberData.userId,
        targetUserName: memberData.name || 'Ismeretlen',
      });
    }

    // Decrement member count
    const groupRef = doc(this.firestore, `groups/${groupId}`);
    await updateDoc(groupRef, {
      memberCount: increment(-1),
    });
    const cachedGroup = this.getCachedGroup(groupId);
    if (cachedGroup) {
      this.setCachedGroup(groupId, {
        ...cachedGroup,
        memberCount: Math.max((cachedGroup.memberCount || 0) - 1, 0),
      });
    }

    if (memberData?.userId) {
      // Removed userGroupRef deletion
      this.invalidateUserGroupsCache(memberData.userId);
    }
  }

  async updateMemberRole(
    groupId: string,
    memberId: string,
    data: { isAdmin: boolean; role: string },
  ) {
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberId}`);
    return updateDoc(memberRef, data);
  }

  private async getGroupOnce(groupId: string): Promise<Group | undefined> {
    const cached = this.getCachedGroup(groupId);
    if (cached) return cached;
    const snap = await getDoc(doc(this.firestore, `groups/${groupId}`));
    if (!snap.exists()) return undefined;
    const group = { id: snap.id, ...(snap.data() as Group) } as Group;
    this.setCachedGroup(groupId, group);
    return group;
  }

  //   private async upsertUserGroupSummary... removed
  //   private buildGroupSummary... removed

  private getUserGroupsInternal(uid: string): Observable<Group[]> {
    return defer(() => {
      // Bypass cache to ensure strict consistency and fix "phantom" groups issue
      // const cached = this.getCachedUserGroups(uid);
      // if (cached) return of(cached);

      // Use source of truth (Owned + Member)
      return from(this.fetchUserGroupsFromSource(uid)).pipe(
        tap((groups) => {
          this.setCachedUserGroups(uid, groups);
          groups.forEach((g) => g.id && this.setCachedGroup(g.id, g));
        }),
      );
    });
  }

  private async fetchUserGroupsFromSource(uid: string): Promise<Group[]> {
    // Strictly query MEMBERSHIP only.
    // We do NOT query ownedGroups separately.
    // Valid owners MUST be in the members collection.
    // If they left, they are out.

    const memberSnap = await getDocs(
      query(collectionGroup(this.firestore, 'members'), where('userId', '==', uid)),
    );

    const joinedIds = memberSnap.docs
      .map((d) => d.ref.parent?.parent?.id)
      .filter(Boolean) as string[];

    // Remove duplicates
    const uniqueIds = Array.from(new Set(joinedIds));

    const groups = await this.fetchGroupsByIds(uniqueIds);
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private async fetchGroupsByIds(ids: string[]): Promise<Group[]> {
    if (ids.length === 0) return [];
    const chunks = this.chunkArray(ids, 10);
    const groups: Group[] = [];
    for (const chunk of chunks) {
      const chunkSnap = await getDocs(
        query(this.groupsCollection, where(documentId(), 'in', chunk)),
      );
      for (const docSnap of chunkSnap.docs) {
        const group = { id: docSnap.id, ...(docSnap.data() as Group) };
        groups.push(group);
        this.setCachedGroup(docSnap.id, group);
      }
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  private getCachedGroup(groupId: string): Group | null {
    const inMemory = this.groupCache.get(groupId);
    if (inMemory && Date.now() - inMemory.ts < this.cacheTtlMs) return inMemory.data;
    if (inMemory) this.groupCache.delete(groupId);

    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.groupStorageKey(groupId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: Group; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(this.groupStorageKey(groupId));
        return null;
      }
      this.groupCache.set(groupId, { data: parsed.data, ts: parsed.ts });
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedGroup(groupId: string, group: Group) {
    const entry = { data: group, ts: Date.now() };
    this.groupCache.set(groupId, entry);
    this.safeSetCacheItem(this.groupStorageKey(groupId), entry);
  }

  private getCachedGroupsList(): Group[] | null {
    if (this.groupsListCache && Date.now() - this.groupsListCache.ts < this.cacheTtlMs) {
      return this.groupsListCache.data;
    }
    if (this.groupsListCache) this.groupsListCache = null;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.groupsListStorageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: Group[]; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(this.groupsListStorageKey());
        return null;
      }
      this.groupsListCache = { data: parsed.data, ts: parsed.ts };
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedGroupsList(groups: Group[]) {
    const entry = { data: groups, ts: Date.now() };
    this.groupsListCache = entry;
    this.safeSetCacheItem(this.groupsListStorageKey(), entry);
  }

  private getCachedUserGroups(uid: string): Group[] | null {
    const inMemory = this.userGroupsCache.get(uid);
    if (inMemory && Date.now() - inMemory.ts < this.cacheTtlMs) return inMemory.data;
    if (inMemory) this.userGroupsCache.delete(uid);
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.userGroupsStorageKey(uid));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: Group[]; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(this.userGroupsStorageKey(uid));
        return null;
      }
      this.userGroupsCache.set(uid, { data: parsed.data, ts: parsed.ts });
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedUserGroups(uid: string, groups: Group[]) {
    const entry = { data: groups, ts: Date.now() };
    this.userGroupsCache.set(uid, entry);
    this.safeSetCacheItem(this.userGroupsStorageKey(uid), entry);
  }

  private invalidateGroupsListCache() {
    this.groupsListCache = null;
    this.safeRemoveItem(this.groupsListStorageKey());
    this.bumpListCacheVersion();
  }

  private invalidateUserGroupsCache(uid: string) {
    this.userGroupsCache.delete(uid);
    this.safeRemoveItem(this.userGroupsStorageKey(uid));
    this.bumpListCacheVersion();
  }

  private groupStorageKey(groupId: string) {
    return `group:v${this.groupItemCacheVersion}:${groupId}`;
  }

  private groupsListStorageKey() {
    return `groups:list:v${this.listCacheVersion}`;
  }

  private userGroupsStorageKey(uid: string) {
    return `userGroups:v${this.listCacheVersion}:${uid}`;
  }

  private storageAvailable() {
    return typeof window !== 'undefined' && !!window.localStorage;
  }

  private safeRemoveItem(key: string) {
    if (!this.storageAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn('LocalStorage remove failed:', err);
    }
  }

  private safeSetCacheItem(key: string, entry: { data: Group | Group[]; ts: number }) {
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
    return Object.keys(window.localStorage).filter(
      (key) =>
        (key.startsWith('group:') ||
          key.startsWith('userGroups:') ||
          key.startsWith('groups:list:')) &&
        !key.endsWith(':version'),
    );
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

  private readCacheVersion(storageKey: string) {
    if (!this.storageAvailable()) return 1;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    } catch {
      return 1;
    }
  }

  private bumpListCacheVersion() {
    this.listCacheVersion += 1;
    this.groupsListCache = null;
    this.userGroupsCache.clear();
    this.safeSetVersion('groups:list:version', this.listCacheVersion);
  }

  private bumpGroupItemCacheVersion() {
    this.groupItemCacheVersion += 1;
    this.groupCache.clear();
    this.safeSetVersion('groups:item:version', this.groupItemCacheVersion);
  }

  private safeSetVersion(storageKey: string, value: number) {
    if (!this.storageAvailable()) return;
    try {
      window.localStorage.setItem(storageKey, String(value));
    } catch (err) {
      console.warn('LocalStorage version write failed:', err);
    }
  }

  private fetchGroupsList(): Observable<Group[]> {
    const q = query(this.groupsCollection, orderBy('createdAt', 'desc'));
    return from(getDocs(q)).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }))),
      tap((groups) => this.setCachedGroupsList(groups)),
      catchError((err: any) => {
        console.error('getGroups error:', err);
        return of([]);
      }),
    );
  }

  private fetchGroupById(id: string): Observable<Group | undefined> {
    const docRef = doc(this.firestore, `groups/${id}`);
    return from(getDoc(docRef)).pipe(
      map((snap) =>
        snap.exists() ? ({ id: snap.id, ...(snap.data() as Group) } as Group) : undefined,
      ),
      tap((group) => {
        if (group) this.setCachedGroup(id, group);
      }),
    );
  }
}
