import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { installMockLocalStorage } from '../testing/local-storage.mock';
import { AuthService } from './auth.service';
import { Group, GroupService } from './group.service';
import { NotificationService } from './notification.service';

describe('GroupService cache', () => {
  let restoreLocalStorage: () => void;
  let service: GroupService;

  const authServiceStub = {
    user$: of(null),
    currentUser: () => null,
  };

  beforeEach(() => {
    const { restore } = installMockLocalStorage();
    restoreLocalStorage = restore;
    TestBed.configureTestingModule({
      providers: [
        GroupService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: {} },
      ],
    });
    service = TestBed.inject(GroupService);
  });

  afterEach(() => {
    restoreLocalStorage();
  });

  it('setCachedGroup stores in memory and localStorage', () => {
    const group: Group = {
      id: 'g1',
      name: 'Test',
      type: 'open',
      ownerId: 'u1',
      ownerName: 'Owner',
      createdAt: new Date(),
      memberCount: 1,
    };

    (service as any).setCachedGroup('g1', group);

    const storageKey = (service as any).groupStorageKey('g1');
    expect((service as any).groupCache.get('g1')).toBeTruthy();
    expect(window.localStorage.getItem(storageKey)).toBeTruthy();
  });

  it('setCachedGroup falls back to memory-only on quota errors', () => {
    const group: Group = {
      id: 'g1',
      name: 'Test',
      type: 'open',
      ownerId: 'u1',
      ownerName: 'Owner',
      createdAt: new Date(),
      memberCount: 1,
    };

    spyOn(console, 'warn');
    const originalSet = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('Quota exceeded');
    };

    (service as any).setCachedGroup('g1', group);

    expect((service as any).groupCache.get('g1')).toBeTruthy();
    expect(console.warn).toHaveBeenCalled();
    window.localStorage.setItem = originalSet;
  });

  it('evicts oldest entries when cache exceeds limit', () => {
    const group: Group = {
      id: 'g1',
      name: 'Test',
      type: 'open',
      ownerId: 'u1',
      ownerName: 'Owner',
      createdAt: new Date(),
      memberCount: 1,
    };

    (service as any).maxCacheEntries = 2;

    const key1 = (service as any).groupStorageKey('g1');
    const key2 = (service as any).groupStorageKey('g2');
    const key3 = (service as any).groupStorageKey('g3');

    window.localStorage.setItem(key1, JSON.stringify({ data: group, ts: 1 }));
    window.localStorage.setItem(key2, JSON.stringify({ data: group, ts: 2 }));

    (service as any).setCachedGroup('g3', group);

    expect(window.localStorage.getItem(key1)).toBeNull();
    expect(window.localStorage.getItem(key2)).toBeTruthy();
    expect(window.localStorage.getItem(key3)).toBeTruthy();
  });
});

