import { Component, inject, signal, computed, effect, Renderer2, DestroyRef } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupMember, GroupInvite } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, combineLatest, map, of, catchError, tap } from 'rxjs';
import { EventService, SportEvent } from '../../services/event.service';
import { ModalService } from '../../services/modal.service';
import { CoverImageSelectorComponent } from '../../components/cover-image-selector/cover-image-selector.component';
import { RoleLabelPipe } from '../../pipes/role-label.pipe';
import { SeoService } from '../../services/seo.service';
import { CoverImageEntry, CoverImagesService } from '../../services/cover-images.service';
import { AppUser } from '../../models/user.model';

type GroupDetailMobileTab = 'overview' | 'events' | 'members' | 'settings';

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
  private destroyRef = inject(DestroyRef);
  private seo = inject(SeoService);
  private coverImagesService = inject(CoverImagesService);
  protected math = Math;
  private inviteParams = toSignal(this.route.queryParams, { initialValue: {} as any });
  private mobileViewportQuery = this.document.defaultView?.matchMedia('(max-width: 767px)');
  private readonly mobileTabs: readonly GroupDetailMobileTab[] = [
    'overview',
    'events',
    'members',
    'settings',
  ];
  private readonly mobileLeaveConfirmToken = 'KILEPEK';

  selectedView = signal<'upcoming' | 'previous'>('upcoming');
  mobileTab = signal<GroupDetailMobileTab>('overview');
  isMobileViewport = signal(this.mobileViewportQuery?.matches ?? false);
  showMobileActionSheet = signal(false);
  showMobileLeaveConfirm = signal(false);
  mobileLeaveConfirmText = signal('');

  constructor() {
    this.seo.setPageMeta({
      title: 'Csoport részletei – BeMyTeamMate',
      description: 'Csoport események, tagok és statisztikák egy helyen.',
      path: '/groups',
      noindex: true,
    });
    const viewportQuery = this.mobileViewportQuery;
    if (viewportQuery) {
      const onViewportChange = (event: MediaQueryListEvent) => {
        this.isMobileViewport.set(event.matches);
      };
      this.isMobileViewport.set(viewportQuery.matches);
      if (typeof viewportQuery.addEventListener === 'function') {
        viewportQuery.addEventListener('change', onViewportChange);
        this.destroyRef.onDestroy(() => viewportQuery.removeEventListener('change', onViewportChange));
      } else {
        viewportQuery.addListener(onViewportChange);
        this.destroyRef.onDestroy(() => viewportQuery.removeListener(onViewportChange));
      }
    }

    void this.loadCoverImages();
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
    effect(() => {
      const inviteFlag = this.inviteParams()['invite'];
      const user = this.authService.currentUser();
      const members = this.members();
      if (!inviteFlag || !user) return;
      if (members === undefined) return;
      if (this.isMember() || this.isAdmin()) {
        this.clearInviteQueryParam();
        return;
      }
      void this.openInviteWithFallback(
        'A meghívó már nem aktív vagy nem található.',
        'Meghívó',
      );
    });
    effect(() => {
      const group = this.group();
      const user = this.authService.currentUser();
      const members = this.members();
      if (!group || !user) return;
      if (group.type !== 'closed') return;
      if (members === undefined) return;
      if (this.isMember() || this.isAdmin()) return;
      if (this.inviteAcceptedGrace()) return;
      if (this.showInviteDecisionModal()) return;
      void this.openInviteWithFallback(
        'Ez a csoport zárt. Meghívó nélkül nem tekinthető meg.',
        'Hozzáférés megtagadva',
      );
    });
    effect(() => {
      if (this.inviteAcceptedGrace() && this.isMember()) {
        this.inviteAcceptedGrace.set(false);
      }
    });
    effect(() => {
      const nextTab = this.coerceMobileTab(this.inviteParams()['tab']);
      if (this.mobileTab() !== nextTab) {
        this.mobileTab.set(nextTab);
      }
    });
    effect(() => {
      if (this.mobileTab() !== 'overview' && this.showMobileActionSheet()) {
        this.showMobileActionSheet.set(false);
      }
    });
    effect(() => {
      if (this.mobileTab() !== 'settings' && this.showMobileLeaveConfirm()) {
        this.showMobileLeaveConfirm.set(false);
      }
    });
  }

  private coerceMobileTab(value: unknown): GroupDetailMobileTab {
    return typeof value === 'string' && this.mobileTabs.includes(value as GroupDetailMobileTab)
      ? (value as GroupDetailMobileTab)
      : 'overview';
  }

  private async loadCoverImages(tag?: string) {
    this.availableCoverImages = await this.coverImagesService.getImageEntries(tag);
  }

  resolveCoverImage(imageId?: number | string | null): string {
    return (
      this.coverImagesService.resolveImageSrc(imageId) ||
      this.coverImagesService.getDefaultImageSrc()
    );
  }

  group = toSignal(
    this.route.params.pipe(
      switchMap((params) =>
        this.groupService.getGroup(params['id']).pipe(
          catchError((err) => {
            console.error('Group load error:', err);
            void this.modalService.alert(
              'Nincs jogosultságod a csoport megtekintéséhez.',
              'Hozzáférés megtagadva',
              'warning',
            );
            void this.router.navigate(['/groups']);
            return of(undefined);
          }),
        ),
      ),
    ),
  );

  membersReload = signal(0);

  members = toSignal(
    combineLatest([this.route.params, toObservable(this.membersReload)]).pipe(
      switchMap(([params]) =>
        this.groupService.getGroupMembers(params['id']).pipe(
          catchError((err) => {
            console.warn('Members load denied or failed:', err);
            return of([] as GroupMember[]);
          }),
        ),
      ),
    ),
  );

  isMember = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    return members.some((m) => m.userId === user.uid || m.id === user.uid);
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

  isOwner = computed(() => {
    const user = this.authService.currentUser();
    const group = this.group();
    if (!user || !group) return false;
    return group.ownerId === user.uid;
  });

  canLeaveGroup = computed(() => this.isMember() && !this.isOwner());

  canViewEvents = computed(() => this.isMember() || this.isAdmin());
  hasMobileSecondaryActions = computed(() => !this.isMember() || this.isAdmin());
  canConfirmMobileLeave = computed(
    () => this.mobileLeaveConfirmText().trim().toUpperCase() === this.mobileLeaveConfirmToken,
  );

  canViewGroupContent = computed(() => {
    const group = this.group();
    if (!group) return false;
    if (group.type === 'open') return true;
    const members = this.members();
    if (members === undefined) return false;
    return this.isMember() || this.isAdmin();
  });

  eventsReload = signal(0);
  eventsLoading = signal(true);
  eventsError = signal('');

  events = toSignal(
    combineLatest([
      this.route.params,
      toObservable(this.canViewEvents),
      toObservable(this.eventsReload),
    ]).pipe(
      switchMap(([params, canView]) => {
        this.eventsError.set('');
        if (!canView) {
          this.eventsLoading.set(false);
          return of([] as SportEvent[]);
        }
        this.eventsLoading.set(true);
        return combineLatest([
          this.eventService.getUpcomingEventsInternal(params['id'], {
            daysAhead: 3650,
            limit: 500,
          }),
          this.eventService.getPastEventsInternal(params['id'], {
            daysBack: 3650,
            limit: 500,
          }),
        ]).pipe(
          map(([upcoming, past]) => [...upcoming, ...past]),
          tap(() => this.eventsLoading.set(false)),
          catchError((err) => {
            console.error('Events load error:', err);
            this.eventsError.set('Hiba tortent az esemenyek betoltesekor.');
            this.eventsLoading.set(false);
            return of([] as SportEvent[]);
          }),
        );
      }),
    ),
    { initialValue: [] as SportEvent[] },
  );

  currentPage = signal(1);
  pageSize = 5;
  mobileVisibleEventsCount = signal(5);

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

  mobileVisibleEvents = computed(() => {
    const events = this.sortedEvents();
    return events.slice(0, this.mobileVisibleEventsCount());
  });

  eventsForViewport = computed(() =>
    this.isMobileViewport() ? this.mobileVisibleEvents() : this.paginatedEvents(),
  );

  hasMoreMobileEvents = computed(
    () => this.mobileVisibleEvents().length < this.sortedEvents().length,
  );

  setView(view: 'upcoming' | 'previous') {
    this.selectedView.set(view);
    this.currentPage.set(1);
    this.mobileVisibleEventsCount.set(this.pageSize);
  }

  setMobileTab(tab: GroupDetailMobileTab) {
    if (!this.mobileTabs.includes(tab)) return;
    if (this.showMobileActionSheet()) {
      this.showMobileActionSheet.set(false);
    }
    if (this.showMobileLeaveConfirm()) {
      this.showMobileLeaveConfirm.set(false);
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
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

  isSubmitting = signal(false);
  showImageSelector = signal(false);
  showInviteModal = signal(false);
  inviteLookup = signal('');
  inviteLookupStatus = signal<'idle' | 'loading' | 'found' | 'not_found' | 'error'>('idle');
  inviteLookupMessage = signal('');
  inviteCandidate = signal<AppUser | null>(null);
  isInviting = signal(false);

  showInviteDecisionModal = signal(false);
  pendingInvite = signal<GroupInvite | null>(null);
  inviteDecisionError = signal('');
  inviteLegalAccepted = signal(false);
  isInviteDecisionSubmitting = signal(false);
  inviteGateInProgress = signal(false);
  inviteAcceptedGrace = signal(false);

  availableCoverImages: CoverImageEntry[] = [];

  // Recurrence for existing event
  selectedEventForRecurrence = signal<SportEvent | null>(null);
  recurrenceOptions = {
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    until: '',
  };

  get groupId(): string {
    return this.route.snapshot.params['id'];
  }

  goBackToGroups() {
    void this.router.navigate(['/groups']);
  }

  loadMoreEvents() {
    const total = this.sortedEvents().length;
    this.mobileVisibleEventsCount.update((count) => Math.min(count + this.pageSize, total));
  }

  reloadEvents() {
    this.eventsReload.update((value) => value + 1);
  }

  toggleMobileActionSheet() {
    this.showMobileActionSheet.update((isOpen) => !isOpen);
  }

  closeMobileActionSheet() {
    this.showMobileActionSheet.set(false);
  }

  onMobileInviteAction() {
    this.closeMobileActionSheet();
    this.openInviteModal();
  }

  onMobileJoinAction() {
    this.closeMobileActionSheet();
    void this.onJoinGroup();
  }

  openMobileLeaveConfirm() {
    this.mobileLeaveConfirmText.set('');
    this.showMobileLeaveConfirm.set(true);
  }

  closeMobileLeaveConfirm() {
    this.mobileLeaveConfirmText.set('');
    this.showMobileLeaveConfirm.set(false);
  }

  onConfirmMobileLeave() {
    if (!this.canConfirmMobileLeave()) return;
    this.closeMobileLeaveConfirm();
    void this.onLeaveGroup(true);
  }

  openImageSelector() {
    if (!this.isAdmin()) return;
    this.showImageSelector.set(true);
  }

  closeImageSelector() {
    this.showImageSelector.set(false);
  }

  async selectCoverImage(imageId: number) {
    if (!this.isAdmin() || !this.groupId) return;

    this.isSubmitting.set(true);
    try {
      await this.groupService.updateGroup(this.groupId, { image: imageId });
      this.showImageSelector.set(false);
    } catch (error) {
      console.error('Error updating group image:', error);
      await this.modalService.alert('Hiba történt a borítókép mentésekor.', 'Hiba', 'error');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openInviteModal() {
    if (!this.isAdmin()) return;
    this.resetInviteLookup();
    this.showInviteModal.set(true);
  }

  closeInviteModal() {
    this.showInviteModal.set(false);
  }

  private resetInviteLookup() {
    this.inviteLookup.set('');
    this.inviteLookupStatus.set('idle');
    this.inviteLookupMessage.set('');
    this.inviteCandidate.set(null);
  }

  async findInvitee() {
    if (!this.isAdmin()) return;
    const value = this.inviteLookup().trim();
    if (!value) {
      this.inviteLookupStatus.set('error');
      this.inviteLookupMessage.set('Add meg a felhasználónevet vagy e-mail címet.');
      this.inviteCandidate.set(null);
      return;
    }

    this.inviteLookupStatus.set('loading');
    this.inviteLookupMessage.set('');
    this.inviteCandidate.set(null);

    try {
      const user = await this.groupService.findUserByIdentifier(value);
      if (!user) {
        this.inviteLookupStatus.set('not_found');
        this.inviteLookupMessage.set('Nem található ilyen felhasználó.');
        return;
      }

      if (user.uid === this.authService.currentUser()?.uid) {
        this.inviteLookupStatus.set('error');
        this.inviteLookupMessage.set('Saját magadat nem hívhatod meg.');
        return;
      }

      const members = this.members();
      if (members?.some((m) => m.userId === user.uid)) {
        this.inviteLookupStatus.set('error');
        this.inviteLookupMessage.set('A felhasználó már tagja a csoportnak.');
        return;
      }

      this.inviteCandidate.set(user);
      this.inviteLookupStatus.set('found');
    } catch (error: any) {
      this.inviteLookupStatus.set('error');
      this.inviteLookupMessage.set(error?.message || 'Hiba történt a keresés közben.');
    }
  }

  async sendInvite() {
    const candidate = this.inviteCandidate();
    if (!this.isAdmin() || !candidate) return;

    this.isInviting.set(true);
    try {
      await this.groupService.createGroupInvite(this.groupId, candidate);
      await this.modalService.alert('Meghívó elküldve.', 'Kész', 'success');
      this.closeInviteModal();
    } catch (error: any) {
      await this.modalService.alert(
        error?.message || 'Hiba történt a meghívó küldésekor.',
        'Hiba',
        'error',
      );
    } finally {
      this.isInviting.set(false);
    }
  }

  private async openInviteWithFallback(fallbackMessage: string, fallbackTitle: string) {
    if (this.showInviteDecisionModal() || this.inviteGateInProgress()) return;
    const user = this.authService.currentUser();
    if (!user) return;

    this.inviteGateInProgress.set(true);
    try {
      const invite = await this.groupService.getGroupInviteOnce(this.groupId, user.uid);
      if (!invite || invite.status !== 'pending') {
        await this.modalService.alert(fallbackMessage, fallbackTitle, 'warning');
        this.clearInviteQueryParam();
        await this.router.navigate(['/groups']);
        return;
      }

      this.pendingInvite.set(invite);
      this.inviteDecisionError.set('');
      this.inviteLegalAccepted.set(false);
      this.showInviteDecisionModal.set(true);
      this.clearInviteQueryParam();
    } finally {
      this.inviteGateInProgress.set(false);
    }
  }

  private clearInviteQueryParam() {
    this.router.navigate([], {
      queryParams: { invite: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  closeInviteDecisionModal() {
    this.showInviteDecisionModal.set(false);
    this.pendingInvite.set(null);
    this.inviteDecisionError.set('');
    this.inviteLegalAccepted.set(false);
  }

  async acceptInvite() {
    const invite = this.pendingInvite();
    if (!invite) return;
    if (!this.inviteLegalAccepted()) {
      this.inviteDecisionError.set('A jogi nyilatkozat elfogadása kötelező.');
      return;
    }

    this.isInviteDecisionSubmitting.set(true);
    this.inviteDecisionError.set('');
    try {
      await this.groupService.acceptGroupInvite(this.groupId, invite.id, true);
      await this.modalService.alert('Sikeresen csatlakoztál a csoporthoz.', 'Kész', 'success');
      this.inviteAcceptedGrace.set(true);
      this.membersReload.update((value) => value + 1);
      this.closeInviteDecisionModal();
    } catch (error: any) {
      this.inviteDecisionError.set(
        error?.message || 'Hiba történt a meghívó elfogadásakor.',
      );
    } finally {
      this.isInviteDecisionSubmitting.set(false);
    }
  }

  async declineInvite() {
    const invite = this.pendingInvite();
    if (!invite) return;

    this.isInviteDecisionSubmitting.set(true);
    this.inviteDecisionError.set('');
    try {
      await this.groupService.declineGroupInvite(this.groupId, invite.id);
      await this.modalService.alert('A meghívót elutasítottad.', 'Kész', 'success');
      this.closeInviteDecisionModal();
      await this.router.navigate(['/groups']);
    } catch (error: any) {
      this.inviteDecisionError.set(
        error?.message || 'Hiba történt a meghívó elutasításakor.',
      );
    } finally {
      this.isInviteDecisionSubmitting.set(false);
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
      const group = this.group();
      if (group?.type === 'closed') {
        await this.groupService.requestJoinGroup(groupId);
        await this.modalService.alert(
          'A csatlakozási kérelmed elküldtük. Az adminok értesítést kapnak.',
          'Kész',
          'success',
        );
      } else {
        await this.groupService.joinGroup(groupId);
      }
    } catch (error) {
      console.error('Error joining group:', error);
      await this.modalService.alert(
        (error as any)?.message || 'Hiba történt a csatlakozáskor.',
        'Hiba',
        'error',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onLeaveGroup(skipConfirmation = false) {
    const groupId = this.route.snapshot.params['id'];
    if (!groupId) return;

    const user = this.authService.currentUser();
    const group = this.group();
    if (!user || !group || !this.isMember()) return;
    if (group?.ownerId && user?.uid && group.ownerId === user.uid) {
      await this.modalService.alert(
        `A csoport tulajdonosa nem léphet ki.\nElőbb add át a tulajdonjogot, vagy töröld a csoportot.`,
        'Nem lehetséges',
        'warning'
      );
      return;
    }
    if (!skipConfirmation) {
      const confirmed = await this.modalService.confirm(
        'Biztosan kilépsz a csoportból? Ezután nem láthatod az eseményeket.',
        'Kilépés',
      );
      if (!confirmed) return;
    }

    this.isSubmitting.set(true);
    try {
      await this.groupService.leaveGroup(groupId);
      await this.modalService.alert('Sikeresen kiléptél a csoportból.', 'Kész', 'success');
      await this.router.navigate(['/groups']);
    } catch (error: any) {
      console.error('Error leaving group:', error);
      await this.modalService.alert(
        error?.message || 'Hiba történt a kilépés során.',
        'Hiba',
        'error'
      );
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





