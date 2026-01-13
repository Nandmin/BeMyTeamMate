import { Component, inject, signal, computed, HostListener, ElementRef, ViewChild } from '@angular/core';
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
  public isFilterOpen = signal(false);
  public filterEventId = signal<string | null>(null);
  @ViewChild('notifPanel') notifPanel?: ElementRef<HTMLElement>;
  @ViewChild('notifButton') notifButton?: ElementRef<HTMLElement>;

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

  public filteredNotifications = computed(() => {
    const eventId = this.filterEventId();
    const all = this.notifications();
    if (!eventId) return all;
    return all.filter(
      (n) => this.isRsvpNotification(n) && this.getNotificationFilterKey(n) === eventId
    );
  });

  public availableEventFilters = computed(() => {
    const seen = new Map<string, string>();
    this.notifications().forEach((n) => {
      if (!this.isRsvpNotification(n)) return;
      const key = this.getNotificationFilterKey(n);
      if (!key || seen.has(key)) return;
      seen.set(key, this.getNotificationTitle(n));
    });
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }));
  });

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

  toggleFilter() {
    this.isFilterOpen.update((open) => !open);
  }

  setFilter(eventId: string) {
    this.filterEventId.set(eventId || null);
    if (!eventId) this.isFilterOpen.set(false);
  }

  async clearNotifications() {
    const uid = this.authService.currentUser()?.uid;
    if (!uid) return;
    await this.notificationService.deleteAllNotifications(uid);
    this.filterEventId.set(null);
    this.isFilterOpen.set(false);
  }

  closeNotifications() {
    this.isNotificationsOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.isNotificationsOpen()) return;
    const target = event.target as Node | null;
    const panelEl = this.notifPanel?.nativeElement;
    const buttonEl = this.notifButton?.nativeElement;
    if (panelEl?.contains(target as Node) || buttonEl?.contains(target as Node)) return;
    this.closeNotifications();
  }

  @HostListener('document:keydown.escape')
  onEscapePress() {
    if (!this.isNotificationsOpen()) return;
    this.closeNotifications();
  }

  formatTime(value: any) {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Most';
    if (minutes < 60) return `${minutes} perce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} órája`;
    const days = Math.floor(hours / 24);
    return `${days} napja`;
  }

  private getNotificationEventId(notification: AppNotification): string | null {
    if (notification.eventId) return notification.eventId;
    if (!notification.link) return null;
    const match = notification.link.match(/\/events\/([^/]+)$/);
    return match ? match[1] : null;
  }

  getNotificationTitle(notification: AppNotification): string {
    return this.getRsvpEventLabel(notification) || notification.title || 'Értesítés';
  }

  private getNotificationFilterKey(notification: AppNotification): string | null {
    if (!this.isRsvpNotification(notification)) return null;
    const eventId = this.getNotificationEventId(notification);
    if (eventId) return eventId;
    const label = this.getRsvpEventLabel(notification);
    if (label) return `label:${label}`;
    if (notification.link) return `link:${notification.link}`;
    return null;
  }

  private getRsvpEventLabel(notification: AppNotification): string | null {
    if (!this.isRsvpNotification(notification)) return null;
    const title = (notification.title || '').trim();
    if (this.isEventTitleWithDate(title)) return title;
    const body = (notification.body || '').trim();
    const match = body.match(/az esem[ée]nyen:\s*(.+?)\s*\(/i);
    return match ? match[1].trim() : null;
  }

  private isEventTitleWithDate(title: string) {
    return /\d{4}\.\d{2}\.\d{2}\.\s*\d{2}:\d{2}/.test(title);
  }

  private isRsvpNotification(notification: AppNotification) {
    return notification.type === 'event_rsvp_yes' || notification.type === 'event_rsvp_no';
  }
}
