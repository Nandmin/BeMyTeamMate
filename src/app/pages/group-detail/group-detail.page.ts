import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GroupService, Group } from '../../services/group.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs';

interface MockMember {
  name: string;
  role: string;
  photo: string;
  matches: number;
  isAdmin?: boolean;
  status?: 'online' | 'offline';
  skillLevel?: number; // 0-100
}

interface MockEvent {
  title: string;
  month: string;
  day: string;
  time: string;
  location: string;
  attendees: string[];
  maxAttendees: number;
  currentAttendees: number;
}

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './group-detail.page.html',
  styleUrl: './group-detail.page.scss',
})
export class GroupDetailPage {
  private route = inject(ActivatedRoute);
  private groupService = inject(GroupService);

  group = toSignal(
    this.route.params.pipe(switchMap((params) => this.groupService.getGroup(params['id'])))
  );

  members = signal<MockMember[]>([
    {
      name: 'Nagy Dávid',
      role: 'Csapatkapitány',
      photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
      matches: 42,
      isAdmin: true,
      status: 'online',
      skillLevel: 85,
    },
    {
      name: 'Kiss Péter',
      role: 'Csatár',
      photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Peter',
      matches: 28,
      status: 'online',
      skillLevel: 75,
    },
    {
      name: 'Kovács Anna',
      role: 'Védő',
      photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna',
      matches: 15,
      skillLevel: 45,
    },
    {
      name: 'Tóth Gábor',
      role: 'Kapus',
      photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Gabor',
      matches: 34,
      status: 'offline',
      skillLevel: 90,
    },
    {
      name: 'Szabó Éva',
      role: 'Középpályás',
      photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Eva',
      matches: 12,
      skillLevel: 20,
    },
  ]);

  events = signal<MockEvent[]>([
    {
      title: 'Kedd Esti Levezető',
      month: 'OKT',
      day: '24',
      time: '19:00 - 20:30',
      location: 'Margitsziget AC',
      attendees: ['A', 'B', 'C'],
      maxAttendees: 10,
      currentAttendees: 8,
    },
    {
      title: 'Halloween Kupa',
      month: 'OKT',
      day: '31',
      time: '18:00 - 22:00',
      location: 'BME Sportközpont',
      attendees: ['D', 'E'],
      maxAttendees: 10,
      currentAttendees: 4,
    },
  ]);
}
