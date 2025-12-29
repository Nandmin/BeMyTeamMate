import { Component, inject, signal, computed, effect, Renderer2 } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { EventService, SportEvent } from '../../services/event.service';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './group-detail.page.html',
  styleUrl: './group-detail.page.scss',
})
export class GroupDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  protected authService = inject(AuthService);
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);

  constructor() {
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
    this.route.params.pipe(switchMap((params) => this.eventService.getEvents(params['id'])))
  );

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

  // Recurrence for existing event
  selectedEventForRecurrence = signal<SportEvent | null>(null);
  recurrenceOptions = {
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    until: '',
  };

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
      alert('Hiba történt.');
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
      alert('Hiba történt a csatlakozáskor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatEventDate(timestamp: any) {
    if (!timestamp) return { month: '', day: '' };
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
      alert('Csak csoporttagok jelentkezhetnek az eseményekre.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      await this.eventService.toggleRSVP(groupId, event.id);
    } catch (error: any) {
      console.error('Error toggling RSVP:', error);
      alert(error.message || 'Hiba történt a jelentkezés során.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openAttendeesModal(event: SportEvent) {
    const groupId = this.route.snapshot.params['id'];
    if (!groupId || !event.id) return;
    this.router.navigate(['/groups', groupId, 'events', event.id]);
  }

  // Get attending members for a specific event card
  getAttendingMembersForEvent(event: SportEvent): GroupMember[] {
    const members = this.members();
    if (!members) return [];
    const attendeeIds = event.attendees || [];
    return members.filter((m) => attendeeIds.includes(m.userId));
  }
}
