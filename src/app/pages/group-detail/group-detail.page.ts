import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
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
  protected authService = inject(AuthService);

  group = toSignal(
    this.route.params.pipe(switchMap((params) => this.groupService.getGroup(params['id'])))
  );

  members = toSignal(
    this.route.params.pipe(switchMap((params) => this.groupService.getGroupMembers(params['id'])))
  );

  isMember = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    return members.some((m) => m.userId === user.uid);
  });

  isSubmitting = signal(false);

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
