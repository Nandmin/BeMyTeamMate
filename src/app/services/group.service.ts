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
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, switchMap, of, map, from, defer } from 'rxjs';
import { tap } from 'rxjs/operators';

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

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private cacheTtlMs = 5 * 60 * 1000;
  private groupCache = new Map<string, { data: Group; ts: number }>();
  private groupsListCache: { data: Group[]; ts: number } | null = null;
  private userGroupsCache = new Map<string, { data: Group[]; ts: number }>();

  private groupsCollection = collection(this.firestore, 'groups');

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
    const userGroupRef = doc(this.firestore, `users/${user.uid}/groups/${groupRef.id}`);
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
    batch.set(userGroupRef, this.buildGroupSummary(groupRef.id, groupData));
    await batch.commit();

    const fullGroup: Group = { id: groupRef.id, ...groupData };
    this.setCachedGroup(groupRef.id, fullGroup);
    this.invalidateGroupsListCache();
    this.invalidateUserGroupsCache(user.uid);
    return groupRef;
  }

  getGroups(): Observable<Group[]> {
    return defer(() => {
      const cached = this.getCachedGroupsList();
      if (cached) return of(cached);
      const q = query(this.groupsCollection, orderBy('createdAt', 'desc'));
      return from(getDocs(q)).pipe(
        map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }))),
        tap((groups) => this.setCachedGroupsList(groups))
      );
    });
  }

  getUserGroups(userId?: string): Observable<Group[]> {
    const uid$ = userId ? of(userId) : this.authService.user$.pipe(map((u) => u?.uid));

    return uid$.pipe(
      switchMap((uid) => {
        if (!uid) return of([]);
        return this.getUserGroupsInternal(uid);
      })
    );
  }

  getGroup(id: string): Observable<Group | undefined> {
    return defer(() => {
      const cached = this.getCachedGroup(id);
      if (cached) return of(cached);
      const docRef = doc(this.firestore, `groups/${id}`);
      return from(getDoc(docRef)).pipe(
        map((snap) => (snap.exists() ? ({ id: snap.id, ...(snap.data() as Group) } as Group) : undefined)),
        tap((group) => {
          if (group) this.setCachedGroup(id, group);
        })
      );
    });
  }

  getGroupMembers(groupId: string): Observable<GroupMember[]> {
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
  }

  async joinGroup(groupId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User logged in required');

    const membersCollection = collection(this.firestore, `groups/${groupId}/members`);
    const memberRef = doc(membersCollection, user.uid);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) return;

    const legacySnap = await getDocs(query(membersCollection, where('userId', '==', user.uid)));
    if (!legacySnap.empty) return;

    await setDoc(memberRef, {
      userId: user.uid,
      name: user.displayName || 'Ismeretlen',
      photo: user.photoURL || null,
      role: 'Tag',
      isAdmin: false,
      joinedAt: serverTimestamp(),
      skillLevel: 50,
    });

    const groupRef = doc(this.firestore, `groups/${groupId}`);
    await updateDoc(groupRef, {
      memberCount: increment(1),
    });

    const group = await this.getGroupOnce(groupId);
    if (group) {
      const updatedGroup = { ...group, memberCount: (group.memberCount || 0) + 1 };
      this.setCachedGroup(groupId, updatedGroup);
      await this.upsertUserGroupSummary(user.uid, groupId, updatedGroup);
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
      await this.upsertUserGroupSummary(user.uid, groupId, data);
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
      const userGroupRef = doc(this.firestore, `users/${memberData.userId}/groups/${groupId}`);
      await deleteDoc(userGroupRef);
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

  private async upsertUserGroupSummary(
    uid: string,
    groupId: string,
    group: Partial<Group>
  ) {
    const summary = this.buildGroupSummary(groupId, group);
    await setDoc(doc(this.firestore, `users/${uid}/groups/${groupId}`), summary, { merge: true });
    this.invalidateUserGroupsCache(uid);
  }

  private buildGroupSummary(groupId: string, group: Partial<Group>) {
    const summary: any = {
      id: groupId,
      name: group.name,
      type: group.type,
      ownerId: group.ownerId,
      ownerName: group.ownerName,
      ownerPhoto: group.ownerPhoto ?? null,
      createdAt: group.createdAt,
      memberCount: group.memberCount ?? 0,
      image: group.image,
      description: group.description ?? '',
    };
    Object.keys(summary).forEach((key) => summary[key] === undefined && delete summary[key]);
    return summary;
  }

  private getUserGroupsInternal(uid: string): Observable<Group[]> {
    return defer(() => {
      const cached = this.getCachedUserGroups(uid);
      if (cached) return of(cached);

      const userGroupsRef = collection(this.firestore, `users/${uid}/groups`);
      const q = query(userGroupsRef, orderBy('name', 'asc'));
      return from(getDocs(q)).pipe(
        map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }))),
        switchMap((groups) => {
          if (groups.length > 0) {
            this.setCachedUserGroups(uid, groups);
            groups.forEach((g) => g.id && this.setCachedGroup(g.id, g));
            return of(groups);
          }
          return from(this.loadUserGroupsFallback(uid)).pipe(
            tap((fallback) => {
              this.setCachedUserGroups(uid, fallback);
              fallback.forEach((g) => g.id && this.setCachedGroup(g.id, g));
            })
          );
        })
      );
    });
  }

  private async loadUserGroupsFallback(uid: string): Promise<Group[]> {
    const ownedSnap = await getDocs(query(this.groupsCollection, where('ownerId', '==', uid)));
    const ownedGroups = ownedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }));

    const memberSnap = await getDocs(
      query(collectionGroup(this.firestore, 'members'), where('userId', '==', uid))
    );
    const joinedIds = memberSnap.docs
      .map((d) => d.ref.parent.parent?.id)
      .filter(Boolean) as string[];
    const ownedIds = new Set(ownedGroups.map((g) => g.id));
    const missingIds = joinedIds.filter((id) => !ownedIds.has(id));

    const joinedGroups: Group[] = [];
    const chunks = this.chunkArray(missingIds, 10);
    for (const chunk of chunks) {
      const chunkSnap = await getDocs(
        query(this.groupsCollection, where(documentId(), 'in', chunk))
      );
      joinedGroups.push(
        ...chunkSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }))
      );
    }

    const allGroups = [...ownedGroups, ...joinedGroups].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    await Promise.all(
      allGroups.map((group) =>
        setDoc(doc(this.firestore, `users/${uid}/groups/${group.id}`), this.buildGroupSummary(group.id!, group), {
          merge: true,
        })
      )
    );

    return allGroups;
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
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
