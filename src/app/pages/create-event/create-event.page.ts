import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EventService } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-create-event',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './create-event.page.html',
  styleUrl: './create-event.page.scss',
})
export class CreateEventPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private eventService = inject(EventService);
  private authService = inject(AuthService);

  groupId = this.route.snapshot.params['id'];
  eventId = this.route.snapshot.params['eventId'];
  isEditMode = !!this.eventId;
  today = '';

  sports = [
    { id: 'soccer', name: 'Foci', icon: 'sports_soccer' },
    { id: 'basketball', name: 'Kosárlabda', icon: 'sports_basketball' },
    { id: 'handball', name: 'Kézilabda', icon: 'sports_handball' },
    { id: 'tennis', name: 'Tenisz', icon: 'sports_tennis' },
    { id: 'volleyball', name: 'Röplabda', icon: 'sports_volleyball' },
    { id: 'hockey', name: 'Jégkorong', icon: 'sports_hockey' },
    { id: 'squash', name: 'Squash', icon: 'sports_tennis' },
    { id: 'bowling', name: 'Bowling', icon: 'sports_baseball' },
    { id: 'other', name: 'Egyéb', icon: 'more_horiz' },
  ];

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
        alert('Nincs jogosultságod az esemény szerkesztéséhez.');
        this.router.navigate(['/groups', this.groupId]);
        return;
      }

      this.eventData = {
        title: event.title,
        sport: event.sport,
        date: event.date.toDate().toISOString().split('T')[0],
        time: event.time,
        duration: event.duration,
        location: event.location,
        maxAttendees: event.maxAttendees,
        isRecurring: false, // We don't support converting existing to recurring here yet
        frequency: 'weekly',
        recurringUntil: '',
      };
    } catch (error) {
      console.error('Error loading event:', error);
      alert('Hiba történt az esemény betöltésekor.');
      this.router.navigate(['/groups', this.groupId]);
    }
  }

  eventData = {
    title: '',
    sport: 'soccer',
    date: '',
    time: '',
    duration: 60,
    location: 'Budapest, Margit-sziget',
    maxAttendees: 10,
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
      };

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
      alert('Hiba történt az esemény mentésekor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel() {
    this.router.navigate(['/groups', this.groupId]);
  }

  async onDeleteEvent() {
    if (!this.groupId || !this.eventId) return;

    if (confirm('Biztosan törölni szeretnéd ezt az eseményt?')) {
      this.isSubmitting.set(true);
      try {
        await this.eventService.deleteEvent(this.groupId, this.eventId);
        this.router.navigate(['/groups', this.groupId]);
      } catch (error) {
        console.error('Error deleting event:', error);
        alert('Hiba történt az esemény törlésekor.');
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

  getMapUrl(): SafeResourceUrl {
    // Cache the URL to avoid regenerating on every change detection cycle
    if (
      this.cachedLocation === this.eventData.location &&
      this.cachedZoom === this.mapZoom &&
      this.cachedMapUrl
    ) {
      return this.cachedMapUrl;
    }

    const encodedLocation = encodeURIComponent(this.eventData.location);
    // Google Maps embed with parameters for better interactivity
    const url = `https://maps.google.com/maps?q=${encodedLocation}&z=${this.mapZoom}&hl=hu&output=embed`;

    this.cachedLocation = this.eventData.location;
    this.cachedZoom = this.mapZoom;
    this.cachedMapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    return this.cachedMapUrl;
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
}
