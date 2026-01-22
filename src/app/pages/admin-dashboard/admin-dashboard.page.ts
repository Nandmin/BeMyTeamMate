import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { GroupService } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage {
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  private modalService = inject(ModalService);
  private adminGroupsCacheKey = 'admin:groups:list';
  isSidebarCollapsed = false;
  activeSection: 'overview' | 'groups' | 'users' | 'stats' | 'messages' = 'overview';
  isQuerying = false;
  hasQueried = false;
  pageSizeOptions = [10, 50, 100];
  pageSize = 10;
  currentPage = 1;
  groups: Array<{
    id: string;
    name: string;
    creator: string;
    createdAt: string;
    memberCount: number;
    eventCount: number;
    lastEventAt: string;
  }> = [];

  constructor() {
    this.loadCachedGroups();
    if (this.groups.length > 0) {
      this.hasQueried = true;
      this.currentPage = 1;
    }
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  setSection(section: 'overview' | 'groups' | 'users' | 'stats' | 'messages'): void {
    this.activeSection = section;
  }

  async runQuery(): Promise<void> {
    if (this.isQuerying) return;
    this.isQuerying = true;
    try {
      this.loadCachedGroups();
      const rows = await this.fetchGroupRows(true);
      this.groups = rows;
      this.saveCachedGroups(rows);
      this.currentPage = 1;
      this.hasQueried = true;
    } catch (error) {
      console.error('Admin groups query failed:', error);
    } finally {
      this.isQuerying = false;
    }
  }

  editGroup(groupId: string): void {
    console.info('Edit group', groupId);
  }

  async confirmDeleteGroup(groupId: string): Promise<void> {
    const group = this.groups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const confirmed = await this.modalService.confirm(
      `Biztosan törlöd a(z) "${group.name}" csoportot?`,
      'Törlés megerősítése',
      'Törlés',
      'Mégse'
    );
    if (!confirmed) {
      return;
    }

    this.groups = this.groups.filter((item) => item.id !== groupId);
    this.saveCachedGroups(this.groups);
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.groups.length / this.pageSize));
  }

  get pagedGroups(): AdminDashboardPage['groups'] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.groups.slice(start, start + this.pageSize);
  }

  private loadCachedGroups(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(this.adminGroupsCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data: AdminDashboardPage['groups']; ts: number };
      if (!parsed?.data?.length) return;
      this.groups = parsed.data;
    } catch {
      // ignore cache errors
    }
  }

  private saveCachedGroups(groups: AdminDashboardPage['groups']): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const entry = { data: groups, ts: Date.now() };
      window.localStorage.setItem(this.adminGroupsCacheKey, JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private async fetchGroupRows(forceRefresh: boolean): Promise<AdminDashboardPage['groups']> {
    const groups = await firstValueFrom(this.groupService.getGroups(forceRefresh).pipe(take(1)));

    const rows = await Promise.all(
      groups
        .filter((group) => !!group.id)
        .map(async (group) => {
          const groupId = group.id as string;
          const events = await this.fetchGroupEvents(groupId, forceRefresh);
          const lastEventDate = this.getLastEventDate(events);
          return {
            id: groupId,
            name: group.name,
            creator: group.ownerName || 'Ismeretlen',
            createdAt: this.formatDate(group.createdAt),
            memberCount: group.memberCount ?? 0,
            eventCount: events.length,
            lastEventAt: lastEventDate ? this.formatDateTime(lastEventDate) : '--',
          };
        })
    );

    return rows;
  }

  private async fetchGroupEvents(groupId: string, forceRefresh: boolean): Promise<SportEvent[]> {
    if (forceRefresh) {
      this.eventService.refreshGroupEvents(groupId);
    }

    const [upcoming, past] = await Promise.all([
      firstValueFrom(this.eventService.getUpcomingEvents(groupId).pipe(take(1))),
      firstValueFrom(this.eventService.getPastEvents(groupId).pipe(take(1))),
    ]);

    return [...past, ...upcoming];
  }

  private getLastEventDate(events: SportEvent[]): Date | null {
    let latest: Date | null = null;

    for (const event of events) {
      const eventDate = this.toDate(event.date);
      if (!eventDate) continue;
      if (event.time) {
        const [h, m] = event.time.split(':').map(Number);
        if (!Number.isNaN(h) && !Number.isNaN(m)) {
          eventDate.setHours(h, m, 0, 0);
        }
      }
      if (!latest || eventDate > latest) {
        latest = eventDate;
      }
    }

    return latest;
  }

  private formatDate(value: any): string {
    const date = this.toDate(value);
    if (!date) return '--';
    return date
      .toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\s/g, '');
  }

  private formatDateTime(date: Date): string {
    const datePart = date
      .toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\s/g, '');
    const timePart = date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
