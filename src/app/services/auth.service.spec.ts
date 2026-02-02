import { installMockLocalStorage } from '../testing/local-storage.mock';
import { AuthService } from './auth.service';

describe('AuthService cache', () => {
  let restoreLocalStorage: (() => void) | null = null;
  let service: AuthService;

  beforeEach(() => {
    const { restore } = installMockLocalStorage();
    restoreLocalStorage = restore;
    service = Object.create(AuthService.prototype) as AuthService;
    (service as any).cacheTtlMs = 5 * 60 * 1000;
    (service as any).profileCache = new Map();
    (service as any).maxProfileCacheEntries = 100;
  });

  afterEach(() => {
    restoreLocalStorage?.();
  });

  it('setCachedProfile stores in memory and localStorage', () => {
    const profile = { uid: 'u1', displayName: 'User' } as any;
    (service as any).setCachedProfile('u1', profile);

    expect((service as any).profileCache.get('u1')).toBeTruthy();
    expect(window.localStorage.getItem('userProfile:u1')).toBeTruthy();
  });

  it('setCachedProfile falls back to memory-only on quota errors', () => {
    const profile = { uid: 'u1', displayName: 'User' } as any;
    spyOn(console, 'warn');
    const originalSet = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('Quota exceeded');
    };

    (service as any).setCachedProfile('u1', profile);

    expect((service as any).profileCache.get('u1')).toBeTruthy();
    expect(console.warn).toHaveBeenCalled();
    window.localStorage.setItem = originalSet;
  });
});
