import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TranslocoPipe } from '@jsverse/transloco';
import { GroupMember } from '../../../../services/group.service';
import { SportEvent } from '../../../../services/event.service';
import { LanguageService } from '../../../../services/language.service';

@Component({
  selector: 'app-match-step-teams',
  standalone: true,
  imports: [CommonModule, RouterModule, DragDropModule, TranslocoPipe],
  templateUrl: './match-step-teams.component.html',
  styleUrl: './match-step-teams.component.scss',
})
export class MatchStepTeamsComponent {
  private readonly languageService = inject(LanguageService);

  @Input() event: SportEvent | undefined;
  @Input() teamA: GroupMember[] = [];
  @Input() teamB: GroupMember[] = [];
  @Input() teamABalance = 50;
  @Input() teamAAverage = '0';
  @Input() teamBAverage = '0';
  @Input() attendingCount = 0;
  @Input() isAdmin = false;
  @Input() isSubmitting = false;
  @Input() hasTeams = false;

  @Output() dropped = new EventEmitter<CdkDragDrop<GroupMember[]>>();
  @Output() generateTeams = new EventEmitter<void>();
  @Output() startGame = new EventEmitter<void>();
  @Output() backStep = new EventEmitter<void>();
  @Output() nextStep = new EventEmitter<void>();

  averageInfoTeam: 'A' | 'B' | null = null;

  get isPlanned(): boolean {
    return !this.event?.status || this.event.status === 'planned';
  }

  get teamsLocked(): boolean {
    return this.event?.status === 'active' || this.event?.status === 'finished' || !this.isAdmin;
  }

  get canReshuffle(): boolean {
    return this.isPlanned && this.isAdmin;
  }

  get canDrawTeams(): boolean {
    return this.canReshuffle && this.attendingCount >= 2;
  }

  get primaryLabel(): string {
    if (this.canReshuffle && !this.hasTeams) return this.languageService.t('eventDetail.actions.draw');
    if (this.canReshuffle && this.hasTeams) return this.languageService.t('eventDetail.actions.start');
    return this.languageService.t('eventDetail.actions.next');
  }

  get primaryDisabled(): boolean {
    if (this.canReshuffle && !this.hasTeams) return !this.canDrawTeams;
    if (this.canReshuffle && this.hasTeams) return this.isSubmitting;
    return !this.hasTeams;
  }

  get isPrimaryDrawAction(): boolean {
    return this.canReshuffle && !this.hasTeams;
  }

  onPrimaryAction() {
    if (this.canReshuffle && !this.hasTeams) {
      this.generateTeams.emit();
      return;
    }
    if (this.canReshuffle) {
      this.startGame.emit();
      return;
    }
    this.nextStep.emit();
  }

  toggleAverageInfo(team: 'A' | 'B', event: Event) {
    event.stopPropagation();
    this.averageInfoTeam = this.averageInfoTeam === team ? null : team;
  }

  closeAverageInfo() {
    this.averageInfoTeam = null;
  }

  preventAverageInfoClose(event: Event) {
    event.stopPropagation();
  }

  getDisplayedElo(player: GroupMember): number {
    const snapshotRating = this.event?.playerRatingSnapshot?.[player.userId];
    if (
      (this.event?.status === 'active' || this.event?.status === 'finished') &&
      snapshotRating !== undefined &&
      snapshotRating !== null
    ) {
      return snapshotRating;
    }
    return player.elo || 1200;
  }
}
