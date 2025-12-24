import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

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
export class EventsList {
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

  formatDate(date: Date): string {
    const month = date.toLocaleDateString('hu-HU', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }
}
