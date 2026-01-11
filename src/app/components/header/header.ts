import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent {
  public authService = inject(AuthService);
  public themeService = inject(ThemeService);
  public notificationService = inject(NotificationService);
  public isNotificationsOpen = signal(false);

  public notifications = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => {
        if (!user?.uid) return of([] as AppNotification[]);
        return this.notificationService.watchNotifications(user.uid);
      })
    ),
    { initialValue: [] as AppNotification[] }
  );

  public unreadCount = computed(
    () => this.notifications().filter((n) => !n.read).length
  );

  async onLogout() {
    try {
      await this.authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  async toggleNotifications() {
    this.isNotificationsOpen.update((open) => !open);
    if (!this.isNotificationsOpen()) return;
    const uid = this.authService.currentUser()?.uid;
    if (uid) {
      await this.notificationService.markAllAsRead(uid);
    }
  }

  closeNotifications() {
    this.isNotificationsOpen.set(false);
  }

  formatTime(value: any) {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
}
