import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { AnalyticsService } from './services/analytics.service';
import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';
import { ThemeService } from './services/theme.service';
import { SwUpdate } from '@angular/service-worker';

const analyticsServiceStub = {
  init: () => undefined,
  consent: () => 'unknown',
  isNativeApp: () => false,
  grantConsent: () => undefined,
  denyConsent: () => undefined,
};

const authServiceStub = {
  user$: of(null),
  currentUser: () => null,
  logout: () => Promise.resolve(),
};

const notificationServiceStub = {
  watchNotifications: () => of([]),
  markAllAsRead: () => Promise.resolve(),
  deleteAllNotifications: () => Promise.resolve(),
  syncTokenForCurrentUser: () => undefined,
  listenForForegroundMessages: () => undefined,
};

const themeServiceStub = {
  toggleTheme: () => undefined,
};

const swUpdateStub = {
  isEnabled: true,
  versionUpdates: of(),
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AnalyticsService, useValue: analyticsServiceStub },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: notificationServiceStub },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: SwUpdate, useValue: swUpdateStub },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.bottom-nav')).toBeTruthy();
  });
});
