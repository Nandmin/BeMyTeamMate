import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  collectionData,
  doc,
  docData,
  updateDoc,
  increment,
  deleteDoc,
  collectionGroup,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, switchMap, of, combineLatest, map, from, startWith, catchError } from 'rxjs';

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

  private groupsCollection = collection(this.firestore, 'groups');

  async createGroup(name: string, type: 'open' | 'closed', description: string = '') {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in to create a group');

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

    return addDoc(this.groupsCollection, groupData);
  }

  getGroups(): Observable<Group[]> {
    return collectionData(query(this.groupsCollection, orderBy('createdAt', 'desc')), {
      idField: 'id',
    }) as Observable<Group[]>;
  }

  getUserGroups(): Observable<Group[]> {
    return this.authService.user$.pipe(
      switchMap((user) => {
        if (!user) return of([]);

        // 1. Owned groups - this usually works without extra indexes
        const ownedQuery = query(this.groupsCollection, where('ownerId', '==', user.uid));
        const ownedGroups$ = (
          collectionData(ownedQuery, { idField: 'id' }) as Observable<Group[]>
        ).pipe(startWith([]));

        // 2. Groups where user is a member (via collectionGroup)
        // This might require a manual index in Firebase Console
        const memberQuery = query(
          collectionGroup(this.firestore, 'members'),
          where('userId', '==', user.uid)
        );

        const joinedIds$ = from(getDocs(memberQuery)).pipe(
          map((snap) => snap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean) as string[]),
          catchError((err) => {
            console.warn('Member collectionGroup query failed (index might be missing):', err);
            return of([]);
          }),
          startWith([])
        );

        return combineLatest([ownedGroups$, joinedIds$]).pipe(
          switchMap(([ownedGroups, joinedIds]) => {
            const ownedIds = new Set(ownedGroups.map((g) => g.id));
            const missingIds = joinedIds.filter((id) => !ownedIds.has(id));

            if (missingIds.length === 0) return of(ownedGroups);

            // Fetch the details for joined groups
            const joinedObservables = missingIds.map((id) => this.getGroup(id));
            return combineLatest(joinedObservables).pipe(
              map((joinedGroups) => {
                const validJoined = joinedGroups.filter((g): g is Group => !!g);
                const allGroups = [...ownedGroups, ...validJoined];
                // Sort by name or date if needed
                return allGroups.sort((a, b) => a.name.localeCompare(b.name));
              }),
              startWith(ownedGroups) // Show owned groups immediately
            );
          })
        );
      })
    );
  }

  getGroup(id: string): Observable<Group | undefined> {
    const docRef = doc(this.firestore, `groups/${id}`);
    return docData(docRef, { idField: 'id' }) as Observable<Group | undefined>;
  }

  getGroupMembers(groupId: string): Observable<GroupMember[]> {
    const group$ = this.getGroup(groupId);
    const membersCollection = collection(this.firestore, `groups/${groupId}/members`);
    const q = query(membersCollection, orderBy('joinedAt', 'asc'));
    const members$ = collectionData(q, { idField: 'id' }) as Observable<GroupMember[]>;

    return combineLatest([group$, members$]).pipe(
      map(([group, members]) => {
        if (!group) return members;

        // Ensure the owner is in the list (fallback for older groups)
        const hasOwner = members.some((m) => m.userId === group.ownerId);
        if (!hasOwner) {
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
        }
        return members;
      })
    );
  }

  async joinGroup(groupId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User logged in required');

    const membersCollection = collection(this.firestore, `groups/${groupId}/members`);
    const q = query(membersCollection, where('userId', '==', user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      await addDoc(membersCollection, {
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
    }
  }

  // --- Group Management ---
  async updateGroup(groupId: string, data: Partial<Omit<Group, 'id' | 'ownerId' | 'createdAt'>>) {
    const groupRef = doc(this.firestore, `groups/${groupId}`);
    return updateDoc(groupRef, data);
  }

  // --- Member Management ---
  async removeMember(groupId: string, memberId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    // Delete the member document
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberId}`);
    await deleteDoc(memberRef);

    // Decrement member count
    const groupRef = doc(this.firestore, `groups/${groupId}`);
    await updateDoc(groupRef, {
      memberCount: increment(-1),
    });
  }

  async updateMemberRole(
    groupId: string,
    memberId: string,
    data: { isAdmin: boolean; role: string }
  ) {
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberId}`);
    return updateDoc(memberRef, data);
  }
}
