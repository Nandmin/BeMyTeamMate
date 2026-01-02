import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { EventService, SportEvent } from '../../services/event.service';
import { AppUser } from '../../models/user.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map, of, from, take, combineLatest } from 'rxjs';

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
  private eventService = inject(EventService);
  private route = inject(ActivatedRoute);

  // Viewed user data
  profileUser = toSignal<AppUser | null>(
    this.route.params.pipe(
      switchMap((params) => {
        const id = params['id'];
        if (id && id !== this.authService.currentUser()?.uid) {
          return this.authService.getUserProfile(id);
        }
        return this.authService.userData$;
      })
    )
  );

  isOwnProfile = computed(() => {
    const viewedId = this.route.snapshot.params['id'];
    return !viewedId || viewedId === this.authService.currentUser()?.uid;
  });

  userGroups = toSignal(
    this.route.params.pipe(
      switchMap((params) => this.groupService.getUserGroups(params['id'])),
      switchMap((groups: any[]) => {
        if (!groups || groups.length === 0) return of([]);

        const enrichedGroups$ = groups.map((group) =>
          this.eventService.getEvents(group.id!).pipe(
            map((events: SportEvent[]) => {
              const nextEvent = events
                .filter((e) => {
                  if (e.status === 'finished' || e.status === 'active') return false;

                  const eventDate = e.date.toDate();
                  if (e.time) {
                    const [h, m] = e.time.split(':').map(Number);
                    eventDate.setHours(h, m);
                  }
                  return eventDate >= new Date();
                })
                .sort((a, b) => a.date.toMillis() - b.date.toMillis())[0];
              return { ...group, nextEvent };
            })
          ));

        return combineLatest(enrichedGroups$);
      })
    )
  );

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
      const u = this.profileUser();
      if (u && this.isOwnProfile() && !this.isEditing()) {
        this.profileData.displayName = u.displayName || '';
        this.profileData.email = u.email || '';
        this.profileData.bio = u.bio || '';
      }
    });
  }

  async onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Max 1MB
    if (file.size > 1024 * 1024) {
      alert('A fájl mérete nem lehet nagyobb, mint 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 128; // Strict 128x128 or fits inside
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        this.updateProfilePhoto(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async updateProfilePhoto(photoUrl: string | null) {
    try {
      await this.authService.updateProfile(
        this.profileData.displayName,
        photoUrl || undefined,
        this.profileData.bio
      );
    } catch (error) {
      console.error('Error updating photo:', error);
      alert('Hiba történt a kép frissítésekor.');
    }
  }

  async onDeletePhoto() {
    if (confirm('Biztosan törlöd a profilképedet?')) {
      await this.updateProfilePhoto(null);
    }
  }

  async onSaveProfile() {
    if (this.profileData.displayName) {
      try {
        await this.authService.updateProfile(
          this.profileData.displayName,
          this.profileUser()?.photoURL,
          this.profileData.bio
        );
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

  formatFullDate(timestamp: any, time?: string) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const dateStr = date
      .toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\s/g, ''); // Remove spaces for YYYY.MM.DD. format
    return time ? `${dateStr} ${time}` : dateStr;
  }
}
