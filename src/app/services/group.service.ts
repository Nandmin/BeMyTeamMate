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
import { Observable, of, from, defer } from 'rxjs';
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
  image?: string;
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

  private get groupsCollection() {
    return collection(this.firestore, 'groups');
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
      image:
        'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&q=80&w=800', // Default image
    };

    const ownerMemberRef = doc(this.firestore, `groups/${groupRef.id}/members/${user.uid}`);
    // Removed userGroupRef - no longer syncing to users/uid/groups
    const batch = writeBatch(this.firestore);
    batch.set(groupRef, groupData);
    batch.set(ownerMemberRef, {
      userId: user.uid,
      name: user.displayName || 'Ismeretlen',
      photo: user.photoURL || null,
      role: 'Csapatkapitány',
      isAdmin: true,
      joinedAt: serverTimestamp(),
      skillLevel: 100,
      elo: 1200,
    });
    // batch.set(userGroupRef, ...) removed
    await batch.commit();

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
          if (cached) return of(cached);
          const q = query(this.groupsCollection, orderBy('createdAt', 'desc'));
          return from(getDocs(q)).pipe(
            map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }))),
            tap((groups) => this.setCachedGroupsList(groups)),
            catchError((err: any) => {
              console.error('getGroups error:', err);
              return of([]);
            })
          );
        })
      )
    );
  }

  getUserGroups(userId?: string): Observable<Group[]> {
    const user$: Observable<any> = userId ? of({ uid: userId }) : this.authService.user$;

    return user$.pipe(
      switchMap((user: any) => {
        if (!user?.uid) return of([]);
        return this.getUserGroupsInternal(user.uid);
      })
    );
  }

  getGroupsForMember(userId: string): Observable<Group[]> {
    return defer(() => {
      if (!userId) return of([]);

      // Strictly query MEMBERSHIP only.
      // If a user is owner but NOT in members (e.g. left), they should not see the group.
      const membersQuery = query(
        collectionGroup(this.firestore, 'members'),
        where('userId', '==', userId)
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
            map((groups) => groups.sort((a, b) => a.name.localeCompare(b.name)))
          );
        })
      );
    });
  }

  getGroup(id: string): Observable<Group | undefined> {
    return defer(() => {
      const cached = this.getCachedGroup(id);
      if (cached) return of(cached);
      const docRef = doc(this.firestore, `groups/${id}`);
      return from(getDoc(docRef)).pipe(
        map((snap) =>
          snap.exists() ? ({ id: snap.id, ...(snap.data() as Group) } as Group) : undefined
        ),
        tap((group) => {
          if (group) this.setCachedGroup(id, group);
        })
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
            })
          );
        })
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

    const group = await this.getGroupOnce(groupId);
    if (group) {
      await this.notificationService.notifyGroupMembers(
        {
          type: 'group_join',
          groupId,
          title: `${group.name} - ?j tag`,
          body: `${user.displayName || 'Ismeretlen'} csatlakozott a csoporthoz.`,
          link: `/groups/${groupId}`,
          actorId: user.uid,
          actorName: user.displayName || 'Ismeretlen',
          actorPhoto: user.photoURL || null,
        },
        [user.uid]
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
  async removeMember(groupId: string, memberId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    // Delete the member document
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberId}`);
    const memberSnap = await getDoc(memberRef);
    const memberData = memberSnap.exists() ? (memberSnap.data() as GroupMember) : null;

    const group = await this.getGroupOnce(groupId);
    if (group && memberData?.userId) {
      await this.notificationService.notifyGroupMembers(
        {
          type: 'group_leave',
          groupId,
          title: `${group.name} - tag kilepett`,
          body: `${memberData.name || 'Ismeretlen'} kilepett a csoportbol.`,
          link: `/groups/${groupId}`,
          actorId: memberData.userId,
          actorName: memberData.name || 'Ismeretlen',
          actorPhoto: memberData.photo || null,
        },
        [memberData.userId]
      );
    }

    await deleteDoc(memberRef);

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
    data: { isAdmin: boolean; role: string }
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
        })
      );
    });
  }

  private async fetchUserGroupsFromSource(uid: string): Promise<Group[]> {
    // Strictly query MEMBERSHIP only.
    // We do NOT query ownedGroups separately.
    // Valid owners MUST be in the members collection.
    // If they left, they are out.

    const memberSnap = await getDocs(
      query(collectionGroup(this.firestore, 'members'), where('userId', '==', uid))
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
        query(this.groupsCollection, where(documentId(), 'in', chunk))
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
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.groupStorageKey(groupId), JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private getCachedGroupsList(): Group[] | null {
    if (this.groupsListCache && Date.now() - this.groupsListCache.ts < this.cacheTtlMs) {
      return this.groupsListCache.data;
    }
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
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.groupsListStorageKey(), JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private getCachedUserGroups(uid: string): Group[] | null {
    const inMemory = this.userGroupsCache.get(uid);
    if (inMemory && Date.now() - inMemory.ts < this.cacheTtlMs) return inMemory.data;
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
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.userGroupsStorageKey(uid), JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private invalidateGroupsListCache() {
    this.groupsListCache = null;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(this.groupsListStorageKey());
    } catch {
      // ignore cache errors
    }
  }

  private invalidateUserGroupsCache(uid: string) {
    this.userGroupsCache.delete(uid);
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(this.userGroupsStorageKey(uid));
    } catch {
      // ignore cache errors
    }
  }

  private groupStorageKey(groupId: string) {
    return `group:${groupId}`;
  }

  private groupsListStorageKey() {
    return 'groups:list';
  }

  private userGroupsStorageKey(uid: string) {
    return `userGroups:${uid}`;
  }
}
