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

    expect((service as any).groupCache.get('g1')).toBeTruthy();
    expect(window.localStorage.getItem('group:g1')).toBeTruthy();
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

    window.localStorage.setItem('group:g1', JSON.stringify({ data: group, ts: 1 }));
    window.localStorage.setItem('group:g2', JSON.stringify({ data: group, ts: 2 }));

    (service as any).setCachedGroup('g3', group);

    expect(window.localStorage.getItem('group:g1')).toBeNull();
    expect(window.localStorage.getItem('group:g2')).toBeTruthy();
    expect(window.localStorage.getItem('group:g3')).toBeTruthy();
  });
});
