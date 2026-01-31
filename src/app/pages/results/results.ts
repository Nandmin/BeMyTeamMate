import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { EventService, SportEvent } from '../../services/event.service';
import { GroupMember, GroupService } from '../../services/group.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './results.html',
  styleUrl: './results.scss',
})
export class Results {
  private authService = inject(AuthService);
  private eventService = inject(EventService);
  private groupService = inject(GroupService);
  private router = inject(Router);
  private seo = inject(SeoService);

  user = toSignal(this.authService.user$, { initialValue: null });
  fullUser = this.authService.fullCurrentUser;
  userGroups = toSignal(this.groupService.getUserGroups(), { initialValue: [] });

  constructor() {
    this.seo.setPageMeta({
      title: 'Eredmények – BeMyTeamMate',
      description: 'Legutóbbi meccsek, statisztikák és ELO változások áttekintése.',
      path: '/results',
      noindex: true,
    });
  }

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
  recentTableOpen = signal(true);
  pageSizeOptions = [10, 20, 30, 50] as const;
  pageSize = signal<number>(10);
  currentPage = signal<number>(1);

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

  totalPages = computed(() => {
    const total = this.filteredMatches().length;
    const size = Math.max(1, this.pageSize());
    return Math.max(1, Math.ceil(total / size));
  });

  pagedMatches = computed(() => {
    const matches = this.filteredMatches();
    const size = Math.max(1, this.pageSize());
    const totalPages = Math.max(1, Math.ceil(matches.length / size));
    const safePage = Math.min(this.currentPage(), totalPages);
    const start = (safePage - 1) * size;
    return matches.slice(start, start + size);
  });

  pageStart = computed(() => {
    const total = this.filteredMatches().length;
    if (total === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  pageEnd = computed(() => {
    const total = this.filteredMatches().length;
    if (total === 0) return 0;
    return Math.min(this.currentPage() * this.pageSize(), total);
  });

  mvpWinsCount = computed(() => {
    const userId = this.user()?.uid;
    if (!userId) return 0;
    return this.filteredMatches().filter((match) => match.mvpWinnerId === userId).length;
  });

  private clampPaginationEffect = effect(() => {
    const totalPages = this.totalPages();
    const current = this.currentPage();
    if (current > totalPages) {
      this.currentPage.set(totalPages);
    }
    if (current < 1) {
      this.currentPage.set(1);
    }
  });

  setPeriod(periodId: string) {
    this.selectedPeriod.set(periodId);
    this.currentPage.set(1);
  }

  setSport(sportId: string) {
    this.selectedSport.set(sportId);
    this.currentPage.set(1);
  }

  setTeam(teamId: string) {
    this.selectedTeam.set(teamId);
    this.currentPage.set(1);
  }

  toggleRecentTable() {
    this.recentTableOpen.update((open) => !open);
  }

  setPageSize(size: string | number) {
    const numericSize = typeof size === 'number' ? size : Number(size);
    const safeSize = Number.isFinite(numericSize) && numericSize > 0 ? numericSize : 10;
    this.pageSize.set(safeSize);
    this.currentPage.set(1);
  }

  goToPage(page: number) {
    const total = this.totalPages();
    const safePage = Math.min(Math.max(1, page), total);
    this.currentPage.set(safePage);
  }

  nextPage() {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage() {
    this.goToPage(this.currentPage() - 1);
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

  async exportRecentResults(): Promise<void> {
    const matches = this.filteredMatches();
    if (matches.length === 0) return;

    // Angular dev server (Vite) can choke on dynamic CJS imports; the minified build works reliably.
    const ExcelJS = (await import('exceljs/dist/exceljs.min.js')) as any;

    const rows = matches.map((match) => ({
      datum: match.dateLabel,
      csapat: this.getGroupName(match.groupId),
      sportag: match.sportLabel,
      eredmeny: match.resultLabel,
      szerzettGolok: match.goals,
      assists: match.assists,
      eloValtozas: match.eloDelta,
      kimenetel: match.isWin === null ? 'Ismeretlen' : match.isWin ? 'Győzelem' : 'Vereség',
    }));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Legutóbbi_eredmények', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const columns = [
      { header: 'Dátum', key: 'datum', width: 12 },
      { header: 'Csapat', key: 'csapat', width: 22 },
      { header: 'Sportág', key: 'sportag', width: 16 },
      { header: 'Eredmény', key: 'eredmeny', width: 12 },
      { header: 'Szerzett gólok', key: 'szerzettGolok', width: 16 },
      { header: 'Assists', key: 'assists', width: 10 },
      { header: 'ELO változás', key: 'eloValtozas', width: 14 },
      { header: 'Kimenetel', key: 'kimenetel', width: 14 },
    ] as const;

    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    sheet.addRows(rows);

    const lastColumnLetter = sheet.getColumn(columns.length).letter;
    sheet.autoFilter = {
      from: 'A1',
      to: `${lastColumnLetter}1`,
    };

    const headerRow = sheet.getRow(1);
    headerRow.height = 18;
    headerRow.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9D9D9' },
      };
    });

    sheet.getColumn('G').numFmt = '+0;-0;0';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = (this.user()?.displayName || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Legutóbbi_eredmények_${safeName}_${timestamp}.xlsx`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
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
    const sumOfDeltas = this.filteredMatches().reduce((sum, match) => sum + match.eloDelta, 0);

    const period = this.periodOptions.find((p) => p.id === this.selectedPeriod());
    const hasPeriodCutoff = typeof period?.days === 'number';
    const noExtraFilters = this.selectedSport() === 'all' && this.selectedTeam() === 'all';
    const createdAt = this.fullUser()?.createdAt;
    const currentElo = this.fullUser()?.elo;

    if (hasPeriodCutoff && noExtraFilters && createdAt && typeof currentElo === 'number') {
      const createdAtTime = this.coerceDate(createdAt).getTime();
      const cutoff = Date.now() - period!.days! * 24 * 60 * 60 * 1000;
      const createdWithinPeriod = !Number.isNaN(createdAtTime) && createdAtTime >= cutoff;
      if (createdWithinPeriod) {
        return Math.round(currentElo - 1200);
      }
    }

    return sumOfDeltas;
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

  private getGroupName(groupId: string): string {
    return this.userGroups().find((group) => group.id === groupId)?.name || groupId;
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
    const playerStats = event.playerStats?.[userId];
    const goals = playerStats?.goals ?? 0;
    const assists = playerStats?.assists ?? 0;
    const baseEloDelta = playerStats?.eloDelta ?? 0;
    const mvpBonus =
      event.mvpEloAwarded && event.mvpWinnerId && event.mvpWinnerId === userId ? 5 : 0;
    const eloDelta = baseEloDelta + mvpBonus;

    return {
      eventId: event.id || '',
      groupId,
      dateLabel,
      sport: event.sport || 'Ismeretlen',
      sportLabel: this.getSportLabel(event.sport),
      opponent,
      resultLabel,
      isWin,
      goals,
      assists,
      eloDelta,
      mvpWinnerId: event.mvpWinnerId ?? null,
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
  goals: number;
  assists: number;
  eloDelta: number;
  mvpWinnerId: string | null;
  sortTime: number;
}
