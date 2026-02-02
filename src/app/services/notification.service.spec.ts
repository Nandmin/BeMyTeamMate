import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { installMockLocalStorage } from '../testing/local-storage.mock';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

describe('NotificationService cache', () => {
  let restoreLocalStorage: () => void;
  let service: NotificationService;

  const authServiceStub = {
    user$: of(null),
    currentUser: () => null,
  };

  beforeEach(() => {
    const { restore } = installMockLocalStorage();
    restoreLocalStorage = restore;
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authServiceStub },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    restoreLocalStorage();
  });

  it('setCachedNotifications stores in memory and localStorage', () => {
    const items = [
      { id: 'n1', title: 't', body: 'b', groupId: 'g', createdAt: new Date() } as any,
    ];

    (service as any).setCachedNotifications('u1', items);

    expect((service as any).notificationCache.get('u1')).toBeTruthy();
    expect(window.localStorage.getItem('notifications:u1')).toBeTruthy();
  });

  it('evicts oldest entries when cache exceeds limit', () => {
    (service as any).maxCacheEntries = 2;
    window.localStorage.setItem('notifications:u1', JSON.stringify({ data: [], ts: 1 }));
    window.localStorage.setItem('notifications:u2', JSON.stringify({ data: [], ts: 2 }));

    (service as any).setCachedNotifications('u3', []);

    expect(window.localStorage.getItem('notifications:u1')).toBeNull();
    expect(window.localStorage.getItem('notifications:u2')).toBeTruthy();
    expect(window.localStorage.getItem('notifications:u3')).toBeTruthy();
  });
});
