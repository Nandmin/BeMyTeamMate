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
  writeBatch,
  documentId,
  collectionData,
  limit,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { Observable, of, from, defer, concat } from 'rxjs';
import { tap, switchMap, map, catchError } from 'rxjs/operators';
import { AppUser } from '../models/user.model';

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

export interface GroupInvite {
  id: string; // target userId
  groupId: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail?: string;
  targetUserPhoto?: string | null;
  inviterId: string;
  inviterName: string;
  inviterPhoto?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: any;
  respondedAt?: any;
  legalAccepted?: boolean;
  legalAcceptedAt?: any;
  revokedById?: string;
  revokedByName?: string;
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
  private readonly groupNameMaxLength = 50;
  private readonly groupDescriptionMaxLength = 250;

  private get groupsCollection() {
    return this.fsCollection('groups');
  }

  private normalizeGroupName(name: string): string {
    const normalizedName = (name ?? '').trim();
    if (!normalizedName) throw new Error('A csoport neve kötelező.');
    if (normalizedName.length > this.groupNameMaxLength) {
      throw new Error(`A csoport neve legfeljebb ${this.groupNameMaxLength} karakter lehet.`);
    }
    return normalizedName;
  }

  private normalizeGroupDescription(description: string): string {
    const normalizedDescription = (description ?? '').trim();
    if (normalizedDescription.length > this.groupDescriptionMaxLength) {
      throw new Error(`A leírás legfeljebb ${this.groupDescriptionMaxLength} karakter lehet.`);
    }
    return normalizedDescription;
  }

