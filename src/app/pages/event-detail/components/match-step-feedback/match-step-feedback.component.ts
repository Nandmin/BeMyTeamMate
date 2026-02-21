import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GroupMember } from '../../../../services/group.service';
import { SportEvent } from '../../../../services/event.service';

@Component({
  selector: 'app-match-step-feedback',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-step-feedback.component.html',
  styleUrl: './match-step-feedback.component.scss',
})
export class MatchStepFeedbackComponent {
  @Input() event: SportEvent | undefined;
  @Input() mvpVotingEndAt: Date | null = null;
  @Input() mvpWinnerMember: GroupMember | null = null;
  @Input() mvpCandidates: GroupMember[] = [];
  @Input() canVoteMvp = false;
  @Input() mvpVotingOpen = false;
  @Input() mvpUserVote: string | null = null;
  @Input() mvpUserVotedName: string | null = null;
  @Input() selectedMvpId: string | null = null;
  @Input() isSubmitting = false;

  @Output() backStep = new EventEmitter<void>();
  @Output() selectMvp = new EventEmitter<string>();
  @Output() submitVote = new EventEmitter<void>();
  @Output() finishFlow = new EventEmitter<void>();

  get showMvp(): boolean {
    return this.event?.status === 'finished';
  }

  get mvpEnabled(): boolean {
    return !!this.event?.mvpVotingEnabled;
  }

  get canSubmitMvpVote(): boolean {
    return this.showMvp && this.mvpEnabled && this.mvpVotingOpen && this.canVoteMvp && !this.mvpUserVote;
  }

  get primaryCtaLabel(): string {
    return this.canSubmitMvpVote ? 'Szavazat leadása' : 'Lezárás';
  }

  get primaryDisabled(): boolean {
    if (!this.canSubmitMvpVote) return false;
    return this.isSubmitting || !this.selectedMvpId;
  }

  onPrimaryAction() {
    if (this.canSubmitMvpVote) {
      this.submitVote.emit();
      return;
    }
    this.finishFlow.emit();
  }
}
