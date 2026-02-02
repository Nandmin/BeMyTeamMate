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
  protected readonly title = signal('BeMyTeamMate');
  protected showNav = signal(true);
  protected showFooter = signal(true);
  protected showHeader = signal(true);
  private isMobile = signal(false);

  constructor() {
    this.analyticsService.init();
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe({
        next: (event: VersionEvent) => {
          if (event.type === 'VERSION_READY') {
            // TODO: notify user about the new version.
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