describe('GroupService invites', () => {
  let restoreLocalStorage: () => void;
  let service: GroupService;
  let currentUser: any;

  const docSnaps = new Map<string, { exists: () => boolean; data: () => any; id: string }>();

  const authServiceStub = {
    user$: of(null),
    currentUser: () => currentUser,
  };

  const notificationServiceStub = {
    notifyUsers: jasmine.createSpy('notifyUsers').and.returnValue(Promise.resolve()),
    notifyGroupMembers: jasmine.createSpy('notifyGroupMembers').and.returnValue(Promise.resolve()),
  };

  const makeSnap = (path: string, exists: boolean, data: any = {}) => ({
    exists: () => exists,
    data: () => data,
    id: path.split('/').pop() || '',
  });

  beforeEach(() => {
    const { restore } = installMockLocalStorage();
    restoreLocalStorage = restore;

    currentUser = null;
    docSnaps.clear();
    notificationServiceStub.notifyUsers.calls.reset();
    notificationServiceStub.notifyGroupMembers.calls.reset();

    TestBed.configureTestingModule({
      providers: [
        GroupService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: notificationServiceStub },
      ],
    });
    service = TestBed.inject(GroupService);

    spyOn(service as any, 'fsDoc').and.callFake((path: string) => ({ path }));
    spyOn(service as any, 'fsGetDoc').and.callFake(async (ref: any) => {
      const snap = docSnaps.get(ref.path);
      return snap ?? makeSnap(ref.path || '', false);
    });
    spyOn(service as any, 'fsSetDoc').and.callFake(async () => {});
    spyOn(service as any, 'fsUpdateDoc').and.callFake(async () => {});
    spyOn(service as any, 'fsServerTimestamp').and.returnValue('server-timestamp' as any);
    spyOn(service as any, 'writeGroupAuditLog').and.returnValue(Promise.resolve());
  });

  afterEach(() => {
    restoreLocalStorage();
  });

  it('createGroupInvite rejects self-invites', async () => {
    currentUser = { uid: 'u1', displayName: 'Admin' };
    const target = { uid: 'u1', displayName: 'Admin', email: 'admin@test.hu' };

    await expectAsync(service.createGroupInvite('g1', target as any)).toBeRejectedWithError(
      'Saját magadat nem hívhatod meg.',
    );
  });

  it('createGroupInvite rejects when target already member', async () => {
    currentUser = { uid: 'u1', displayName: 'Admin' };
    const target = { uid: 'u2', displayName: 'Target', email: 't@test.hu' };

    spyOn(service as any, 'getGroupOnce').and.returnValue(
      Promise.resolve({
        id: 'g1',
        name: 'Group 1',
        type: 'closed',
        ownerId: 'u1',
        ownerName: 'Admin',
        createdAt: new Date(),
        memberCount: 1,
      } as Group),
    );

    docSnaps.set('groups/g1/members/u2', makeSnap('groups/g1/members/u2', true, {}));

    await expectAsync(service.createGroupInvite('g1', target as any)).toBeRejectedWithError(
      'A felhasználó már tagja a csoportnak.',
    );
  });

  it('createGroupInvite rejects when pending invite exists', async () => {
    currentUser = { uid: 'u1', displayName: 'Admin' };
    const target = { uid: 'u2', displayName: 'Target', email: 't@test.hu' };

    spyOn(service as any, 'getGroupOnce').and.returnValue(
      Promise.resolve({
        id: 'g1',
        name: 'Group 1',
        type: 'closed',
        ownerId: 'u1',
        ownerName: 'Admin',
        createdAt: new Date(),
        memberCount: 1,
      } as Group),
    );

    docSnaps.set('groups/g1/members/u2', makeSnap('groups/g1/members/u2', false));
    docSnaps.set(
      'groups/g1/invites/u2',
      makeSnap('groups/g1/invites/u2', true, { status: 'pending' }),
    );

    await expectAsync(service.createGroupInvite('g1', target as any)).toBeRejectedWithError(
      'Már van függő meghívó ehhez a felhasználóhoz.',
    );
  });

  it('createGroupInvite writes invite and sends notification', async () => {
    currentUser = { uid: 'u1', displayName: 'Admin', photoURL: 'admin.png' };
    const target = { uid: 'u2', displayName: 'Target', email: 't@test.hu', photoURL: 't.png' };

    spyOn(service as any, 'getGroupOnce').and.returnValue(
      Promise.resolve({
        id: 'g1',
        name: 'Group 1',
        type: 'closed',
        ownerId: 'u1',
        ownerName: 'Admin',
        createdAt: new Date(),
        memberCount: 1,
      } as Group),
    );

    docSnaps.set('groups/g1/members/u2', makeSnap('groups/g1/members/u2', false));
    docSnaps.set('groups/g1/invites/u2', makeSnap('groups/g1/invites/u2', false));

    await service.createGroupInvite('g1', target as any);

    const setDocCalls = (service as any).fsSetDoc.calls;
    expect(setDocCalls.count()).toBe(1);
    const [inviteRef, payload] = setDocCalls.mostRecent().args as any[];
    expect(inviteRef.path).toBe('groups/g1/invites/u2');
    expect(payload).toEqual(
      jasmine.objectContaining({
        groupId: 'g1',
        targetUserId: 'u2',
        inviterId: 'u1',
        status: 'pending',
      }),
    );

    expect(notificationServiceStub.notifyUsers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyUsers.calls.mostRecent().args as any[];
    expect(notifyArgs[0]).toEqual(['u2']);
    expect(notifyArgs[1]).toEqual(
      jasmine.objectContaining({
        type: 'group_invite',
        groupId: 'g1',
        link: '/groups/g1?invite=1',
      }),
    );
  });

  it('acceptGroupInvite updates invite and notifies inviter', async () => {
    currentUser = { uid: 'u2', displayName: 'Target', photoURL: 't.png' };

    spyOn(service as any, 'getGroupOnce').and.returnValue(
      Promise.resolve({
        id: 'g1',
        name: 'Group 1',
        type: 'closed',
        ownerId: 'u1',
        ownerName: 'Admin',
        createdAt: new Date(),
        memberCount: 1,
      } as Group),
    );
    spyOn(service as any, 'addMemberToGroup').and.returnValue(Promise.resolve());

    docSnaps.set(
      'groups/g1/invites/u2',
      makeSnap('groups/g1/invites/u2', true, {
        targetUserId: 'u2',
        targetUserName: 'Target',
        targetUserPhoto: 't.png',
        inviterId: 'u1',
        status: 'pending',
      }),
    );

    await service.acceptGroupInvite('g1', 'u2', true);

    const updateDocCalls = (service as any).fsUpdateDoc.calls;
    expect(updateDocCalls.count()).toBe(1);
    const [inviteRef, payload] = updateDocCalls.mostRecent().args as any[];
    expect(inviteRef.path).toBe('groups/g1/invites/u2');
    expect(payload).toEqual(
      jasmine.objectContaining({
        status: 'accepted',
        legalAccepted: true,
      }),
    );

    expect(notificationServiceStub.notifyUsers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyUsers.calls.mostRecent().args as any[];
    expect(notifyArgs[0]).toEqual(['u1']);
    expect(notifyArgs[1]).toEqual(
      jasmine.objectContaining({
        type: 'group_invite_response',
        groupId: 'g1',
        link: '/groups/g1',
      }),
    );
  });

  it('declineGroupInvite updates invite status and notifies inviter', async () => {
    currentUser = { uid: 'u2', displayName: 'Target', photoURL: 't.png' };

    spyOn(service as any, 'getGroupOnce').and.returnValue(
      Promise.resolve({
        id: 'g1',
        name: 'Group 1',
        type: 'closed',
        ownerId: 'u1',
        ownerName: 'Admin',
        createdAt: new Date(),
        memberCount: 1,
      } as Group),
    );

    docSnaps.set(
      'groups/g1/invites/u2',
      makeSnap('groups/g1/invites/u2', true, {
        targetUserId: 'u2',
        targetUserName: 'Target',
        inviterId: 'u1',
        status: 'pending',
      }),
    );

    await service.declineGroupInvite('g1', 'u2');

    const updateDocCalls = (service as any).fsUpdateDoc.calls;
    expect(updateDocCalls.count()).toBe(1);
    const [inviteRef, payload] = updateDocCalls.mostRecent().args as any[];
    expect(inviteRef.path).toBe('groups/g1/invites/u2');
    expect(payload).toEqual(
      jasmine.objectContaining({
        status: 'declined',
      }),
    );

    expect(notificationServiceStub.notifyUsers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyUsers.calls.mostRecent().args as any[];
    expect(notifyArgs[0]).toEqual(['u1']);
    expect(notifyArgs[1]).toEqual(
      jasmine.objectContaining({
        type: 'group_invite_response',
        groupId: 'g1',
        link: '/groups/g1',
      }),
    );
  });
});

describe('GroupService flows', () => {
  let restoreLocalStorage: () => void;
  let service: GroupService;
  let currentUser: any;

  const authServiceStub = {
    user$: of(null),
    currentUser: () => currentUser,
  };

  const notificationServiceStub = {
    notifyUsers: jasmine.createSpy('notifyUsers').and.returnValue(Promise.resolve()),
    notifyGroupMembers: jasmine.createSpy('notifyGroupMembers').and.returnValue(Promise.resolve()),
  };

  const makeSnap = (exists: boolean, data: any = {}, id: string = 'id') => ({
    exists: () => exists,
    data: () => data,
    id,
  });

  beforeEach(() => {
    const { restore } = installMockLocalStorage();
    restoreLocalStorage = restore;

    currentUser = null;
    notificationServiceStub.notifyUsers.calls.reset();
    notificationServiceStub.notifyGroupMembers.calls.reset();

    TestBed.configureTestingModule({
      providers: [
        GroupService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: notificationServiceStub },
      ],
    });
    service = TestBed.inject(GroupService);

    spyOn(service as any, 'writeGroupAuditLog').and.returnValue(Promise.resolve());
  });

  afterEach(() => {
    restoreLocalStorage();
  });

  it('createGroup creates group and owner member', async () => {
    currentUser = { uid: 'owner1', displayName: 'Owner', photoURL: 'owner.png' };

    spyOn(service as any, 'fsCollection').and.callFake((path: string) => ({ path }));
    spyOn(service as any, 'fsDoc').and.callFake((arg: any) => {
      if (typeof arg !== 'string') {
        return { id: 'g1', path: 'groups/g1' } as any;
      }
      const path = arg as string;
      return { id: path.split('/').pop(), path } as any;
    });
    spyOn(service as any, 'fsServerTimestamp').and.returnValue('server-ts' as any);
    const setDocSpy = spyOn(service as any, 'fsSetDoc').and.returnValue(
      Promise.resolve() as any,
    );

    const groupRef = await service.createGroup('Test Group', 'closed', 'desc');

    expect(groupRef.id).toBe('g1');
    expect(setDocSpy.calls.count()).toBe(3);
    expect(setDocSpy.calls.argsFor(0)[0]).toEqual(jasmine.objectContaining({ path: 'groups/g1' }));
    expect(setDocSpy.calls.argsFor(0)[1]).toEqual(
      jasmine.objectContaining({
        name: 'Test Group',
        ownerId: 'owner1',
        memberCount: 1,
      }),
    );
    expect(setDocSpy.calls.argsFor(1)[0]).toEqual(
      jasmine.objectContaining({ path: 'groups/g1/members/owner1' }),
    );
    expect(setDocSpy.calls.argsFor(1)[1]).toEqual(
      jasmine.objectContaining({
        userId: 'owner1',
        isAdmin: true,
      }),
    );
    expect(setDocSpy.calls.argsFor(2)[0]).toEqual(
      jasmine.objectContaining({ path: 'users/owner1/groups/g1' }),
    );
    expect(setDocSpy.calls.argsFor(2)[2]).toEqual(jasmine.objectContaining({ merge: true }));
  });

  it('requestJoinGroup stores pending request and notifies owner', async () => {
    currentUser = { uid: 'u-requester', displayName: 'Requester', photoURL: 'user.png' };

    spyOn(service as any, 'fsCollection').and.callFake((path: string) => ({ path }));
    spyOn(service as any, 'fsDoc').and.callFake((path: string) => {
      return { id: path.split('/').pop(), path } as any;
    });
    spyOn(service as any, 'fsServerTimestamp').and.returnValue('server-ts' as any);
    spyOn(service as any, 'fsGetDoc').and.callFake(async (ref: any) => {
      if (ref.path === 'groups/g1/members/u-requester') return makeSnap(false);
      if (ref.path === 'groups/g1/joinRequests/u-requester') return makeSnap(false);
      return makeSnap(true, { name: 'Group 1' }, 'g1');
    });
    const setDocSpy = spyOn(service as any, 'fsSetDoc').and.returnValue(
      Promise.resolve() as any,
    );
    spyOn(service as any, 'getGroupOnce').and.returnValue(
      Promise.resolve({
        id: 'g1',
        name: 'Group 1',
        type: 'closed',
        ownerId: 'u-owner',
        ownerName: 'Owner',
        createdAt: new Date(),
        memberCount: 3,
      } as Group),
    );

    await service.requestJoinGroup('g1');

    expect(setDocSpy).toHaveBeenCalled();
    expect(setDocSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ path: 'groups/g1/joinRequests/u-requester' }),
    );
    expect(setDocSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        userId: 'u-requester',
        status: 'pending',
      }),
    );
    expect(notificationServiceStub.notifyUsers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyUsers.calls.mostRecent().args as any[];
    expect(notifyArgs[0]).toEqual(['u-owner']);
    expect(notifyArgs[1]).toEqual(
      jasmine.objectContaining({
        type: 'group_join',
        groupId: 'g1',
        link: '/groups/g1/settings',
      }),
    );
  });
});
