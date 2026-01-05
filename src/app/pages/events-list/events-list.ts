import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';

interface MockEvent {
  id: string;
  title: string;
  sport: string;
  location: string;
  dateTime: Date;
  attendees: number;
  icon: string;
}

@Component({
  selector: 'app-events-list',
  imports: [CommonModule],
  templateUrl: './events-list.html',
  styleUrl: './events-list.scss',
})
export class EventsList implements OnDestroy {
  private authService = inject(AuthService);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);

  events = signal<MockEvent[]>([
    {
      id: '1',
      title: 'Esti Foci',
      sport: 'Foci',
      location: 'Mara Sportpálya',
      dateTime: new Date(2025, 11, 23, 18, 0),
      attendees: 12,
      icon: '⚽',
    },
    {
      id: '2',
      title: 'Kosárlabda Meccs',
      sport: 'Kosárlabda',
      location: 'Városi Sportcsarnok',
      dateTime: new Date(2025, 11, 24, 19, 30),
      attendees: 8,
      icon: '🏀',
    },
    {
      id: '3',
      title: 'Hétvégi Foci',
      sport: 'Foci',
      location: 'Népliget Pálya',
      dateTime: new Date(2025, 11, 25, 10, 0),
      attendees: 16,
      icon: '⚽',
    },
    {
      id: '4',
      title: 'Röplabda Torna',
      sport: 'Röplabda',
      location: 'Strand Sportpálya',
      dateTime: new Date(2025, 11, 26, 16, 0),
      attendees: 10,
      icon: '🏐',
    },
  ]);

  currentUser = toSignal(this.authService.user$, { initialValue: null });
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

  private getEventDateTime(event: SportEvent): Date {
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
