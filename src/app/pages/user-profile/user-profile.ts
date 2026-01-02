import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
})
export class UserProfilePage {
  protected authService = inject(AuthService);
  private groupService = inject(GroupService);

  user = this.authService.currentUser;
  userGroups = toSignal(this.groupService.getUserGroups());

  // Edit profile state
  isEditing = signal(false);

  // Form fields
  profileData = {
    displayName: '',
    email: '',
    bio: '',
  };

  constructor() {
    effect(() => {
      const currentUser = this.user();
      if (currentUser && !this.isEditing()) {
        this.profileData.displayName = currentUser.displayName || '';
        this.profileData.email = currentUser.email || '';
      }
    });
  }

  async onSaveProfile() {
    if (this.profileData.displayName) {
      try {
        await this.authService.updateProfile(this.profileData.displayName);
        alert('Profil sikeresen mentve!');
      } catch (error) {
        console.error('Error saving profile:', error);
        alert('Hiba történt a mentés során.');
      }
    }
  }

  async onLogout() {
    await this.authService.logout();
  }
}
