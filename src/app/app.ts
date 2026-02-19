import { Component, signal, inject } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FooterComponent } from './components/footer/footer';
import { HeaderComponent } from './components/header/header';
import { ModalComponent } from './components/modal/modal.component';
import { CookieConsentComponent } from './components/cookie-consent/cookie-consent';

import { ThemeService } from './services/theme.service';
import { NotificationService } from './services/notification.service';
import { AuthService } from './services/auth.service';
import { AnalyticsService } from './services/analytics.service';
import { SwUpdate, VersionEvent } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FooterComponent,
    HeaderComponent,
    ModalComponent,
    CookieConsentComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private router = inject(Router);
  // Inject ThemeService to initialize theme immediately on app load
  private themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private analyticsService = inject(AnalyticsService);
  private swUpdate = inject(SwUpdate);
  private readonly swReloadMarkerKey = 'sw:updated-hash';
  protected readonly title = signal('BeMyTeamMate');
  protected showNav = signal(true);
  protected showFooter = signal(true);
  protected showHeader = signal(true);
  private isMobile = signal(false);

  constructor() {
    this.redirectEmailVerificationCallbacks();
    this.analyticsService.init();
    if (this.swUpdate.isEnabled) {
      void this.checkForAppUpdate();
      setInterval(() => {
        void this.checkForAppUpdate();
      }, 10 * 60 * 1000);
      this.swUpdate.versionUpdates.subscribe({
        next: (event: VersionEvent) => {
          if (event.type === 'VERSION_READY') {
            void this.activateAndReload(event.latestVersion.hash);
          }
          if (event.type === 'VERSION_INSTALLATION_FAILED') {
            console.error('Service worker update failed:', event);
          }
        },
        error: (err) => {
          console.error('Service worker versionUpdates error:', err);
        },
      });
    } else {
      console.warn('Service worker is disabled or failed to register.');
    }
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    this.isMobile.set(mediaQuery.matches);
    mediaQuery.addEventListener('change', (event) => {
      this.isMobile.set(event.matches);
      this.updateFooterVisibility(this.router.url);
    });

    this.notificationService.listenForForegroundMessages();

    this.authService.user$.subscribe((user) => {
      if (!user?.uid) return;
      this.notificationService.syncTokenForCurrentUser();
      this.notificationService.listenForForegroundMessages();
    });

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        // Show nav on all pages except login and register
        this.showNav.set(
          event.urlAfterRedirects !== '/login' && event.urlAfterRedirects !== '/register'
        );
        this.updateFooterVisibility(event.urlAfterRedirects);

        // Header visibility logic
        this.showHeader.set(true); // Always show header as requested, or adjust if needed

        // Scroll to top on navigation
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      });
  }

  private async checkForAppUpdate() {
    try {
      await this.swUpdate.checkForUpdate();
    } catch (err) {
      console.error('Service worker checkForUpdate failed:', err);
    }
  }

  private async activateAndReload(nextHash: string) {
    if (typeof window === 'undefined') return;

    try {
      const lastReloadedHash = window.sessionStorage.getItem(this.swReloadMarkerKey);
      if (lastReloadedHash === nextHash) return;

      await this.swUpdate.activateUpdate();
      window.sessionStorage.setItem(this.swReloadMarkerKey, nextHash);
      window.location.reload();
    } catch (err) {
      console.error('Service worker activateUpdate failed:', err);
    }
  }

  private redirectEmailVerificationCallbacks() {
    if (typeof window === 'undefined') return;

    const currentUrl = new URL(window.location.href);
    const directMode = currentUrl.searchParams.get('mode');
    const directOobCode = currentUrl.searchParams.get('oobCode');

    const linkParam = currentUrl.searchParams.get('link');
    const nestedUrl = this.tryParseUrl(linkParam);
    const nestedMode = nestedUrl?.searchParams.get('mode');
    const nestedOobCode = nestedUrl?.searchParams.get('oobCode');

    const mode = directMode ?? nestedMode;
    const oobCode = directOobCode ?? nestedOobCode;
    const isFirebaseActionPath =
      currentUrl.pathname === '/__/auth/action' || currentUrl.pathname === '/_/auth/action';
    const isVerifyAction = mode === 'verifyEmail';

    if (!isFirebaseActionPath && !isVerifyAction) return;
    if (currentUrl.pathname === '/verify-email') return;

    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    if (oobCode) params.set('oobCode', oobCode);
    if (!oobCode && isVerifyAction) params.set('verified', '1');

    const target = params.toString() ? `/verify-email?${params.toString()}` : '/verify-email';
    void this.router.navigateByUrl(target, { replaceUrl: true });
  }

  private tryParseUrl(value: string | null): URL | null {
    if (!value) return null;
    try {
      return new URL(value);
    } catch {
      try {
        return new URL(value, window.location.origin);
      } catch {
        return null;
      }
    }
  }

  private updateFooterVisibility(url: string) {
    const path = url.split('?')[0];
    if (path === '/login' || path === '/register') {
      this.showFooter.set(false);
      return;
    }

    if (this.isMobile()) {
      this.showFooter.set(path === '/' || path === '');
      return;
    }

    this.showFooter.set(true);
  }
}
