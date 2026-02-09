import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { installMockLocalStorage } from '../testing/local-storage.mock';
import { AuthService } from './auth.service';
import { EloService } from './elo.service';
import { EventService } from './event.service';
import { NotificationService } from './notification.service';

describe('EventService cache', () => {
  let restoreLocalStorage: () => void;
  let service: EventService;

  const authServiceStub = {
    user$: of(null),
    currentUser: () => null,
  };

  const eloServiceStub = {
    updatePlayerElo: () => Promise.resolve(),
    updatePlayerRatings: () => Promise.resolve(),
  };

  beforeEach(() => {
    const { restore } = installMockLocalStorage();
    restoreLocalStorage = restore;
    TestBed.configureTestingModule({
      providers: [
        EventService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: {} },
        { provide: EloService, useValue: eloServiceStub },
      ],
    });
    service = TestBed.inject(EventService);
  });

  afterEach(() => {
    restoreLocalStorage();
  });

  it('setCachedEvent stores in memory and localStorage', () => {
    const event = {
      id: 'e1',
      groupId: 'g1',
      title: 'Event',
      sport: 'soccer',
      date: { toMillis: () => Date.now() } as any,
      time: '10:00',
      duration: 60,
      location: 'Field',
      maxAttendees: 10,
      currentAttendees: 0,
      attendees: [],
      creatorId: 'u1',
      createdAt: new Date(),
    };

    (service as any).setCachedEvent('g1', 'e1', event);

    const storageKey = (service as any).eventCacheKey('g1', 'e1');
    expect((service as any).eventCache.get(storageKey)).toBeTruthy();
    expect(window.localStorage.getItem(storageKey)).toBeTruthy();
  });

  it('evicts oldest entries when cache exceeds limit', () => {
    (service as any).maxCacheEntries = 2;
    const key1 = (service as any).eventCacheKey('g1', 'e1');
    const key2 = (service as any).eventCacheKey('g1', 'e2');
    const key3 = (service as any).eventCacheKey('g1', 'e3');
    window.localStorage.setItem(key1, JSON.stringify({ data: {}, ts: 1 }));
    window.localStorage.setItem(key2, JSON.stringify({ data: {}, ts: 2 }));

    (service as any).setCachedEvent('g1', 'e3', {} as any);

    expect(window.localStorage.getItem(key1)).toBeNull();
    expect(window.localStorage.getItem(key2)).toBeTruthy();
    expect(window.localStorage.getItem(key3)).toBeTruthy();
  });
});

