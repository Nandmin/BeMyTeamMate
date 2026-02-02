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
