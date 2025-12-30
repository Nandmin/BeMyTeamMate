import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, DragDropModule],
  templateUrl: './event-detail.page.html',
  styleUrl: './event-detail.page.scss',
})
export class EventDetailPage {
  private route = inject(ActivatedRoute);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  protected authService = inject(AuthService);

  groupId = this.route.snapshot.params['id'];
  eventId = this.route.snapshot.params['eventId'];

  group = toSignal(this.groupService.getGroup(this.groupId));

  // Directly fetch the specific event
  event = toSignal(
    this.route.params.pipe(
      switchMap((params) => this.eventService.getEvents(params['id'])),
      map((events) => events.find((e) => e.id === this.eventId))
    )
  );

  members = toSignal(this.groupService.getGroupMembers(this.groupId));

  teamA = signal<GroupMember[]>([]);
  teamB = signal<GroupMember[]>([]);

  constructor() {
    effect(() => {
      const event = this.event();
      const members = this.members();

      if (event && members && (event.status === 'active' || event.status === 'finished')) {
        if (event.teamA) {
          this.teamA.set(members.filter((m) => event.teamA?.includes(m.userId)));
        }
        if (event.teamB) {
          this.teamB.set(members.filter((m) => event.teamB?.includes(m.userId)));
        }
      }
    });
  }

  attendingMembers = computed(() => {
    const event = this.event();
    const members = this.members();
    if (!event || !members) return [];
    const attendeeIds = event.attendees || [];
    return members.filter((m) => attendeeIds.includes(m.userId));
  });

  notRespondingMembers = computed(() => {
    const event = this.event();
    const members = this.members();
    if (!event || !members) return [];
    const attendeeIds = event.attendees || [];
    return members.filter((m) => !attendeeIds.includes(m.userId));
  });

  isSubmitting = signal(false);

  isMember = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    return members.some((m) => m.userId === user.uid);
  });

  isUserAttending = computed(() => {
    const user = this.authService.currentUser();
    const event = this.event();
    if (!user || !event?.attendees) return false;
    return event.attendees.includes(user.uid);
  });

  async onToggleRSVP() {
    const event = this.event();
    if (!this.groupId || !event?.id) return;

    if (!this.isMember()) {
      alert('Csak csoporttagok jelentkezhetnek az eseményekre.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      await this.eventService.toggleRSVP(this.groupId, event.id);
    } catch (error: any) {
      console.error('Error toggling RSVP:', error);
      alert(error.message || 'Hiba történt.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  teamABalance = computed(() => {
    const a = this.teamA().reduce((acc, m) => acc + (m.skillLevel || 50), 0);
    const b = this.teamB().reduce((acc, m) => acc + (m.skillLevel || 50), 0);
    if (a + b === 0) return 50;
    return Math.round((a / (a + b)) * 100);
  });

  teamBAverge = computed(() => {
    const b = this.teamB();
    if (b.length === 0) return 0;
    return (b.reduce((acc, m) => acc + (m.skillLevel || 50), 0) / b.length / 10).toFixed(1);
  });

  teamAAverge = computed(() => {
    const a = this.teamA();
    if (a.length === 0) return 0;
    return (a.reduce((acc, m) => acc + (m.skillLevel || 50), 0) / a.length / 10).toFixed(1);
  });

  generateTeams() {
    const attendees = [...this.attendingMembers()].sort(
      (a, b) => (b.skillLevel || 50) - (a.skillLevel || 50)
    );
    if (attendees.length < 2) return;

    const a: GroupMember[] = [];
    const b: GroupMember[] = [];
    let sumA = 0;
    let sumB = 0;

    // Greedy balancing
    attendees.forEach((player) => {
      if (sumA <= sumB) {
        a.push(player);
        sumA += player.skillLevel || 50;
      } else {
        b.push(player);
        sumB += player.skillLevel || 50;
      }
    });

    this.teamA.set(a);
    this.teamB.set(b);
  }

  async onStartGame() {
    const event = this.event();
    if (!event || !this.groupId || !this.isMember()) return;

    if (this.teamA().length === 0 && this.teamB().length === 0) {
      // Ha nincs csapat generálva, de van elég ember, generáljunk
      if (this.attendingMembers().length >= 2) {
        this.generateTeams();
      } else {
        alert('Nincs elég jelentkező a játék indításához.');
        return;
      }
    }

    // Megerősítés kérése
    if (
      !confirm(
        'Biztosan elindítod a játékot? Ezután a csapatok rögzítésre kerülnek és nem módosíthatóak.'
      )
    ) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const teamAIds = this.teamA().map((m) => m.userId);
      const teamBIds = this.teamB().map((m) => m.userId);
      await this.eventService.startEvent(this.groupId, event.id!, teamAIds, teamBIds);
    } catch (error: any) {
      console.error('Error starting game:', error);
      alert(error.message || 'Hiba történt a játék indításakor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  drop(event: CdkDragDrop<GroupMember[]>) {
    if (event.previousContainer === event.container) {
      const list = event.container.id === 'teamA' ? [...this.teamA()] : [...this.teamB()];
      moveItemInArray(list, event.previousIndex, event.currentIndex);
      if (event.container.id === 'teamA') {
        this.teamA.set(list);
      } else {
        this.teamB.set(list);
      }
    } else {
      const prevList =
        event.previousContainer.id === 'teamA' ? [...this.teamA()] : [...this.teamB()];
      const currList = event.container.id === 'teamA' ? [...this.teamA()] : [...this.teamB()];

      transferArrayItem(prevList, currList, event.previousIndex, event.currentIndex);

      if (event.previousContainer.id === 'teamA') {
        this.teamA.set(prevList);
        this.teamB.set(currList);
      } else {
        this.teamB.set(prevList);
        this.teamA.set(currList);
      }
    }
  }

  formatDate(timestamp: any) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }
}