describe('EventService flows', () => {
  let restoreLocalStorage: () => void;
  let service: EventService;
  let currentUser: any;

  const authServiceStub = {
    user$: of(null),
    currentUser: () => currentUser,
  };

  const notificationServiceStub = {
    notifyUsers: jasmine.createSpy('notifyUsers').and.returnValue(Promise.resolve()),
    notifyGroupMembers: jasmine.createSpy('notifyGroupMembers').and.returnValue(Promise.resolve()),
  };

  const eloServiceStub = {
    updatePlayerElo: () => Promise.resolve(),
    updatePlayerRatings: () => Promise.resolve(),
    calculateRatingChanges: () => new Map<string, number>(),
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
        EventService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: notificationServiceStub },
        { provide: EloService, useValue: eloServiceStub },
      ],
    });
    service = TestBed.inject(EventService);
  });

  afterEach(() => {
    restoreLocalStorage();
  });

  it('createEvent stores new event and notifies group members', async () => {
    currentUser = { uid: 'u1', displayName: 'Creator', photoURL: 'creator.png' };

    spyOn(service as any, 'fsServerTimestamp').and.returnValue('server-ts' as any);
    spyOn(service as any, 'getEventsCollection').and.returnValue({ path: 'groups/g1/events' });
    spyOn(service as any, 'fsDoc').and.callFake((path: string) => ({ path }));
    spyOn(service as any, 'fsGetDoc').and.callFake(async (ref: any) => {
      if (ref.path === 'groups/g1') return makeSnap(true, { name: 'Group 1' }, 'g1');
      return makeSnap(false);
    });
    const addDocSpy = spyOn(service as any, 'fsAddDoc').and.returnValue(
      Promise.resolve({ id: 'e1' } as any),
    );

    await service.createEvent('g1', {
      title: 'Kispalya',
      sport: 'football',
      date: { toDate: () => new Date('2026-02-10T10:00:00.000Z') } as any,
      time: '18:00',
      duration: 90,
      location: 'City Arena',
      maxAttendees: 10,
    } as any);

    expect(addDocSpy).toHaveBeenCalled();
    expect(addDocSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ path: 'groups/g1/events' }),
    );
    expect(addDocSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        groupId: 'g1',
        creatorId: 'u1',
        currentAttendees: 1,
        attendees: ['u1'],
        status: 'planned',
      }),
    );

    expect(notificationServiceStub.notifyGroupMembers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyGroupMembers.calls.mostRecent().args as any[];
    expect(notifyArgs[1]).toEqual(['u1']);
    expect(notifyArgs[0]).toEqual(
      jasmine.objectContaining({
        type: 'event_created',
        groupId: 'g1',
        eventId: 'e1',
        link: '/groups/g1/events/e1',
      }),
    );
  });

  it('toggleRSVP adds user when joining event', async () => {
    currentUser = { uid: 'u2', displayName: 'Player', photoURL: 'user.png' };

    spyOn(service as any, 'fsDoc').and.callFake((path: string) => ({ path }));
    spyOn(service as any, 'fsGetDoc').and.callFake(async (ref: any) => {
      if (ref.path === 'groups/g1/events/e1') {
        return makeSnap(
          true,
          {
            title: 'Evening Match',
            date: { toDate: () => new Date('2026-02-10T18:00:00.000Z') },
            time: '18:00',
            attendees: ['u1'],
            currentAttendees: 1,
            maxAttendees: 10,
          },
          'e1',
        );
      }
      if (ref.path === 'groups/g1') {
        return makeSnap(true, { name: 'Group 1' }, 'g1');
      }
      return makeSnap(false);
    });
    const updateDocSpy = spyOn(service as any, 'fsUpdateDoc').and.returnValue(
      Promise.resolve() as any,
    );

    await service.toggleRSVP('g1', 'e1');

    expect(updateDocSpy).toHaveBeenCalled();
    const updateArgs = updateDocSpy.calls.mostRecent().args as any[];
    expect(updateArgs[0]).toEqual(jasmine.objectContaining({ path: 'groups/g1/events/e1' }));
    expect(updateArgs[1]).toEqual(
      jasmine.objectContaining({
        attendees: ['u1', 'u2'],
        currentAttendees: 2,
      }),
    );
    expect(notificationServiceStub.notifyGroupMembers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyGroupMembers.calls.mostRecent().args as any[];
    expect(notifyArgs[1]).toEqual(['u2']);
    expect(notifyArgs[0]).toEqual(
      jasmine.objectContaining({
        type: 'event_rsvp_yes',
        groupId: 'g1',
        eventId: 'e1',
      }),
    );
  });

  it('toggleRSVP removes user when cancelling attendance', async () => {
    currentUser = { uid: 'u2', displayName: 'Player', photoURL: 'user.png' };

    spyOn(service as any, 'fsDoc').and.callFake((path: string) => ({ path }));
    spyOn(service as any, 'fsGetDoc').and.callFake(async (ref: any) => {
      if (ref.path === 'groups/g1/events/e1') {
        return makeSnap(
          true,
          {
            title: 'Evening Match',
            date: { toDate: () => new Date('2026-02-10T18:00:00.000Z') },
            time: '18:00',
            attendees: ['u1', 'u2'],
            currentAttendees: 2,
            maxAttendees: 10,
          },
          'e1',
        );
      }
      if (ref.path === 'groups/g1') {
        return makeSnap(true, { name: 'Group 1' }, 'g1');
      }
      return makeSnap(false);
    });
    const updateDocSpy = spyOn(service as any, 'fsUpdateDoc').and.returnValue(
      Promise.resolve() as any,
    );

    await service.toggleRSVP('g1', 'e1');

    expect(updateDocSpy).toHaveBeenCalled();
    const updateArgs = updateDocSpy.calls.mostRecent().args as any[];
    expect(updateArgs[0]).toEqual(jasmine.objectContaining({ path: 'groups/g1/events/e1' }));
    expect(updateArgs[1]).toEqual(
      jasmine.objectContaining({
        attendees: ['u1'],
        currentAttendees: 1,
      }),
    );
    expect(notificationServiceStub.notifyGroupMembers).toHaveBeenCalled();
    const notifyArgs = notificationServiceStub.notifyGroupMembers.calls.mostRecent().args as any[];
    expect(notifyArgs[1]).toEqual(['u2']);
    expect(notifyArgs[0]).toEqual(
      jasmine.objectContaining({
        type: 'event_rsvp_no',
        groupId: 'g1',
        eventId: 'e1',
      }),
    );
  });
});
