import { Component, inject, signal, computed, effect, Renderer2 } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, combineLatest, map } from 'rxjs';
import { EventService, SportEvent } from '../../services/event.service';
import { ModalService } from '../../services/modal.service';
import { CoverImageSelectorComponent } from '../../components/cover-image-selector/cover-image-selector.component';
import { RoleLabelPipe } from '../../pipes/role-label.pipe';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CoverImageSelectorComponent, RoleLabelPipe],
  templateUrl: './group-detail.page.html',
  styleUrl: './group-detail.page.scss',
})
export class GroupDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  protected authService = inject(AuthService);
  private modalService = inject(ModalService);
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);
  private seo = inject(SeoService);
  protected math = Math;

  selectedView = signal<'upcoming' | 'previous'>('upcoming');

  constructor() {
    this.seo.setPageMeta({
      title: 'Csoport részletei – BeMyTeamMate',
      description: 'Csoport események, tagok és statisztikák egy helyen.',
      path: '/groups',
      noindex: true,
    });
    effect(() => {
      const isModalOpen = !!this.selectedEventForRecurrence();
      const mainContent = this.document.querySelector('.main-content');

      if (mainContent) {
        if (isModalOpen) {
          this.renderer.addClass(mainContent, 'no-scroll');
        } else {
          this.renderer.removeClass(mainContent, 'no-scroll');
        }
      }
    });
  }

  group = toSignal(
    this.route.params.pipe(switchMap((params) => this.groupService.getGroup(params['id'])))
  );

  members = toSignal(
    this.route.params.pipe(switchMap((params) => this.groupService.getGroupMembers(params['id'])))
  );

  events = toSignal(
    this.route.params.pipe(
      switchMap((params) =>
        combineLatest([
          this.eventService.getUpcomingEventsInternal(params['id'], {
            daysAhead: 3650,
            limit: 500,
          }),
          this.eventService.getPastEventsInternal(params['id'], {
            daysBack: 3650,
            limit: 500,
          }),
        ]).pipe(map(([upcoming, past]) => [...upcoming, ...past]))
      )
    )
  );

  currentPage = signal(1);
  pageSize = 5;

  totalPages = computed(() => Math.ceil(this.sortedEvents().length / this.pageSize));

  visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const range: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) range.push(i);
    } else {
      range.push(1);
      if (current > 3) range.push('...');

      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);

      for (let i = start; i <= end; i++) range.push(i);

      if (current < total - 2) range.push('...');
      range.push(total);
    }
    return range;
  });

  sortedEvents = computed(() => {
    const allEvents = this.events();
    if (!allEvents) return [];

    const view = this.selectedView();

    return allEvents
      .filter((event) => {
        const isPast = this.isEventPast(event);
        return view === 'upcoming' ? !isPast : isPast;
      })
      .sort((a, b) => {
        // Sort upcoming ascending (nearest first), previous descending (newest first)
        const timeA = this.getEventDateTime(a).getTime();
        const timeB = this.getEventDateTime(b).getTime();
        return view === 'upcoming' ? timeA - timeB : timeB - timeA;
      });
  });

  paginatedEvents = computed(() => {
    const events = this.sortedEvents();
    const start = (this.currentPage() - 1) * this.pageSize;
    return events.slice(start, start + this.pageSize);
  });

  setView(view: 'upcoming' | 'previous') {
    this.selectedView.set(view);
    this.currentPage.set(1);
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
    }
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
    }
  }

  goToPage(page: number | string) {
    if (typeof page === 'number') {
      this.currentPage.set(page);
    }
  }

  matchStats = computed(() => {
    const events = this.events();
    if (!events) return { played: 0, pending: 0, total: 0 };
    const played = events.filter((event) => this.isEventPast(event)).length;
    const total = events.length;
    return { played, pending: Math.max(total - played, 0), total };
  });

  protected isEventPast(event: SportEvent): boolean {
    if (event.status === 'finished') return true;
    if (event.goalsA !== undefined || event.goalsB !== undefined) return true;
    if (event.playerStats && Object.keys(event.playerStats).length > 0) return true;
    if (!event.date) return false;

    return this.getEventDateTime(event) < new Date();
  }

  isMember = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    return members.some((m) => m.userId === user.uid);
  });

  isAdmin = computed(() => {
    const user = this.authService.currentUser();
    const group = this.group();
    const members = this.members();
    if (!user || !group) return false;
    // Owner is always admin
    if (group.ownerId === user.uid) return true;
    // Check if user has admin role in members
    if (!members) return false;
    return members.some((m) => m.userId === user.uid && m.isAdmin);
  });

  isSubmitting = signal(false);
  showImageSelector = signal(false);

  availableCoverImages = [
    'assets/groupPictures/1636475245-untgRIFep_md.jpg',
    'assets/groupPictures/ball-7610545_640.jpg',
    'assets/groupPictures/ball-9856638_640.jpg',
    'assets/groupPictures/basketball-2258650_640.jpg',
    'assets/groupPictures/basketball-3571730_640.jpg',
    'assets/groupPictures/basketball-7121617_640.jpg',
    'assets/groupPictures/basketball-7605637_640.jpg',
    'assets/groupPictures/football-1406106_640.jpg',
    'assets/groupPictures/football-257489_640.png',
    'assets/groupPictures/football-3024154_640.jpg',
    'assets/groupPictures/football-488714_640.jpg',
    'assets/groupPictures/football-6616819_640.jpg',
    'assets/groupPictures/football-8266065_640.jpg',
    'assets/groupPictures/football_grass_play_football_games_soccer_garden_summer_activity-623521.jpg',
    'assets/groupPictures/grass-2616911_640.jpg',
    'assets/groupPictures/kormend-3430879_640.jpg',
    'assets/groupPictures/moon-4919501_640.jpg',
    'assets/groupPictures/res_9280ed553018260e8c2df6b33786d17e.webp',
    'assets/groupPictures/soccer-4586282_640.jpg',
    'assets/groupPictures/soccer-5506110_640.jpg',
    'assets/groupPictures/soccer-698553_640.jpg',
    'assets/groupPictures/stafion.webp',
  ];

  // Recurrence for existing event
  selectedEventForRecurrence = signal<SportEvent | null>(null);
  recurrenceOptions = {
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    until: '',
  };

  get groupId(): string {
    return this.route.snapshot.params['id'];
  }

  openImageSelector() {
    if (!this.isAdmin()) return;
    this.showImageSelector.set(true);
  }

  closeImageSelector() {
    this.showImageSelector.set(false);
  }

  async selectCoverImage(imagePath: string) {
    if (!this.isAdmin() || !this.groupId) return;

    this.isSubmitting.set(true);
    try {
      await this.groupService.updateGroup(this.groupId, { image: imagePath });
      this.showImageSelector.set(false);
    } catch (error) {
      console.error('Error updating group image:', error);
      await this.modalService.alert('Hiba tĂ¶rtĂ©nt a borĂ­tĂłkĂ©p mentĂ©sekor.', 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openRecurrenceModal(event: SportEvent) {
    this.selectedEventForRecurrence.set(event);
  }

  async convertToRecurring() {
    const event = this.selectedEventForRecurrence();
    const groupId = this.route.snapshot.params['id'];
    if (!event || !groupId || !this.recurrenceOptions.until) return;

    this.isSubmitting.set(true);
    try {
      const [year, month, day] = this.recurrenceOptions.until.split('-').map(Number);
      const untilDate = new Date(year, month - 1, day);
      const recurrenceId = crypto.randomUUID();

      // 1. Update existing event with recurrenceId
      await this.eventService.updateEvent(groupId, event.id!, { recurrenceId });

      // 2. Create future instances
      const nextDate = new Date(event.date.toDate());
      if (this.recurrenceOptions.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (this.recurrenceOptions.frequency === 'weekly')
        nextDate.setDate(nextDate.getDate() + 7);
      else if (this.recurrenceOptions.frequency === 'monthly')
        nextDate.setMonth(nextDate.getMonth() + 1);

      if (nextDate <= untilDate) {
        await this.eventService.createRecurringEvents(
          groupId,
          {
            title: event.title,
            sport: event.sport,
            date: Timestamp.fromDate(nextDate),
            time: event.time,
            duration: event.duration,
            location: event.location,
            maxAttendees: event.maxAttendees,
            recurrenceId, // Pass the same ID
          },
          this.recurrenceOptions.frequency,
          Timestamp.fromDate(untilDate)
        );
      }

      this.selectedEventForRecurrence.set(null);
    } catch (error) {
      console.error('Error making recurring:', error);
      await this.modalService.alert('Hiba történt.', 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onJoinGroup() {
    const groupId = this.route.snapshot.params['id'];
    if (!groupId) return;

    this.isSubmitting.set(true);
    try {
      await this.groupService.joinGroup(groupId);
    } catch (error) {
      console.error('Error joining group:', error);
      await this.modalService.alert('Hiba történt a csatlakozáskor.', 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatEventDate(timestamp: any) {
    const date = this.coerceDate(timestamp);
    if (isNaN(date.getTime())) return { month: '---', day: '--' };
    const months = [
      'JAN',
      'FEB',
      'MÁR',
      'ÁPR',
      'MÁJ',
      'JÚN',
      'JÚL',
      'AUG',
      'SZEP',
      'OKT',
      'NOV',
      'DEC',
    ];
    return {
      month: months[date.getMonth()],
      day: date.getDate().toString(),
    };
  }

  private getEventDateTime(event: SportEvent): Date {
    const rawDate = (event as any).dateTime ?? event.date;
    const eventDate = this.coerceDate(rawDate);

    if (event.time) {
      const [hours, minutes] = event.time.split(':').map(Number);
      eventDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    }

    return eventDate;
  }

  isUserAttending(event: SportEvent): boolean {
    const user = this.authService.currentUser();
    if (!user || !event.attendees) return false;
    return event.attendees.includes(user.uid);
  }

  async onToggleRSVP(event: SportEvent) {
    const groupId = this.route.snapshot.params['id'];
    if (!groupId || !event.id) return;

    // Check if user is a member first
    if (!this.isMember()) {
      await this.modalService.alert(
        'Csak csoporttagok jelentkezhetnek az eseményekre.',
        'Figyelem',
        'warning'
      );
      return;
    }

    this.isSubmitting.set(true);
    try {
      await this.eventService.toggleRSVP(groupId, event.id);
    } catch (error: any) {
      console.error('Error toggling RSVP:', error);
      await this.modalService.alert(
        error.message || 'Hiba történt a jelentkezés során.',
        'Hiba',
        'error'
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openAttendeesModal(event: SportEvent) {
    const groupId = this.route.snapshot.params['id'];
    if (!groupId || !event.id) return;
    this.router.navigate(['/groups', groupId, 'events', event.id]);
  }

  private coerceDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }

  // Get attending members for a specific event card
  getAttendingMembersForEvent(event: SportEvent): GroupMember[] {
    const members = this.members();
    if (!members) return [];
    const attendeeIds = event.attendees || [];
    return members.filter((m) => attendeeIds.includes(m.userId));
  }
}
