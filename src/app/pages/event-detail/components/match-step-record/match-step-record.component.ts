import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { GroupMember } from '../../../../services/group.service';
import { SportEvent } from '../../../../services/event.service';

@Component({
  selector: 'app-match-step-record',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './match-step-record.component.html',
  styleUrl: './match-step-record.component.scss',
})
export class MatchStepRecordComponent {
  @Input() event: SportEvent | undefined;
  @Input() teamA: GroupMember[] = [];
  @Input() teamB: GroupMember[] = [];
  @Input() selectedPlayerId: string | null = null;
  @Input() selectedPlayerName: string | null = null;
  @Input() selectedGoals = 0;
  @Input() selectedAssists = 0;
  @Input() goalsA = 0;
  @Input() goalsB = 0;
  @Input() canEdit = false;
  @Input() canAdjustStats = false;
  @Input() isEditingResults = false;
  @Input() isSubmitting = false;
  @Input() hasTeams = false;

  @Output() backStep = new EventEmitter<void>();
  @Output() selectPlayer = new EventEmitter<string>();
  @Output() goalsDelta = new EventEmitter<number>();
  @Output() assistsDelta = new EventEmitter<number>();
  @Output() toggleEdit = new EventEmitter<void>();
  @Output() saveResults = new EventEmitter<void>();
  @Output() nextStep = new EventEmitter<void>();

  private teamTabOverride: 'A' | 'B' | null = null;

  get activeTeamTab(): 'A' | 'B' {
    if (this.teamTabOverride) return this.teamTabOverride;
    if (this.selectedPlayerId && this.teamB.some((player) => player.userId === this.selectedPlayerId)) {
      return 'B';
    }
    return 'A';
  }

  get activeTeamPlayers(): GroupMember[] {
    return this.activeTeamTab === 'A' ? this.teamA : this.teamB;
  }

  selectTeamTab(team: 'A' | 'B') {
    this.teamTabOverride = team;
    const players = team === 'A' ? this.teamA : this.teamB;
    if (!players.length) return;

    const alreadySelectedInTeam = !!this.selectedPlayerId
      && players.some((player) => player.userId === this.selectedPlayerId);
    if (!alreadySelectedInTeam) {
      this.selectPlayer.emit(players[0].userId);
    }
  }

  selectTeamPlayer(userId: string) {
    this.teamTabOverride = this.teamB.some((player) => player.userId === userId) ? 'B' : 'A';
    this.selectPlayer.emit(userId);
  }
}
