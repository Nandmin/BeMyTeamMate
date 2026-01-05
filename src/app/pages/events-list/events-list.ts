import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-events-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './events-list.html',
  styleUrl: './events-list.scss',
})
export class EventsList implements OnDestroy {
  private authService = inject(AuthService);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);

  visibleMonth = signal(this.getMonthAnchor(new Date()));
  selectedDate = signal(new Date());
  selectedSport = signal<string | null>(null);

  currentUser = toSignal(this.authService.user$, { initialValue: null });
  userEvents = toSignal(
    this.groupService.getUserGroups().pipe(
      switchMap((groups) => {
        if (!groups || groups.length === 0) return of([]);

        const eventsByGroup$ = groups.map((group) =>
          this.eventService.getEvents(group.id!).pipe(
            map((events) => events.map((event) => ({ ...event, groupId: event.groupId || group.id! })))
          )
        );

        return combineLatest(eventsByGroup$).pipe(map((events) => events.flat()));
      })
    ),
    { initialValue: [] as SportEvent[] }
  );
  now = signal(new Date());
  nextEvent = toSignal(
    this.groupService.getUserGroups().pipe(
      switchMap((groups) => {
        if (!groups || groups.length === 0) return of(null);

        const eventsByGroup$ = groups.map((group) =>
          this.eventService.getEvents(group.id!).pipe(
            map((events) =>
              events
                .map((event) => ({ ...event, groupId: event.groupId || group.id! }))
                .filter((event) => this.isUpcoming(event))
            )
          )
        );

        return combineLatest(eventsByGroup$).pipe(
          map((events) => this.pickNextEvent(events.flat()))
        );
      })
    ),
    { initialValue: null }
  );

  upcomingUserEvents = computed(() => {
    const user = this.currentUser();
    const events = this.userEvents();
    const selectedSport = this.selectedSport();
    if (!user) return [];

    return events
      .filter((event) => this.isUpcoming(event))
      .filter((event) => !selectedSport || event.sport === selectedSport)
      .sort((a, b) => this.getEventDateTime(a).getTime() - this.getEventDateTime(b).getTime())
      .slice(0, 4);
  });

  availableSports = computed(() => {
    const user = this.currentUser();
    const events = this.userEvents();
    if (!user) return [] as string[];

    const sports = new Set<string>();
    for (const event of events) {
      if (!event.attendees || !event.attendees.includes(user.uid)) continue;
      if (!event.sport) continue;
      sports.add(event.sport);
    }

    return Array.from(sports).sort((a, b) => a.localeCompare(b));
  });

  countdown = computed(() => {
    const event = this.nextEvent();
    if (!event) {
      return { hours: '00', minutes: '00', seconds: '00' };
    }

    const target = this.getEventDateTime(event);
    const diffMs = Math.max(target.getTime() - this.now().getTime(), 0);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hours: this.padTime(hours),
      minutes: this.padTime(minutes),
      seconds: this.padTime(seconds),
    };
  });

  isAttending = computed(() => {
    const user = this.currentUser();
    const event = this.nextEvent();
    if (!user || !event) return false;
    return (event.attendees || []).includes(user.uid);
  });

  private calendarEventKeys = computed(() => {
    const user = this.currentUser();
    const events = this.userEvents();
    const keys = new Set<string>();

    if (!user) return keys;

    for (const event of events) {
      if (!event.attendees || !event.attendees.includes(user.uid)) continue;
      if (event.status === 'finished') continue;

      const eventDate = this.getEventDateTime(event);
      if (Number.isNaN(eventDate.getTime())) continue;

      keys.add(this.formatDateKey(eventDate));
    }

    return keys;
  });

  calendarDays = computed(() => {
    const anchor = this.visibleMonth();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - mondayOffset);
    const selectedKey = this.formatDateKey(this.selectedDate());

    const days = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const key = this.formatDateKey(date);
      const inMonth = date.getMonth() === month;
      const isToday = this.formatDateKey(date) === this.formatDateKey(this.now());

      days.push({
        key,
        date,
        label: date.getDate(),
        inMonth,
        isToday,
        isSelected: key === selectedKey,
        hasEvent: this.calendarEventKeys().has(key),
      });
    }

    return days;
  });

  calendarMonthLabel = computed(() => {
    const anchor = this.visibleMonth();
    const label = anchor.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  selectedDayLabel = computed(() => {
    const selected = this.selectedDate();
    return selected.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  selectedDayEvents = computed(() => {
    const user = this.currentUser();
    if (!user) return [] as SportEvent[];

    const selectedKey = this.formatDateKey(this.selectedDate());
    return this.userEvents().filter((event) => {
      if (!event.attendees || !event.attendees.includes(user.uid)) return false;
      if (event.status === 'finished') return false;

      const eventDate = this.getEventDateTime(event);
      if (Number.isNaN(eventDate.getTime())) return false;
      return this.formatDateKey(eventDate) === selectedKey;
    });
  });

  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timerId = setInterval(() => this.now.set(new Date()), 1000);
  }

  ngOnDestroy() {
    if (this.timerId) clearInterval(this.timerId);
  }

  formatDate(date: Date): string {
    const month = date.toLocaleDateString('hu-HU', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }

  getAttendanceText(event: SportEvent): string {
    const current = event.currentAttendees ?? event.attendees?.length ?? 0;
    const max = event.maxAttendees ?? 0;
    return `${current}/${max} fő`;
  }

  getAttendancePercent(event: SportEvent): number {
    const current = event.currentAttendees ?? event.attendees?.length ?? 0;
    const max = event.maxAttendees ?? 0;
    if (!max) return 0;
    return Math.min(Math.round((current / max) * 100), 100);
  }

  getSportIcon(sport?: string): string {
    const value = (sport || '').toLowerCase();
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes('foci') || normalized.includes('soccer')) return 'sports_soccer';
    if (normalized.includes('kosar') || normalized.includes('basket')) return 'sports_basketball';
    if (normalized.includes('padel') || normalized.includes('tenisz') || normalized.includes('tennis')) {
      return 'sports_tennis';
    }
    if (normalized.includes('roplabda') || normalized.includes('volley')) {
      return 'sports_volleyball';
    }
    if (normalized.includes('futas') || normalized.includes('run')) return 'directions_run';
    return 'event';
  }

  goToPreviousMonth() {
    const current = this.visibleMonth();
    const next = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    this.visibleMonth.set(next);
    this.selectedDate.set(new Date(next));
  }

  goToNextMonth() {
    const current = this.visibleMonth();
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    this.visibleMonth.set(next);
    this.selectedDate.set(new Date(next));
  }

  selectDay(date: Date) {
    this.selectedDate.set(new Date(date));
  }

  setSportFilter(sport: string | null) {
    this.selectedSport.set(sport);
  }

  getEventDateTime(event: SportEvent): Date {
    const rawDate = (event as any).dateTime ?? event.date;
    const baseDate = this.coerceDate(rawDate);
    if (event.time) {
      const [hours, minutes] = event.time.split(':').map(Number);
      baseDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    }
    return baseDate;
  }

  private isUpcoming(event: SportEvent): boolean {
    if (event.status === 'finished') return false;
    const eventDate = this.getEventDateTime(event);
    if (Number.isNaN(eventDate.getTime())) return false;
    return eventDate >= new Date();
  }

  private pickNextEvent(events: SportEvent[]): SportEvent | null {
    if (events.length === 0) return null;
    return events.sort(
      (a, b) => this.getEventDateTime(a).getTime() - this.getEventDateTime(b).getTime()
    )[0];
  }

  private padTime(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getMonthAnchor(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private coerceDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }

  async onRsvpYes() {
    await this.setRsvpStatus(true);
  }

  async onRsvpNo() {
    await this.setRsvpStatus(false);
  }

  private async setRsvpStatus(shouldAttend: boolean) {
    const event = this.nextEvent();
    const user = this.currentUser();
    if (!event || !event.id || !event.groupId || !user) return;

    const attending = (event.attendees || []).includes(user.uid);
    if (shouldAttend && attending) return;
    if (!shouldAttend && !attending) return;

    try {
      await this.eventService.toggleRSVP(event.groupId, event.id);
    } catch (error) {
      console.error('RSVP update failed:', error);
    }
  }
}
