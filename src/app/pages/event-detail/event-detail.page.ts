import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';
import { ModalService } from '../../services/modal.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
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
  private modalService = inject(ModalService);

  groupId = this.route.snapshot.params['id'];
  eventId = this.route.snapshot.params['eventId'];

  group = toSignal(this.groupService.getGroup(this.groupId));

  // Directly fetch the specific event
  event = toSignal(
    this.route.params.pipe(
      switchMap((params) => this.eventService.watchEvent(params['id'], params['eventId']))
    )
  );

  members = toSignal(this.groupService.getGroupMembers(this.groupId));

  teamA = signal<GroupMember[]>([]);
  teamB = signal<GroupMember[]>([]);

  // Stats management
  goalsMap = signal<{ [userId: string]: number }>({});
  assistsMap = signal<{ [userId: string]: number }>({});
  isEditingResults = signal(false);
  selectedMvpId = signal<string | null>(null);
  isFinalizingMvp = signal(false);

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

        // Initialize stats if finished or present
        if (event.playerStats) {
          const goals: any = {};
          const assists: any = {};
          Object.entries(event.playerStats).forEach(([id, stats]) => {
            goals[id] = stats.goals;
            assists[id] = stats.assists;
          });
          this.goalsMap.set(goals);
          this.assistsMap.set(assists);
        }
      }
    });

    effect(() => {
      const event = this.event();
      if (!event?.mvpVotingEnabled || event.status !== 'finished') return;
      if (event.mvpEloAwarded || this.isFinalizingMvp()) return;
      const end = this.mvpVotingEndAt();
      if (!end) return;
      if (new Date() < end) return;

      this.isFinalizingMvp.set(true);
      this.eventService
        .finalizeMvpVotingIfNeeded(this.groupId, event.id!)
        .catch((error) => console.error('Error finalizing MVP vote:', error))
        .finally(() => this.isFinalizingMvp.set(false));
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

  isAdmin = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    const member = members.find((m) => m.userId === user.uid);
    return (
      member?.isAdmin || member?.role === 'Csapatkapitány' || this.group()?.ownerId === user.uid
    );
  });

  isUserAttending = computed(() => {
    const user = this.authService.currentUser();
    const event = this.event();
    if (!user || !event?.attendees) return false;
    return event.attendees.includes(user.uid);
  });

  isEventPast = computed(() => {
    const event = this.event();
    if (!event) return false;
    if (!event.date) return false;

    const eventDate = this.coerceDate(event.date);
    if (Number.isNaN(eventDate.getTime())) return false;
    eventDate.setHours(0, 0, 0, 0);

    if (event.time) {
      const [hours, minutes] = event.time.split(':').map(Number);
      eventDate.setHours(hours, minutes);
    }

    return eventDate < new Date();
  });

  mvpVotingEndAt = computed(() => {
    const event = this.event();
    if (!event?.date) return null;
    const eventDate = this.coerceDate(event.date);
    if (Number.isNaN(eventDate.getTime())) return null;
    eventDate.setHours(23, 59, 59, 999);
    return eventDate;
  });

  mvpVotingOpen = computed(() => {
    const event = this.event();
    if (!event?.mvpVotingEnabled) return false;
    if (event.status !== 'finished') return false;
    const end = this.mvpVotingEndAt();
    if (!end) return false;
    return new Date() < end;
  });

  mvpUserVote = computed(() => {
    const event = this.event();
    const user = this.authService.currentUser();
    if (!event || !user) return null;
    return event.mvpVotes?.[user.uid] || null;
  });

  mvpWinnerMember = computed(() => {
    const event = this.event();
    const members = this.members();
    if (!event?.mvpWinnerId || !members) return null;
    return members.find((m) => m.userId === event.mvpWinnerId) || null;
  });

  mvpUserVotedMember = computed(() => {
    const votedFor = this.mvpUserVote();
    const members = this.members();
    if (!votedFor || !members) return null;
    return members.find((m) => m.userId === votedFor) || null;
  });

  canVoteMvp = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return false;
    if (!this.isUserAttending()) return false;
    if (!this.mvpVotingOpen()) return false;
    if (this.mvpUserVote()) return false;
    return true;
  });

  mvpCandidates = computed(() => {
    const user = this.authService.currentUser();
    const attendees = this.attendingMembers();
    if (!user) return attendees;
    return attendees.filter((member) => member.userId !== user.uid);
  });

  async onToggleRSVP() {
    const event = this.event();
    if (!this.groupId || !event?.id) return;

    if (!this.isMember()) {
      await this.modalService.alert(
        'Csak csoporttagok jelentkezhetnek az eseményekre.',
        'Figyelem'
      );
      return;
    }

    // Prevent RSVP if event is in the past
    if (this.isEventPast()) {
      await this.modalService.alert(
        'Már nem jelentkezhetsz erre az eseményre, vagy nem mondhatod le a részvételt, mivel az időpontja elmúlt.',
        'Esemény lejárt'
      );
      return;
    }

    // Check if event is already active/finished
    if (this.isUserAttending() && (event.status === 'active' || event.status === 'finished')) {
      await this.modalService.alert(
        'Már nem mondhatod le a részvételt, mivel a csapatok már véglegesítve lettek.',
        'Nem lehetséges'
      );
      return;
    }

    this.isSubmitting.set(true);
    try {
      await this.eventService.toggleRSVP(this.groupId, event.id);
    } catch (error: any) {
      console.error('Error toggling RSVP:', error);
      await this.modalService.alert(error.message || 'Hiba történt.', 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitMvpVote() {
    const event = this.event();
    const selected = this.selectedMvpId();
    if (!this.groupId || !event?.id || !selected) return;

    this.isSubmitting.set(true);
    try {
      await this.eventService.submitMvpVote(this.groupId, event.id, selected);
      await this.modalService.alert('Szavazat rögzítve!', 'Siker', 'success');
    } catch (error: any) {
      console.error('Error submitting MVP vote:', error);
      await this.modalService.alert(error.message || 'Hiba történt.', 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // Helper to determine player rating (Elo > Skill)
  private getPlayerRating(member: GroupMember): number {
    if (member.elo !== undefined && member.elo !== null) return member.elo;
    // Map skill (0-100) to Elo (approx 0-2400?)
    // Default 50 -> 1200
    return (member.skillLevel || 50) * 24;
  }

  teamABalance = computed(() => {
    const a = this.teamA().reduce((acc, m) => acc + this.getPlayerRating(m), 0);
    const b = this.teamB().reduce((acc, m) => acc + this.getPlayerRating(m), 0);
    if (a + b === 0) return 50;
    return Math.round((a / (a + b)) * 100);
  });

  teamBAverge = computed(() => {
    // Use stored snapshot only once the match is active/finished
    const event = this.event();
    if ((event?.status === 'active' || event?.status === 'finished') && event?.teamBEloAvg) {
      return Math.round(event.teamBEloAvg).toString();
    }

    const b = this.teamB();
    if (b.length === 0) return '0';
    return Math.round(b.reduce((acc, m) => acc + this.getPlayerRating(m), 0) / b.length).toString();
  });

  teamAAverge = computed(() => {
    // Use stored snapshot only once the match is active/finished
    const event = this.event();
    if ((event?.status === 'active' || event?.status === 'finished') && event?.teamAEloAvg) {
      return Math.round(event.teamAEloAvg).toString();
    }

    const a = this.teamA();
    if (a.length === 0) return '0';
    return Math.round(a.reduce((acc, m) => acc + this.getPlayerRating(m), 0) / a.length).toString();
  });

  generateTeams() {
    // Don't regenerate if event is already active/finished (although button should be disabled)
    // Actually, if we are in view mode, we don't want to re-shuffle based on live data if teams are fixed.
    // But teamA/teamB signals are populated in effect() based on event data if active/finished, so this fn is for "planning" phase.
    const attendees = [...this.attendingMembers()].sort(
      (a, b) => this.getPlayerRating(b) - this.getPlayerRating(a)
    );
    if (attendees.length < 2) return;

    const a: GroupMember[] = [];
    const b: GroupMember[] = [];
    let sumA = 0;
    let sumB = 0;

    // Greedy balancing
    attendees.forEach((player) => {
      const rating = this.getPlayerRating(player);
      if (sumA <= sumB) {
        a.push(player);
        sumA += rating;
      } else {
        b.push(player);
        sumB += rating;
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
        await this.modalService.alert('Nincs elég jelentkező a játék indításához.');
        return;
      }
    }

    // Megerősítés kérése
    const confirmed = await this.modalService.confirm(
      'Biztosan elindítod a játékot? Ezután a csapatok rögzítésre kerülnek és nem módosíthatóak.',
      'Játék indítása'
    );

    if (!confirmed) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const teamAIds = this.teamA().map((m) => m.userId);
      const teamBIds = this.teamB().map((m) => m.userId);

      // Save current averages
      const teamAAvg = parseFloat(this.teamAAverge());
      const teamBAvg = parseFloat(this.teamBAverge());
      const playerRatingSnapshot: { [userId: string]: number } = {};
      [...this.teamA(), ...this.teamB()].forEach((member) => {
        playerRatingSnapshot[member.userId] = this.getPlayerRating(member);
      });

      await this.eventService.startEvent(
        this.groupId,
        event.id!,
        teamAIds,
        teamBIds,
        teamAAvg,
        teamBAvg,
        playerRatingSnapshot
      );
    } catch (error: any) {
      console.error('Error starting game:', error);
      await this.modalService.alert(
        error.message || 'Hiba történt a játék indításakor.',
        'Hiba',
        'error'
      );
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

  formatEventDate(timestamp: any) {
    if (!timestamp) return { month: '', day: '' };
    const date = this.coerceDate(timestamp);
    if (Number.isNaN(date.getTime())) return { month: '', day: '' };
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

  formatFullDate(timestamp: any) {
    if (!timestamp) return '';
    const date = this.coerceDate(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  // --- Result Management Logic ---

  toggleResultsEdit() {
    this.isEditingResults.update((v) => !v);
  }

  updateStat(userId: string, type: 'goals' | 'assists', delta: number) {
    if (!this.event() || (this.event()?.status !== 'active' && !this.isEditingResults())) return;

    // Determine user's team
    const inTeamA = this.teamA().some((m) => m.userId === userId);
    const teamMembers = inTeamA ? this.teamA() : this.teamB();

    // Current State
    const currentGoalsMap = { ...this.goalsMap() };
    const currentAssistsMap = { ...this.assistsMap() };
    const currentVal = (type === 'goals' ? currentGoalsMap : currentAssistsMap)[userId] || 0;
    const newVal = Math.max(0, currentVal + delta);

    // Projected State
    if (type === 'goals') currentGoalsMap[userId] = newVal;
    else currentAssistsMap[userId] = newVal;

    // Validate: 1. User Assists <= User Goals (Strict Interpretation of "Se user")
    // Wait, the user might mean "User Assists <= Total Team Goals"?
    // "gólpasszok száma nem lehet több, mint a gólok száma. Se user, se összes user"
    // -> User Assists <= User Goals seems too strict for football.
    // Let's implement team check first.
    // AND let's implement the User check as requested: currentAssistsMap[userId] <= currentGoalsMap[userId] ?
    // No, standard interpretation: "Can't have more assists than goals".
    // I will implement Team Total check primarily.
    // And for "Se user", I will check if UserAssists would exceed TeamGoals? No, that's redundant.
    // I will implement the Strict User Rule as requested: User Assists <= User Goals.
    // If they hate it, I can remove it.

    const userGoals = currentGoalsMap[userId] || 0;
    const userAssists = currentAssistsMap[userId] || 0;

    // Strict User Check: User cannot have more assists than goals?
    // "Se user" -> "Neither for the user".
    // I will apply: UserAssists <= UserGoals.
    if (userAssists > userGoals) {
      // Allow decrementing assists even if goal is low? No, we are checking the RESULTING state.
      // If we just decremented a goal, we might be in violation.
      // If we incremented an assist, we might be in violation.

      // Exception: If we are decrementing a goal, we should block it if assists exist?
      // Let's just block the action.
      return;
    }

    // Validate: 2. Team Assists <= Team Goals (Global)
    const teamGoals = teamMembers.reduce((sum, m) => sum + (currentGoalsMap[m.userId] || 0), 0);
    const teamAssists = teamMembers.reduce((sum, m) => sum + (currentAssistsMap[m.userId] || 0), 0);

    if (teamAssists > teamGoals) {
      return;
    }

    const map = type === 'goals' ? this.goalsMap : this.assistsMap;
    map.update((m) => ({ ...m, [userId]: newVal }));
  }

  getStat(userId: string, type: 'goals' | 'assists'): number {
    const map = type === 'goals' ? this.goalsMap : this.assistsMap;
    return map()[userId] || 0;
  }

  calculateTeamGoals(team: 'A' | 'B'): number {
    const members = team === 'A' ? this.teamA() : this.teamB();
    return members.reduce((sum, m) => sum + this.getStat(m.userId, 'goals'), 0);
  }

  private coerceDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }

  async saveResults() {
    if (!this.groupId || !this.eventId) return;

    const confirmed = await this.modalService.confirm(
      'Biztosan mented a mérkőzés végeredményét? Az esemény státusza "Véget ért"-re változik.',
      'Eredmények mentése'
    );

    if (!confirmed) return;

    this.isSubmitting.set(true);
    try {
      const stats: { [userId: string]: any } = {};
      const allMembers = [...this.teamA(), ...this.teamB()];

      allMembers.forEach((m) => {
        stats[m.userId] = {
          goals: this.getStat(m.userId, 'goals'),
          assists: this.getStat(m.userId, 'assists'),
        };
      });

      const goalsA = this.calculateTeamGoals('A');
      const goalsB = this.calculateTeamGoals('B');

      await this.eventService.saveMatchResults(
        this.groupId,
        this.eventId,
        stats,
        goalsA,
        goalsB,
        this.teamA(),
        this.teamB()
      );
      this.isEditingResults.set(false);
      await this.modalService.alert('Az eredmények sikeresen mentve!', 'Siker', 'success');
    } catch (err: any) {
      console.error('Error saving results:', err);
      await this.modalService.alert(err.message, 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