  private normalizeUsername(value: string): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
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
        createdAt: this.fsServerTimestamp(),
        ...meta,
      });
    } catch (error) {
      console.warn('Audit log write failed:', error);
    }
  }

  async createGroup(name: string, type: 'open' | 'closed', description: string = '') {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in to create a group');
    const normalizedName = this.normalizeGroupName(name);
    const normalizedDescription = this.normalizeGroupDescription(description);

    const groupRef = this.fsDoc(this.groupsCollection);
    const groupData: Omit<Group, 'id'> = {
      name: normalizedName,
      type,
      description: normalizedDescription,
      ownerId: user.uid,
      ownerName: user.displayName || 'Ismeretlen',
      ownerPhoto: user.photoURL || null,
      createdAt: this.fsServerTimestamp(),
      memberCount: 1, // The owner is the first member
      image: 0, // Default image id
    };

    const ownerMemberRef = this.fsDoc(`groups/${groupRef.id}/members/${user.uid}`);
    await this.fsSetDoc(groupRef, groupData);
    await this.fsSetDoc(ownerMemberRef, {
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
      groupName: normalizedName,
      groupType: type,
    });

    const fullGroup: Group = { id: groupRef.id, ...groupData };
    await this.upsertUserGroupSummary(user.uid, groupRef.id, fullGroup);
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
      const viewerUid = this.authService.currentUser()?.uid;
      if (!userId || !viewerUid || viewerUid !== userId) return of([]);
      return this.getUserGroupsInternal(userId);
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
    const memberRef = this.fsDoc(`groups/${groupId}/members/${user.uid}`);
    const memberSnap = await this.fsGetDoc(memberRef);
    if (memberSnap.exists()) throw new Error('Már tag vagy ebben a csoportban.');

    // Check if request already exists
    const requestRef = this.fsDoc(`groups/${groupId}/joinRequests/${user.uid}`);
    const requestSnap = await this.fsGetDoc(requestRef);
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
      createdAt: this.fsServerTimestamp(),
    };

    await this.fsSetDoc(requestRef, requestData);
    await this.writeGroupAuditLog(groupId, 'join_request', {
      targetUserId: user.uid,
      targetUserName: user.displayName || 'Ismeretlen',
    });

    // Notify only the owner from client side. Non-members cannot list members after hardened rules.
    await this.notificationService.notifyUsers([group.ownerId], {
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

  async findUserByIdentifier(identifier: string): Promise<AppUser | null> {
    const value = (identifier || '').trim();
    if (!value) return null;

    const usersRef = collection(this.firestore, 'users');

    const fetchSingle = async (field: string, match: string) => {
      const q = query(usersRef, where(field, '==', match), limit(2));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      if (snap.size > 1) {
        throw new Error('Több felhasználó is található ezzel az azonosítóval.');
      }
      const docSnap = snap.docs[0];
      return { ...(docSnap.data() as AppUser), uid: docSnap.id } as AppUser;
    };

    if (value.includes('@')) {
      return fetchSingle('email', value);
    }

    const normalizedValue = this.normalizeUsername(value);
    if (normalizedValue) {
      const byNormalizedUsername = await fetchSingle('usernameNormalized', normalizedValue);
      if (byNormalizedUsername) return byNormalizedUsername;
    }

    const byUsername = await fetchSingle('username', value);
    if (byUsername) return byUsername;

    return fetchSingle('displayName', value);
  }

  getGroupInvites(groupId: string): Observable<GroupInvite[]> {
    const invitesRef = collection(this.firestore, `groups/${groupId}/invites`);
    const q = query(invitesRef, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<GroupInvite[]>;
  }

  async getGroupInviteOnce(groupId: string, targetUserId: string): Promise<GroupInvite | null> {
    if (!groupId || !targetUserId) return null;
    const inviteRef = this.fsDoc(`groups/${groupId}/invites/${targetUserId}`);
    const inviteSnap = await this.fsGetDoc(inviteRef);
    if (!inviteSnap.exists()) return null;
    return { ...(inviteSnap.data() as GroupInvite), id: inviteSnap.id } as GroupInvite;
  }

  async createGroupInvite(groupId: string, targetUser: AppUser) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');
    if (!groupId) throw new Error('Csoport azonosító hiányzik.');
    if (!targetUser?.uid) throw new Error('Érvénytelen felhasználó.');

    if (targetUser.uid === user.uid) {
      throw new Error('Saját magadat nem hívhatod meg.');
    }

    const group = await this.getGroupOnce(groupId);
    if (!group) throw new Error('Csoport nem található.');

    const memberRef = this.fsDoc(`groups/${groupId}/members/${targetUser.uid}`);
    const memberSnap = await this.fsGetDoc(memberRef);
    if (memberSnap.exists()) {
      throw new Error('A felhasználó már tagja a csoportnak.');
    }

    const inviteRef = this.fsDoc(`groups/${groupId}/invites/${targetUser.uid}`);
    const existingSnap = await this.fsGetDoc(inviteRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as GroupInvite;
      if (existing.status === 'pending') {
        throw new Error('Már van függő meghívó ehhez a felhasználóhoz.');
      }
    }

    const inviterName = user.displayName || 'Ismeretlen';
    const invite: GroupInvite = {
      id: targetUser.uid,
      groupId,
      targetUserId: targetUser.uid,
      targetUserName:
        targetUser.displayName || (targetUser as any).username || 'Ismeretlen',
      targetUserEmail: targetUser.email,
      targetUserPhoto: targetUser.photoURL || null,
      inviterId: user.uid,
      inviterName,
      inviterPhoto: user.photoURL || null,
      status: 'pending',
      createdAt: this.fsServerTimestamp(),
      respondedAt: null,
      legalAccepted: false,
      legalAcceptedAt: null,
    };

    await this.fsSetDoc(inviteRef, invite);
    await this.writeGroupAuditLog(groupId, 'invite_create', {
      targetUserId: targetUser.uid,
      targetUserName:
        targetUser.displayName || (targetUser as any).username || 'Ismeretlen',
    });

    await this.notificationService.notifyUsers([targetUser.uid], {
      type: 'group_invite',
      groupId,
      title: 'Meghívás csoportba',
      body: `${inviterName} meghívott a(z) ${group.name} csoportba.`,
      link: `/groups/${groupId}?invite=1`,
      eventId: null,
      actorId: user.uid,
      actorName: inviterName,
      actorPhoto: user.photoURL || null,
    });
  }

  async acceptGroupInvite(groupId: string, inviteId: string, legalAccepted: boolean) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');
    if (!legalAccepted) throw new Error('A jogi nyilatkozat elfogadása kötelező.');

    const inviteRef = this.fsDoc(`groups/${groupId}/invites/${inviteId}`);
    const inviteSnap = await this.fsGetDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error('A meghívó nem található.');
    const invite = inviteSnap.data() as GroupInvite;

    if (invite.targetUserId !== user.uid) {
      throw new Error('Nincs jogosultságod ehhez a meghívóhoz.');
    }
    if (invite.status !== 'pending') {
      throw new Error('A meghívó már nem aktív.');
    }

    await this.addMemberToGroup(groupId, {
      userId: user.uid,
      name: user.displayName || invite.targetUserName || 'Ismeretlen',
      photo: user.photoURL || invite.targetUserPhoto || null,
      role: 'user',
      isAdmin: false,
      joinedAt: this.fsServerTimestamp(),
      skillLevel: 50,
      elo: 1200,
    });

    await this.fsUpdateDoc(inviteRef, {
      status: 'accepted',
      respondedAt: this.fsServerTimestamp(),
      legalAccepted: true,
      legalAcceptedAt: this.fsServerTimestamp(),
    });

    await this.writeGroupAuditLog(groupId, 'invite_accept', {
      targetUserId: user.uid,
      targetUserName: user.displayName || invite.targetUserName || 'Ismeretlen',
    });

    const group = await this.getGroupOnce(groupId);
    if (group) {
      await this.notificationService.notifyUsers([invite.inviterId], {
        type: 'group_invite_response',
        groupId,
        title: 'Meghívó elfogadva',
        body: `${user.displayName || 'Ismeretlen'} elfogadta a meghívásodat a(z) ${
          group.name
        } csoportba.`,
        link: `/groups/${groupId}`,
        eventId: null,
        actorId: user.uid,
        actorName: user.displayName || 'Ismeretlen',
        actorPhoto: user.photoURL || null,
      });
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

  async declineGroupInvite(groupId: string, inviteId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    const inviteRef = this.fsDoc(`groups/${groupId}/invites/${inviteId}`);
    const inviteSnap = await this.fsGetDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error('A meghívó nem található.');
    const invite = inviteSnap.data() as GroupInvite;

    if (invite.targetUserId !== user.uid) {
      throw new Error('Nincs jogosultságod ehhez a meghívóhoz.');
    }
    if (invite.status !== 'pending') {
      throw new Error('A meghívó már nem aktív.');
    }

    await this.fsUpdateDoc(inviteRef, {
      status: 'declined',
      respondedAt: this.fsServerTimestamp(),
    });

    await this.writeGroupAuditLog(groupId, 'invite_decline', {
      targetUserId: user.uid,
      targetUserName: user.displayName || invite.targetUserName || 'Ismeretlen',
    });

    const group = await this.getGroupOnce(groupId);
    if (group) {
      await this.notificationService.notifyUsers([invite.inviterId], {
        type: 'group_invite_response',
        groupId,
        title: 'Meghívó elutasítva',
        body: `${user.displayName || 'Ismeretlen'} elutasította a meghívásodat a(z) ${
          group.name
        } csoportba.`,
        link: `/groups/${groupId}`,
        eventId: null,
        actorId: user.uid,
        actorName: user.displayName || 'Ismeretlen',
        actorPhoto: user.photoURL || null,
      });
    }
  }

  async revokeGroupInvite(groupId: string, inviteId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    const inviteRef = this.fsDoc(`groups/${groupId}/invites/${inviteId}`);
    const inviteSnap = await this.fsGetDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error('A meghívó nem található.');

    await this.fsUpdateDoc(inviteRef, {
      status: 'revoked',
      respondedAt: this.fsServerTimestamp(),
      revokedById: user.uid,
      revokedByName: user.displayName || 'Ismeretlen',
    });

    await this.writeGroupAuditLog(groupId, 'invite_revoke', {
      targetUserId: inviteId,
    });
  }

  async approveJoinRequest(requestId: string, groupId: string) {
    const requestRef = doc(this.firestore, `groups/${groupId}/joinRequests/${requestId}`);
    const requestSnap = await this.fsGetDoc(requestRef);
    if (!requestSnap.exists()) return;
    const request = requestSnap.data() as JoinRequest;
    const targetUserId = request.userId || requestId;
    const targetUserName = request.userName || 'Ismeretlen';

    await this.addMemberToGroup(groupId, {
      userId: targetUserId,
      name: targetUserName,
      photo: request.userPhoto || null,
      role: 'user',
      isAdmin: false,
      joinedAt: this.fsServerTimestamp(),
      skillLevel: 50,
      elo: 1200,
    });

    await deleteDoc(requestRef);
    await this.writeGroupAuditLog(groupId, 'join_approve', {
      targetUserId,
      targetUserName,
    });

    // Notify the user
    await this.notificationService.notifyUsers([targetUserId], {
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
      await this.upsertUserGroupSummary(memberData.userId, groupId, updatedGroup);
      this.setCachedGroup(groupId, updatedGroup);
      this.invalidateUserGroupsCache(memberData.userId); // Invalidate cache so next fetch gets fresh list
    }
  }

  private fsCollection(path: string) {
    return collection(this.firestore, path);
  }

  private fsDoc(pathOrRef: any) {
    if (typeof pathOrRef === 'string') {
      return doc(this.firestore, pathOrRef);
    }
    return doc(pathOrRef);
  }

  private fsGetDoc(ref: any) {
    return getDoc(ref);
  }

  private fsGetDocs(ref: any) {
    return getDocs(ref);
  }

  private fsSetDoc(ref: any, data: any, options?: any) {
    return setDoc(ref, data, options);
  }

  private fsUpdateDoc(ref: any, data: any) {
    return updateDoc(ref, data);
  }

  private fsDeleteDoc(ref: any) {
    return deleteDoc(ref);
  }

  private fsServerTimestamp() {
    return serverTimestamp();
  }

  // --- Group Management ---
  async updateGroup(groupId: string, data: Partial<Omit<Group, 'id' | 'ownerId' | 'createdAt'>>) {
    const normalizedData = { ...data };
    if (typeof normalizedData.name === 'string') {
      normalizedData.name = this.normalizeGroupName(normalizedData.name);
    }
    if (typeof normalizedData.description === 'string') {
      normalizedData.description = this.normalizeGroupDescription(normalizedData.description);
    }

    const groupRef = doc(this.firestore, `groups/${groupId}`);
    const result = await updateDoc(groupRef, normalizedData);
    await this.writeGroupAuditLog(groupId, 'group_update');
    const cached = this.getCachedGroup(groupId);
    if (cached) {
      const updated = { ...cached, ...normalizedData } as Group;
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

    const memberRef = this.fsDoc(`groups/${groupId}/members/${user.uid}`);
    const memberSnap = await this.fsGetDoc(memberRef);
    if (!memberSnap.exists()) return;

    await this.removeMember(groupId, user.uid);
  }

  async removeMember(groupId: string, memberId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    // Delete the member document
    const memberRef = doc(this.firestore, `groups/${groupId}/members/${memberId}`);
    const memberSnap = await this.fsGetDoc(memberRef);
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
      await this.removeUserGroupSummary(memberData.userId, groupId);
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

  private async upsertUserGroupSummary(userId: string, groupId: string, group: Group) {
    if (!userId || !groupId) return;
    const summaryRef = this.fsDoc(`users/${userId}/groups/${groupId}`);
    await this.fsSetDoc(summaryRef, this.buildGroupSummary(groupId, group), { merge: true });
  }

  private async removeUserGroupSummary(userId: string, groupId: string) {
    if (!userId || !groupId) return;
    const summaryRef = this.fsDoc(`users/${userId}/groups/${groupId}`);
    await this.fsDeleteDoc(summaryRef);
  }

  private buildGroupSummary(groupId: string, group: Group): Partial<Group> {
    const summary: Partial<Group> = {
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
    Object.keys(summary).forEach((key) => {
      const typedKey = key as keyof Group;
      if (summary[typedKey] === undefined) {
        delete summary[typedKey];
      }
    });
    return summary;
  }

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
    const userGroupsSnap = await getDocs(this.fsCollection(`users/${uid}/groups`));
    const uniqueIds = Array.from(
      new Set(
        userGroupsSnap.docs
          .map((d) => d.id)
          .filter((id): id is string => !!id),
      ),
    );

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

