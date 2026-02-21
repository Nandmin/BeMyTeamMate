import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SportEvent } from '../../../../services/event.service';
import { GroupMember } from '../../../../services/group.service';

@Component({
  selector: 'app-match-step-overview',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './match-step-overview.component.html',
})
export class MatchStepOverviewComponent {
  @Input() event: SportEvent | undefined;
  @Input() groupId = '';
  @Input() groupName = '';
  @Input() formattedDate = '';
  @Input() primaryCtaLabel = 'Csapatok';
  @Input() attendingMembers: GroupMember[] = [];
  @Input() notRespondingMembers: GroupMember[] = [];

  @Output() nextStep = new EventEmitter<void>();

  isParticipantsOpen = false;

  toggleParticipants() {
    this.isParticipantsOpen = !this.isParticipantsOpen;
  }
}
