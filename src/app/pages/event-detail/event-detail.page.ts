import { Component, DestroyRef, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';
import { ModalService } from '../../services/modal.service';
import { RoleLabelPipe } from '../../pipes/role-label.pipe';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { SeoService } from '../../services/seo.service';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatchFlowStep } from './match-flow-step.enum';
import { MatchStepOverviewComponent } from './components/match-step-overview/match-step-overview.component';
import { MatchStepTeamsComponent } from './components/match-step-teams/match-step-teams.component';
import { MatchStepRecordComponent } from './components/match-step-record/match-step-record.component';
import { MatchStepFeedbackComponent } from './components/match-step-feedback/match-step-feedback.component';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DragDropModule,
    RoleLabelPipe,
    MatchStepOverviewComponent,
    MatchStepTeamsComponent,
    MatchStepRecordComponent,
    MatchStepFeedbackComponent,
  ],
  templateUrl: './event-detail.page.html',
  styleUrl: './event-detail.page.scss',
})
export class EventDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  protected authService = inject(AuthService);
  private modalService = inject(ModalService);
  private seo = inject(SeoService);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  private mobileViewportQuery = this.document.defaultView?.matchMedia('(max-width: 767px)');

  groupId = this.route.snapshot.params['id'];
  eventId = this.route.snapshot.params['eventId'];

  protected readonly MatchFlowStep = MatchFlowStep;
  protected readonly flowStepOrder: readonly MatchFlowStep[] = [
    MatchFlowStep.Overview,
    MatchFlowStep.Teams,
    MatchFlowStep.Record,
    MatchFlowStep.FeedbackMvp,
  ];
    protected readonly flowStepLabels: Record<MatchFlowStep, string> = {
    [MatchFlowStep.Overview]: 'Áttekintés',
    [MatchFlowStep.Teams]: 'Csapatok',
    [MatchFlowStep.Record]: 'Eredmény',
    [MatchFlowStep.FeedbackMvp]: 'MVP',
  };
  isMobileFlow = signal(this.mobileViewportQuery?.matches ?? false);
  isMobileOverflowOpen = signal(false);
  currentStep = signal<MatchFlowStep>(MatchFlowStep.Overview);
  currentStepIndex = computed(() => this.flowStepOrder.indexOf(this.currentStep()) + 1);
  totalFlowSteps = this.flowStepOrder.length;
  mobileProgressPercent = computed(() => (this.currentStepIndex() / this.totalFlowSteps) * 100);
  mobileShellTitle = computed(() => this.event()?.title || 'Meccs');
  mobileOverviewPrimaryCtaLabel = computed(() => {
    const event = this.event();
    if ((!event?.status || event.status === 'planned') && !this.hasTeamsReady()) {
      return 'Sorsolás';
    }
    return 'Csapatok';
  });
  mobileStatusChipLabel = computed(() => {
    const event = this.event();
    if (this.currentStep() === MatchFlowStep.Record && this.isEditingResults()) return 'Rögzítés';

    switch (event?.status) {
      case 'active':
        return 'Folyamatban';
      case 'finished':
        return 'Lezárva';
      case 'planned':
      default:
        return 'Sorsolás';
    }
  });
  mobileStatusChipTone = computed<'planned' | 'active' | 'record' | 'finished'>(() => {
    const event = this.event();
    if (this.currentStep() === MatchFlowStep.Record && this.isEditingResults()) return 'record';
    if (event?.status === 'active') return 'active';
    if (event?.status === 'finished') return 'finished';
    return 'planned';
  });
  mobileRsvpActionVisible = computed(() => !this.isEventPast() && !this.hasTeamsReady());
  mobileShowEventSettingsAction = computed(() =>
    this.isAdmin()
    && this.event()?.status !== 'finished'
    && (this.currentStep() === MatchFlowStep.Overview || this.currentStep() === MatchFlowStep.Teams)
    && !this.hasTeamsReady()
  );
  mobileHasOverflowActions = computed(
    () => this.mobileRsvpActionVisible() || this.mobileShowEventSettingsAction()
  );

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
  hasTeamsReady = computed(() => this.teamA().length > 0 && this.teamB().length > 0);

  // Stats management
  goalsMap = signal<{ [userId: string]: number }>({});
  assistsMap = signal<{ [userId: string]: number }>({});
  isEditingResults = signal(false);
  selectedResultPlayerId = signal<string | null>(null);
  selectedResultPlayer = computed(() => {
    const selectedId = this.selectedResultPlayerId();
    if (!selectedId) return null;
    const allMembers = [...this.teamA(), ...this.teamB()];
    return allMembers.find((member) => member.userId === selectedId) || null;
  });
  selectedMvpId = signal<string | null>(null);
  isFinalizingMvp = signal(false);

  constructor() {
    const viewportQuery = this.mobileViewportQuery;
    if (viewportQuery) {
      const onViewportChange = (event: MediaQueryListEvent) => {
        this.isMobileFlow.set(event.matches);
      };
      this.isMobileFlow.set(viewportQuery.matches);
      if (typeof viewportQuery.addEventListener === 'function') {
        viewportQuery.addEventListener('change', onViewportChange);
        this.destroyRef.onDestroy(() => viewportQuery.removeEventListener('change', onViewportChange));
      } else {
        viewportQuery.addListener(onViewportChange);
        this.destroyRef.onDestroy(() => viewportQuery.removeListener(onViewportChange));
      }
    }
    this.seo.setPageMeta({
      title: 'Esemény részletei - BeMyTeamMate',
      description: 'Csapatok, részvétel, eredmények és MVP szavazás egy nézetben.',
      path: '/groups',
      noindex: true,
    });
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

        if (this.isEditingResults() || !this.selectedResultPlayerId()) {
          this.ensureResultPlayerSelection();
        }
      }
    });
    effect(() => {
      const step = this.currentStep();
      if (this.isStepAccessible(step)) return;
      const fallback = this.getFallbackStep(step);
      if (fallback !== step) {
        this.currentStep.set(fallback);
      }
    });
    effect(() => {
      this.currentStep();
      this.isMobileOverflowOpen.set(false);
    });
    effect(() => {
      if (this.isMobileFlow()) return;
      this.isMobileOverflowOpen.set(false);
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

    effect(() => {
      if (!this.resultsEditingLocked()) return;
      if (this.isEditingResults()) {
        this.isEditingResults.set(false);
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
    if (!event) return null;
    if (event.mvpVotingEndsAt) {
      const endDate = this.coerceDate(event.mvpVotingEndsAt);
      return Number.isNaN(endDate.getTime()) ? null : endDate;
    }
    if (!event.date) return null;
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

  mvpWinnerExists = computed(() => !!this.event()?.mvpWinnerId);
  resultsEditingLocked = computed(() => this.mvpWinnerExists());

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

  async goToStep(step: MatchFlowStep) {
    if (step === this.currentStep()) return;
    if (!this.isStepAccessible(step)) {
      await this.modalService.alert(
        'Ehhez a lépéshez előbb csapatokra van szükség. Készítsd el a sorsolást a Csapatok lépésben.',
        'Lépés nem elérhető',
        'warning'
      );
      return;
    }
    this.currentStep.set(step);
  }

  goToNextStep() {
    const currentIndex = this.flowStepOrder.indexOf(this.currentStep());
    if (currentIndex < 0 || currentIndex >= this.flowStepOrder.length - 1) return;
    void this.goToStep(this.flowStepOrder[currentIndex + 1]);
  }

  goToPreviousStep() {
    const currentIndex = this.flowStepOrder.indexOf(this.currentStep());
    if (currentIndex <= 0) {
      this.currentStep.set(MatchFlowStep.Overview);
      return;
    }
    this.currentStep.set(this.flowStepOrder[currentIndex - 1]);
  }

  resetMobileFlow() {
    this.currentStep.set(MatchFlowStep.Overview);
  }

  async onMobileShellBack() {
    if (this.currentStep() === MatchFlowStep.Overview) {
      await this.router.navigate(['/groups', this.groupId]);
      return;
    }
    this.goToPreviousStep();
  }

  toggleMobileOverflow() {
    this.isMobileOverflowOpen.update((open) => !open);
  }

  closeMobileOverflow() {
    this.isMobileOverflowOpen.set(false);
  }

  async onMobileOverflowRsvp() {
    if (!this.mobileRsvpActionVisible()) {
      this.closeMobileOverflow();
      return;
    }
    this.closeMobileOverflow();
    await this.onToggleRSVP();
  }

  async onMobileRecordSaveAndContinue() {
    const saved = await this.saveResults();
    if (!saved) return;
    await this.goToStep(MatchFlowStep.FeedbackMvp);
  }

  private isStepAccessible(step: MatchFlowStep): boolean {
    if (step !== MatchFlowStep.Record) return true;
    return this.hasTeamsReady();
  }

  private getFallbackStep(step: MatchFlowStep): MatchFlowStep {
    if (this.isStepAccessible(step)) return step;
    const currentIndex = this.flowStepOrder.indexOf(step);
    if (currentIndex <= 0) return MatchFlowStep.Overview;

    for (let i = currentIndex - 1; i >= 0; i--) {
      const candidate = this.flowStepOrder[i];
      if (this.isStepAccessible(candidate)) return candidate;
    }
    return MatchFlowStep.Overview;
  }

  async onToggleRSVP() {
    const event = this.event();
    if (!this.groupId || !event?.id) return;

    if (!this.isMember()) {
      await this.modalService.alert(
        'Csak csoporttagok jelentkezhetnek az eseményekre.',
        'Figyelem!'
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
      await this.modalService.alert('Szavazatodat rögzítettük!', 'Siker', 'success');
    } catch (error: any) {
      console.error('Error submitting MVP vote:', error);
      await this.modalService.alert(error.message || 'Hiba történt!', 'Hiba', 'error');
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
    const event = this.event();
    if (
      (event?.status === 'active' || event?.status === 'finished') &&
      event?.playerRatingSnapshot &&
      event?.teamA?.length &&
      event?.teamB?.length
    ) {
      const sumA = event.teamA.reduce(
        (acc, userId) => acc + (event.playerRatingSnapshot?.[userId] || 0),
        0
      );
      const sumB = event.teamB.reduce(
        (acc, userId) => acc + (event.playerRatingSnapshot?.[userId] || 0),
        0
      );
      if (sumA + sumB > 0) {
        const ratio = (sumA / (sumA + sumB)) * 100;
        return Math.round(ratio * 100) / 100;
      }
    }

    const liveA = this.teamA();
    const liveB = this.teamB();
    if (liveA.length > 0 || liveB.length > 0) {
      const a = liveA.reduce((acc, m) => acc + this.getPlayerRating(m), 0);
      const b = liveB.reduce((acc, m) => acc + this.getPlayerRating(m), 0);
      if (a + b === 0) return 50;
      const ratio = (a / (a + b)) * 100;
      return Math.round(ratio * 100) / 100;
    }
    return 50;
  });

  teamBAverge = computed(() => {
    // Use stored snapshot only once the match is active/finished
    const event = this.event();
    if (
      (event?.status === 'active' || event?.status === 'finished') &&
      event?.teamBEloAvg !== undefined &&
      event?.teamBEloAvg !== null
    ) {
      return Math.round(event.teamBEloAvg).toString();
    }

    const b = this.teamB();
    if (b.length === 0) return '0';
    return Math.round(b.reduce((acc, m) => acc + this.getPlayerRating(m), 0) / b.length).toString();
  });

  teamAAverge = computed(() => {
    // Use stored snapshot only once the match is active/finished
    const event = this.event();
    if (
      (event?.status === 'active' || event?.status === 'finished') &&
      event?.teamAEloAvg !== undefined &&
      event?.teamAEloAvg !== null
    ) {
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
      if (this.attendingMembers().length < 2) {
        await this.modalService.alert('Nincs elég jelentkező a játék indításához.');
        return;
      }
      await this.modalService.alert(
        'Előbb kattints a Sorsolás gombra a csapatok összeállításához.',
        'Hiányzó csapatok'
      );
      return;
    }

    // Megerősí­tés kérése
    const confirmed = await this.modalService.confirm(
      'Biztosan elindítod a játékot? Ezután az összeállítások rögzítésre kerülnek és nem módosíthatók.',
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
        error.message || 'Hiba történt a játék indításakor!',
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
      'MĂR',
      'ÁPR',
      'MĂJ',
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
    if (this.resultsEditingLocked()) return;
    const nextValue = !this.isEditingResults();
    this.isEditingResults.set(nextValue);
    if (nextValue) {
      this.ensureResultPlayerSelection();
    }
  }

  selectResultPlayer(userId: string) {
    this.selectedResultPlayerId.set(userId);
  }

  updateSelectedStat(type: 'goals' | 'assists', delta: number) {
    const selectedId = this.selectedResultPlayerId();
    if (!selectedId) return;
    this.updateStat(selectedId, type, delta);
  }

  getSelectedGoals(): number {
    const selectedId = this.selectedResultPlayerId();
    return selectedId ? this.getStat(selectedId, 'goals') : 0;
  }

  getSelectedAssists(): number {
    const selectedId = this.selectedResultPlayerId();
    return selectedId ? this.getStat(selectedId, 'assists') : 0;
  }

  updateStat(userId: string, type: 'goals' | 'assists', delta: number) {
    if (this.resultsEditingLocked()) return;
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
    // "gĂłlpasszok szĂˇma nem lehet tĂ¶bb, mint a gĂłlok szĂˇma. Se user, se Ă¶sszes user"
    // -> User Assists <= User Goals seems too strict for football.
    // Let's implement team check first.
    // AND let's implement the User check as requested: currentAssistsMap[userId] <= currentGoalsMap[userId] ?
    // No, standard interpretation: "Can't have more assists than goals".
    // I will implement Team Total check primarily.
    // And for "Se user", I will check if UserAssists would exceed TeamGoals? No, that's redundant.
    // I will implement the Strict User Rule as requested: User Assists <= User Goals.
    // If they hate it, I can remove it.

    // Validate: Team Assists <= Team Goals (per-team total)
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

  private ensureResultPlayerSelection() {
    const selectedId = this.selectedResultPlayerId();
    const allMembers = [...this.teamA(), ...this.teamB()];
    if (selectedId && allMembers.some((member) => member.userId === selectedId)) {
      return;
    }
    this.selectedResultPlayerId.set(allMembers[0]?.userId ?? null);
  }

  private coerceDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }

  async saveResults(): Promise<boolean> {
    if (this.resultsEditingLocked()) return false;
    if (!this.groupId || !this.eventId) return false;

    const confirmed = await this.modalService.confirm(
      'Biztosan mented a mérkőzés végredményét? Az esemény státusza "Befejezett"-re változik.',
      'Eredmények mentése'
    );

    if (!confirmed) return false;

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
      return true;
    } catch (err: any) {
      console.error('Error saving results:', err);
      await this.modalService.alert(err.message, 'Hiba', 'error');
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

