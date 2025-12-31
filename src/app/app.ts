import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FooterComponent } from './components/footer/footer';
import { HeaderComponent } from './components/header/header';
import { ModalComponent } from './components/modal/modal.component';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FooterComponent,
    HeaderComponent,
    ModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private router = inject(Router);
  protected readonly title = signal('BeMyTeamMate');
  protected showNav = signal(true);
  protected showFooter = signal(true);
  protected showHeader = signal(true);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        // Show nav on all pages except login and register
        this.showNav.set(
          event.urlAfterRedirects !== '/login' && event.urlAfterRedirects !== '/register'
        );
        // Hide footer on login page to prevent scrolling
        this.showFooter.set(
          event.urlAfterRedirects !== '/login' && event.urlAfterRedirects !== '/register'
        );

        // Header visibility logic
        this.showHeader.set(true); // Always show header as requested, or adjust if needed

        // Scroll to top on navigation
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      });
  }
}
