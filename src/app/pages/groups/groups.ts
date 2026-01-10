import { Component, inject, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GroupService, Group } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { ModalService } from '../../services/modal.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './groups.html',
  styleUrl: './groups.scss',
})
export class GroupsPage {
  private groupService = inject(GroupService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  protected authService = inject(AuthService);
  private modalService = inject(ModalService);

  groups: Signal<Group[] | undefined> = toSignal(
    this.groupService.getGroups().pipe(
      catchError((error) => {
        console.error('Error fetching groups:', error);
        return of([]); // Return empty array on error
      })
    )
  );

  showCreateModal = false;
  groupForm: FormGroup;
  isSubmitting = false;

  constructor() {
    this.groupForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      type: ['closed', Validators.required],
      description: [''],
    });
  }

  toggleCreateModal() {
    this.showCreateModal = !this.showCreateModal;
    if (!this.showCreateModal) {
      this.groupForm.reset({ type: 'closed' });
    }
  }

  navigateToGroup(id: string) {
    this.router.navigate(['/groups', id]);
  }

  async onCreateGroup() {
    if (this.groupForm.invalid) return;

    this.isSubmitting = true;
    try {
      const { name, type, description } = this.groupForm.value;
      await this.groupService.createGroup(name, type, description);
      this.toggleCreateModal();
    } catch (error) {
      console.error('Error creating group:', error);
      await this.modalService.alert(
        'Hiba történt a csoport létrehozása közben. Ellenőrizd a jogosultságokat!',
        'Hiba',
        'error'
      );
    } finally {
      this.isSubmitting = false;
    }
  }
}