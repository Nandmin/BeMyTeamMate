import { Component, computed, inject, signal } from '@angular/core';
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

  userGroups = toSignal(this.groupService.getUserGroups(), { initialValue: [] });

  periodOptions = [
    { id: 'all', label: 'Teljes időszak', days: null },
    { id: '1w', label: 'Elmúlt 1 hét', days: 7 },
    { id: '1m', label: 'Elmúlt 1 hónap', days: 30 },
    { id: '3m', label: 'Elmúlt 3 hónap', days: 90 },
    { id: '6m', label: 'Elmúlt 6 hónap', days: 180 },
    { id: '1y', label: 'Elmúlt 1 év', days: 365 },
  ];

  sportOptions = [
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

  selectedPeriod = signal('1m');
  selectedSport = signal('all');
  selectedTeam = signal('all');

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

  filteredMatches = computed(() => {
    let matches = this.recentMatches();
    const selectedPeriod = this.selectedPeriod();
    const selectedSport = this.selectedSport();

    const period = this.periodOptions.find((p) => p.id === selectedPeriod);
    if (period && typeof period.days === 'number') {
      const cutoff = Date.now() - period.days * 24 * 60 * 60 * 1000;
      matches = matches.filter((m) => m.sortTime >= cutoff);
    }

    if (selectedSport !== 'all') {
      matches = matches.filter((m) => m.sport === selectedSport);
    }

    if (this.selectedTeam() !== 'all') {
      matches = matches.filter((m) => m.groupId === this.selectedTeam());
    }

    return matches;
  });

  setPeriod(periodId: string) {
    this.selectedPeriod.set(periodId);
  }

  setSport(sportId: string) {
    this.selectedSport.set(sportId);
  }

  setTeam(teamId: string) {
    this.selectedTeam.set(teamId);
  }

  selectedPeriodLabel(): string {
    const id = this.selectedPeriod();
    return this.periodOptions.find((p) => p.id === id)?.label || 'Időszak';
  }

  selectedSportLabel(): string {
    const id = this.selectedSport();
    if (id === 'all') return 'Minden sportág';
    return this.sportOptions.find((s) => s.id === id)?.name || 'Sportág';
  }

  selectedTeamLabel(): string {
    const id = this.selectedTeam();
    if (id === 'all') return 'Minden csapatom';
    return this.userGroups().find((g) => g.id === id)?.name || 'A csapat';
  }

  openMatch(match: RecentMatchRow) {
    this.router.navigate(['/groups', match.groupId, 'events', match.eventId]);
  }

  getSportIcon(sport?: string): string {
    if (!sport) return 'groups';
    const id = sport.toLowerCase();
    const match = this.sportOptions.find((opt) => opt.id === id);
    return match?.icon || 'sports';
  }

  winRatePercent(): number {
    const matches = this.filteredMatches();
    const decided = matches.filter((m) => m.isWin !== null);
    if (decided.length === 0) return 0;
    const wins = decided.filter((m) => m.isWin === true).length;
    return Math.round((wins / decided.length) * 100);
  }

  earnedEloTotal(): number {
    return this.filteredMatches().reduce((sum, match) => sum + match.eloDelta, 0);
  }

  winLossChart = computed(() => {
    const matches = this.filteredMatches();
    const decided = matches.filter((m) => m.isWin !== null);
    const anchorDate = decided.length > 0 ? new Date(decided[0].sortTime) : new Date();
    const months: { key: string; year: number; month: number; label: string }[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      const rawLabel = date.toLocaleDateString('hu-HU', { month: 'short' });
      const label = rawLabel ? rawLabel[0].toUpperCase() + rawLabel.slice(1) : rawLabel;
      months.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        year,
        month,
        label,
      });
    }

    const monthStats = months.map((entry) => {
      const monthMatches = decided.filter((m) => {
        const date = new Date(m.sortTime);
        return date.getMonth() === entry.month && date.getFullYear() === entry.year;
      });
      const wins = monthMatches.filter((m) => m.isWin === true).length;
      const losses = monthMatches.filter((m) => m.isWin === false).length;
      return { ...entry, wins, losses };
    });

    const max = Math.max(
      1,
      ...monthStats.flatMap((entry) => [entry.wins, entry.losses])
    );

    return monthStats.map((entry) => ({
      ...entry,
      winHeight: Math.round((entry.wins / max) * 100),
      lossHeight: Math.round((entry.losses / max) * 100),
    }));
  });

  eloChart = computed(() => {
    const matches = this.filteredMatches();
    const anchorDate = matches.length > 0 ? new Date(matches[0].sortTime) : new Date();
    const months: { key: string; year: number; month: number; label: string }[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      const rawLabel = date.toLocaleDateString('hu-HU', { month: 'short' });
      const label = rawLabel ? rawLabel[0].toUpperCase() + rawLabel.slice(1) : rawLabel;
      months.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        year,
        month,
        label,
      });
    }

    const monthValues = months.map((entry) => {
      const monthMatches = matches.filter((m) => {
        const date = new Date(m.sortTime);
        return date.getMonth() === entry.month && date.getFullYear() === entry.year;
      });
      const value = monthMatches.reduce((sum, match) => sum + match.eloDelta, 0);
      return { ...entry, value };
    });

    const maxAbs = Math.max(1, ...monthValues.map((entry) => Math.abs(entry.value)));
    const width = 100;
    const height = 50;
    const padding = 6;
    const midY = height / 2;
    const scale = (height / 2 - padding) / maxAbs;
    const xPadding = 4;

    const points = monthValues.map((entry, index) => {
      const xSpan = width - xPadding * 2;
      const x = xPadding + (xSpan / (monthValues.length - 1)) * index;
      const y = midY - entry.value * scale;
      return { ...entry, x, y };
    });

    const path = (() => {
      if (points.length === 0) return '';
      if (points.length === 1) {
        return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
      }

      const d: string[] = [
        `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`,
      ];

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d.push(
          `C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
        );
      }

      return d.join(' ');
    })();

    return { points, path, midY };
  });

  private getSportLabel(sport?: string): string {
    if (!sport) return 'Ismeretlen';
    const id = sport.toLowerCase();
    const match = this.sportOptions.find((opt) => opt.id === id);
    return match?.name || sport;
  }

  private mapGroupMatches(
    groupId: string,
    events: SportEvent[],
    members: GroupMember[],
    userId: string
  ): RecentMatchRow[] {
    return events
      .filter((event) => this.isUserInEvent(event, userId))
      .filter((event) => this.hasRecordedResult(event))
      .map((event) => this.toMatchRow(groupId, event, members, userId));
  }

  private isUserInEvent(event: SportEvent, userId: string): boolean {
    const inTeamA = event.teamA?.includes(userId) ?? false;
    const inTeamB = event.teamB?.includes(userId) ?? false;
    const inAttendees = event.attendees?.includes(userId) ?? false;
    return inTeamA || inTeamB || inAttendees;
  }

  private hasRecordedResult(event: SportEvent): boolean {
    if (event.status === 'finished') return true;
    if (typeof event.goalsA === 'number' && typeof event.goalsB === 'number') return true;
    if (event.playerStats && Object.keys(event.playerStats).length > 0) return true;
    return false;
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

    const date = this.coerceDate(event.date);
    const dateLabel = date.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const eloDelta = event.playerStats?.[userId]?.eloDelta ?? 0;

    return {
      eventId: event.id || '',
      groupId,
      dateLabel,
      sport: event.sport || 'Ismeretlen',
      sportLabel: this.getSportLabel(event.sport),
      opponent,
      resultLabel,
      isWin,
      eloDelta,
      sortTime: date.getTime(),
    };
  }

  private coerceDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
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
  eloDelta: number;
  sortTime: number;
}
