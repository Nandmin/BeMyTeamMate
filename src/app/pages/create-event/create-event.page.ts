import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EventService } from '../../services/event.service';
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
  private eventService = inject(EventService);

  groupId = this.route.snapshot.params['id'];
  today = '';

  ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.today = new Date().toISOString().split('T')[0];
    this.eventData.date = this.today;

    // Set default recurrence until date to 1 month from now
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    this.eventData.recurringUntil = nextMonth.toISOString().split('T')[0];
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

  async onSubmit() {
    if (!this.groupId) return;

    this.isSubmitting.set(true);
    try {
      const [year, month, day] = this.eventData.date.split('-').map(Number);
      const startDate = new Date(year, month - 1, day);

      const commonData = {
        title: this.eventData.title,
        sport: this.eventData.sport,
        date: Timestamp.fromDate(startDate),
        time: this.eventData.time,
        duration: this.eventData.duration,
        location: this.eventData.location,
        maxAttendees: this.eventData.maxAttendees,
      };

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

      this.router.navigate(['/groups', this.groupId]);
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Hiba történt az esemény létrehozásakor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  setSport(sport: string) {
    this.eventData.sport = sport;
  }
}
