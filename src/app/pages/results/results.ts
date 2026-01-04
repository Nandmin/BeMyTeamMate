import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { EventService, SportEvent } from '../../services/event.service';
import { GroupMember, GroupService } from '../../services/group.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './results.html',
  styleUrl: './results.scss',
})
export class Results {
  private authService = inject(AuthService);
  private eventService = inject(EventService);
  private groupService = inject(GroupService);
  private router = inject(Router);

  recentMatches = toSignal(
    combineLatest([this.authService.user$, this.groupService.getUserGroups()]).pipe(
      switchMap(([user, groups]) => {
        if (!user || !groups || groups.length === 0) return of([]);

        const groupStreams = groups.map((group) =>
          combineLatest([
            this.eventService.getPastEvents(group.id!),
            this.groupService.getGroupMembers(group.id!),
          ]).pipe(
            map(([events, members]) =>
              this.mapGroupMatches(group.id!, events, members, user.uid)
            )
          )
        );

        return combineLatest(groupStreams).pipe(map((groupRows) => groupRows.flat()));
      }),
      map((rows) => rows.sort((a, b) => b.sortTime - a.sortTime))
    ),
    { initialValue: [] }
  );

  openMatch(match: RecentMatchRow) {
    this.router.navigate(['/groups', match.groupId, 'events', match.eventId]);
  }

  getSportIcon(sport?: string): string {
    if (!sport) return 'groups';
    const s = sport.toLowerCase();
    if (s.includes('foci') || s.includes('soccer') || s.includes('football'))
      return 'sports_soccer';
    if (s.includes('kosár') || s.includes('basketball')) return 'sports_basketball';
    if (s.includes('röpi') || s.includes('volleyball')) return 'sports_volleyball';
    if (s.includes('tenisz') || s.includes('tennis')) return 'sports_tennis';
    if (s.includes('padel')) return 'sports_tennis';
    return 'sports';
  }

  winRatePercent(): number {
    const matches = this.recentMatches();
    const decided = matches.filter((m) => m.isWin !== null);
    if (decided.length === 0) return 0;
    const wins = decided.filter((m) => m.isWin === true).length;
    return Math.round((wins / decided.length) * 100);
  }

  private getSportLabel(sport?: string): string {
    if (!sport) return 'Ismeretlen';
    const s = sport.toLowerCase();
    if (s.includes('soccer') || s.includes('football')) return 'Foci';
    if (s.includes('basketball')) return 'Kosár';
    if (s.includes('volleyball')) return 'Röpi';
    if (s.includes('tennis')) return 'Tenisz';
    if (s.includes('padel')) return 'Padel';
    return sport;
  }

  private mapGroupMatches(
    groupId: string,
    events: SportEvent[],
    members: GroupMember[],
    userId: string
  ): RecentMatchRow[] {
    return events
      .filter((event) => this.isUserInEvent(event, userId))
      .map((event) => this.toMatchRow(groupId, event, members, userId));
  }

  private isUserInEvent(event: SportEvent, userId: string): boolean {
    const inTeamA = event.teamA?.includes(userId) ?? false;
    const inTeamB = event.teamB?.includes(userId) ?? false;
    const inAttendees = event.attendees?.includes(userId) ?? false;
    return inTeamA || inTeamB || inAttendees;
  }

  private toMatchRow(
    groupId: string,
    event: SportEvent,
    members: GroupMember[],
    userId: string
  ): RecentMatchRow {
    const inTeamA = event.teamA?.includes(userId) ?? false;
    const inTeamB = event.teamB?.includes(userId) ?? false;
    const opponentIds = inTeamA ? event.teamB : event.teamA;
    const opponentNames = opponentIds
      ? members.filter((m) => opponentIds.includes(m.userId)).map((m) => m.name)
      : [];

    const opponent =
      opponentNames.length > 0 ? opponentNames.join(', ') : inTeamA ? 'B csapat' : 'A csapat';

    const goalsA = event.goalsA ?? null;
    const goalsB = event.goalsB ?? null;
    const resultLabel =
      goalsA !== null && goalsB !== null
        ? inTeamA
          ? `${goalsA} - ${goalsB}`
          : `${goalsB} - ${goalsA}`
        : '-';

    const isWin =
      goalsA !== null && goalsB !== null
        ? inTeamA
          ? goalsA > goalsB
          : goalsB > goalsA
        : null;

    const date = event.date?.toDate ? event.date.toDate() : new Date();
    const dateLabel = date.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return {
      eventId: event.id || '',
      groupId,
      dateLabel,
      sport: event.sport || 'Ismeretlen',
      sportLabel: this.getSportLabel(event.sport),
      opponent,
      resultLabel,
      isWin,
      sortTime: date.getTime(),
    };
  }
}

interface RecentMatchRow {
  eventId: string;
  groupId: string;
  dateLabel: string;
  sport: string;
  sportLabel: string;
  opponent: string;
  resultLabel: string;
  isWin: boolean | null;
  sortTime: number;
}
