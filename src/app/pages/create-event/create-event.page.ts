import { Component, effect, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { EventService } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';
import { TranslationKey } from '../../i18n/translations';
import { LanguageService } from '../../services/language.service';
import { ModalService } from '../../services/modal.service';
import { Timestamp } from '@angular/fire/firestore';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-create-event',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './create-event.page.html',
  styleUrl: './create-event.page.scss',
})
export class CreateEventPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private eventService = inject(EventService);
  private authService = inject(AuthService);
  protected readonly languageService = inject(LanguageService);
  private modalService = inject(ModalService);
  private seo = inject(SeoService);

  groupId = this.route.snapshot.params['id'];
  eventId = this.route.snapshot.params['eventId'];
  isEditMode = !!this.eventId;
  today = '';

  sports: Array<{ id: string; labelKey: TranslationKey; icon: string }> = [
    { id: 'soccer', labelKey: 'createEvent.sport.soccer', icon: 'sports_soccer' },
    { id: 'basketball', labelKey: 'createEvent.sport.basketball', icon: 'sports_basketball' },
    { id: 'handball', labelKey: 'createEvent.sport.handball', icon: 'sports_handball' },
    { id: 'tennis', labelKey: 'createEvent.sport.tennis', icon: 'sports_tennis' },
    { id: 'volleyball', labelKey: 'createEvent.sport.volleyball', icon: 'sports_volleyball' },
    { id: 'hockey', labelKey: 'createEvent.sport.hockey', icon: 'sports_hockey' },
    { id: 'squash', labelKey: 'createEvent.sport.squash', icon: 'sports_tennis' },
    { id: 'bowling', labelKey: 'createEvent.sport.bowling', icon: 'sports_baseball' },
    { id: 'other', labelKey: 'createEvent.sport.other', icon: 'more_horiz' },
  ];

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t(
          this.isEditMode ? 'createEvent.meta.editTitle' : 'createEvent.meta.createTitle'
        ),
        description: this.languageService.t(
          this.isEditMode
            ? 'createEvent.meta.editDescription'
            : 'createEvent.meta.createDescription'
        ),
        path: '/groups',
        noindex: true,
      });
    });
  }

  async ngOnInit() {
    this.today = new Date().toISOString().split('T')[0];
    this.eventData.date = this.today;

    // Set default recurrence until date to 1 month from now
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    this.eventData.recurringUntil = nextMonth.toISOString().split('T')[0];

    if (this.isEditMode) {
      await this.loadEventData();
    }

    // Ensure we are at the top, timeout helps with internal navigation/rendering lag
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 0);
  }

  async loadEventData() {
    try {
      const event = await this.eventService.getEvent(this.groupId, this.eventId);

      // Security check: only creator can edit
      const user = this.authService.currentUser();
      if (event.creatorId !== user?.uid) {
        await this.modalService.alert(
          this.languageService.t('createEvent.error.noEditPermission'),
          this.languageService.t('admin.groups.alert.deleteErrorTitle'),
          'error'
        );
        this.router.navigate(['/groups', this.groupId]);
        return;
      }

      const eventDate = this.toDate(event.date);
      if (!eventDate) {
        await this.modalService.alert(
          this.languageService.t('createEvent.error.invalidDate'),
          this.languageService.t('admin.groups.alert.deleteErrorTitle'),
          'error'
        );
        this.router.navigate(['/groups', this.groupId]);
        return;
      }

      this.eventData = {
        title: event.title,
        sport: event.sport,
        date: eventDate.toISOString().split('T')[0],
        time: event.time,
        duration: event.duration,
        location: event.location,
        maxAttendees: event.maxAttendees,
        mvpVotingEnabled: event.mvpVotingEnabled ?? false,
        isRecurring: false, // We don't support converting existing to recurring here yet
        frequency: 'weekly',
        recurringUntil: '',
      };
    } catch (error) {
      console.error('Error loading event:', error);
      await this.modalService.alert(
        this.languageService.t('createEvent.error.loadFailed'),
        this.languageService.t('admin.groups.alert.deleteErrorTitle'),
        'error'
      );
      this.router.navigate(['/groups', this.groupId]);
    }
  }

  eventData = {
    title: '',
    sport: 'soccer',
    date: '',
    time: '',
    duration: 60,
    location: '',
    maxAttendees: 10,
    mvpVotingEnabled: false,
    isRecurring: false,
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    recurringUntil: '',
  };

  isSubmitting = signal(false);
  isMapExpanded = false;

  async onSubmit() {
    if (!this.groupId) return;

    this.isSubmitting.set(true);
    try {
      const [year, month, day] = this.eventData.date.split('-').map(Number);
      const startDate = new Date(year, month - 1, day);

      const commonData: any = {
        title: this.eventData.title,
        sport: this.eventData.sport,
        date: Timestamp.fromDate(startDate),
        time: this.eventData.time,
        duration: this.eventData.duration,
        location: this.eventData.location,
        maxAttendees: this.eventData.maxAttendees,
        mvpVotingEnabled: this.eventData.mvpVotingEnabled,
      };

      if (this.eventData.mvpVotingEnabled) {
        commonData.mvpVotingEndsAt = this.computeMvpVotingEndsAt(startDate);
      }

      if (this.isEditMode) {
        await this.eventService.updateEvent(this.groupId, this.eventId, commonData);
      } else {
        if (this.eventData.isRecurring && this.eventData.recurringUntil) {
          const [uYear, uMonth, uDay] = this.eventData.recurringUntil.split('-').map(Number);
          const untilDate = new Date(uYear, uMonth - 1, uDay);

          await this.eventService.createRecurringEvents(
            this.groupId,
            commonData,
            this.eventData.frequency,
            Timestamp.fromDate(untilDate)
          );
        } else {
          await this.eventService.createEvent(this.groupId, commonData);
        }
      }

      this.router.navigate(['/groups', this.groupId]);
    } catch (error) {
      console.error('Error saving event:', error);
      await this.modalService.alert(
        this.languageService.t('createEvent.error.saveFailed'),
        this.languageService.t('admin.groups.alert.deleteErrorTitle'),
        'error'
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel() {
    this.router.navigate(['/groups', this.groupId]);
  }

  async onDeleteEvent() {
    if (!this.groupId || !this.eventId) return;

    const shouldDelete = await this.modalService.confirm(
      this.languageService.t('createEvent.actions.deleteConfirm')
    );
    if (shouldDelete) {
      this.isSubmitting.set(true);
      try {
        await this.eventService.deleteEvent(this.groupId, this.eventId);
        this.router.navigate(['/groups', this.groupId]);
      } catch (error) {
        console.error('Error deleting event:', error);
        await this.modalService.alert(
          this.languageService.t('createEvent.error.deleteFailed'),
          this.languageService.t('admin.groups.alert.deleteErrorTitle'),
          'error'
        );
      } finally {
        this.isSubmitting.set(false);
      }
    }
  }

  setSport(sport: string) {
    this.eventData.sport = sport;
  }

  scrollCarousel(container: HTMLElement, direction: 'left' | 'right') {
    const scrollAmount = 400; // Increased fixed scroll amount for faster navigation
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }

  // Map zoom level
  mapZoom = 15;
  private cachedMapUrl: SafeResourceUrl | null = null;
  private cachedLocation: string = '';
  private cachedZoom: number = 15;
  private readonly mapLocationPattern = /^[\p{L}\p{N}\s,.\-]+$/u;

  getMapUrl(): SafeResourceUrl | null {
    // Cache the URL to avoid regenerating on every change detection cycle
    if (
      this.cachedLocation === this.eventData.location &&
      this.cachedZoom === this.mapZoom &&
      this.cachedMapUrl
    ) {
      return this.cachedMapUrl;
    }

    const loc = this.eventData.location?.trim();
    if (!this.isValidMapLocation(loc)) {
      this.cachedMapUrl = null;
      return null;
    }

    const safeZoom = Number.isInteger(this.mapZoom) ? Math.min(18, Math.max(3, this.mapZoom)) : 15;
    const mapUrl = new URL('https://maps.google.com/maps');
    mapUrl.search = new URLSearchParams({
      q: loc,
      z: String(safeZoom),
      hl: 'hu',
      output: 'embed',
    }).toString();

    this.cachedLocation = loc;
    this.cachedZoom = safeZoom;
    this.cachedMapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(mapUrl.toString());
    return this.cachedMapUrl;
  }

  private isValidMapLocation(loc: string | undefined): loc is string {
    if (!loc) return false;
    if (loc.length < 3 || loc.length > 200) return false;
    return this.mapLocationPattern.test(loc);
  }

  zoomIn() {
    if (this.mapZoom < 18) {
      this.mapZoom += 1;
      this.cachedMapUrl = null;
    }
  }

  zoomOut() {
    if (this.mapZoom > 3) {
      this.mapZoom -= 1;
      this.cachedMapUrl = null;
    }
  }

  private computeMvpVotingEndsAt(date: Date) {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return Timestamp.fromDate(end);
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
