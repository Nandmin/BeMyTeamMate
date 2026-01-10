import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { ModalService } from '../../services/modal.service';
import { EventService, SportEvent } from '../../services/event.service';
import { AppUser } from '../../models/user.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map, of, from, take, combineLatest, catchError } from 'rxjs';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
})
export class UserProfilePage {
  protected authService = inject(AuthService);
  protected modalService = inject(ModalService);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
      switchMap((params) => {
        const id = params['id'];
        const isOwn = !id || id === this.authService.currentUser()?.uid;
        if (!id || isOwn) {
          return this.groupService.getUserGroups(id);
        }
        return this.groupService.getGroupsForMember(id);
      }),
      switchMap((groups: any[]) => {
        if (!groups || groups.length === 0) return of([]);

        const enrichedGroups$ = groups.map((group) =>
          this.eventService.getUpcomingEvents(group.id!).pipe(
            map((events: SportEvent[]) => {
              const nextEvent = events
                .filter((e) => {
                  if (e.status === 'finished' || e.status === 'active') return false;

                  const eventDate = this.toDate(e.date);
                  if (!eventDate) return false;
                  if (e.time) {
                    const [h, m] = e.time.split(':').map(Number);
                    eventDate.setHours(h, m);
                  }
                  return eventDate >= new Date();
                })
                .sort((a, b) => {
                  const aDate = this.toDate(a.date)?.getTime() ?? 0;
                  const bDate = this.toDate(b.date)?.getTime() ?? 0;
                  return aDate - bDate;
                })[0];
              return { ...group, nextEvent };
            })
          ));

        return combineLatest(enrichedGroups$);
      }),
      catchError((error) => {
        console.warn('Failed to load user groups:', error);
        return of([]);
      })
    )
  );

  viewerGroups = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => {
        if (!user?.uid) return of([]);
        return this.groupService.getUserGroups(user.uid);
      }),
      catchError((error) => {
        console.warn('Failed to load viewer groups:', error);
        return of([]);
      })
    )
  );

  // Edit profile state
  isEditing = signal(false);
  activeSection = signal('personal');

  // Form fields
  profileData = {
    displayName: '',
    email: '',
    bio: '',
  };

  // Password change form state
  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
    loading: false,
    error: '',
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
      await this.modalService.alert(
        'A fájl mérete nem lehet nagyobb, mint 1MB.',
        'Hiba',
        'error'
      );
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
      await this.modalService.alert('Profilkép frissítve.', 'Siker', 'success');
    } catch (error) {
      console.error('Error updating photo:', error);
      await this.modalService.alert('Hiba történt a kép frissítésekor.', 'Hiba', 'error');
    }
  }

  async onDeletePhoto() {
    const shouldDelete = await this.modalService.confirm('Biztosan törlöd a profilképedet?');
    if (shouldDelete) {
      await this.updateProfilePhoto(null);
    }
  }

  async onSaveProfile() {
    const results: string[] = [];
    try {
      if (this.profileData.displayName) {
        await this.authService.updateProfile(
          this.profileData.displayName,
          this.profileUser()?.photoURL,
          this.profileData.bio
        );
        results.push('Profil mentve');
      }

      // If any password field filled, attempt password change
      const pw = this.passwordData;
      if (pw.currentPassword || pw.newPassword || pw.confirmNewPassword) {
        // validate
        if (!pw.currentPassword) throw new Error('Add meg a jelenlegi jelszavadat.');
        if (!pw.newPassword || pw.newPassword.length < 6)
          throw new Error('Az új jelszónak legalább 6 karakter hosszúnak kell lennie.');
        if (pw.newPassword !== pw.confirmNewPassword) throw new Error('Az új jelszavak nem egyeznek.');

        await this.authService.changePassword(pw.currentPassword, pw.newPassword);
        results.push('Jelszó megváltoztatva');

        // clear password fields
        pw.currentPassword = '';
        pw.newPassword = '';
        pw.confirmNewPassword = '';
      }

      const message = results.length > 0 ? results.join(', ') + ' sikeresen.' : 'Nincs változtatás.';
      await this.modalService.alert(message, 'Siker', 'success');
    } catch (error: any) {
      console.error('Error saving profile or changing password:', error);
      const msg = error?.message || error?.code || String(error);
      await this.modalService.alert(msg, 'Hiba', 'error');
    }
  }

  

  async onLogout() {
    await this.authService.logout();
  }

  // Smooth-scroll to a section on this page (with small offset for sticky headers)
  scrollTo(id: string, event?: Event) {
    if (event) event.preventDefault();
    try {
      this.activeSection.set(id);
      const el = document.getElementById(id);
      if (!el) return;

      // Find nearest scrollable ancestor
      const getScrollParent = (node: HTMLElement | null): HTMLElement | (Element & { scrollTo?: any }) => {
        let parent = node?.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          const overflowY = style.overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return document.scrollingElement || document.documentElement;
      };

      const scrollParent = getScrollParent(el as HTMLElement) as HTMLElement;

      // header height to keep sticky header visible
      const header = document.querySelector('header');
      const headerHeight = header ? (header as HTMLElement).getBoundingClientRect().height : 80;

      // Compute target scrollTop relative to scrollParent
      const parentRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const currentScroll = (scrollParent as any).scrollTop || window.pageYOffset || 0;

      // position of element relative to scrollParent's content top
      const relativeTop = elRect.top - parentRect.top + currentScroll;
      let targetScrollTop = Math.round(relativeTop - headerHeight - 8);

      // Clamp to scrollable bounds
      const maxScroll = scrollParent.scrollHeight - scrollParent.clientHeight;
      if (targetScrollTop > maxScroll) targetScrollTop = maxScroll;
      if (targetScrollTop < 0) targetScrollTop = 0;

      if (typeof (scrollParent as any).scrollTo === 'function') {
        (scrollParent as any).scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    } catch (err) {
      console.error('Scroll failed', err);
    }
  }

  getSportIcon(sport?: string): string {
    if (!sport) return 'groups';
    const normalized = sport.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (
      normalized.includes('foci') ||
      normalized.includes('soccer') ||
      normalized.includes('football')
    ) {
      return 'sports_soccer';
    }
    if (normalized.includes('kosar') || normalized.includes('basketball')) {
      return 'sports_basketball';
    }
    if (normalized.includes('kezilabda') || normalized.includes('handball')) {
      return 'sports_handball';
    }
    if (normalized.includes('roplabda') || normalized.includes('volleyball')) {
      return 'sports_volleyball';
    }
    if (normalized.includes('tenisz') || normalized.includes('tennis') || normalized.includes('padel')) {
      return 'sports_tennis';
    }
    if (normalized.includes('jegkorong') || normalized.includes('hockey')) {
      return 'sports_hockey';
    }
    if (normalized.includes('squash')) return 'sports_tennis';
    if (normalized.includes('bowling')) return 'sports_baseball';
    if (normalized.includes('other') || normalized.includes('egyeb')) return 'more_horiz';
    return 'sports';
  }

  formatFullDate(timestamp: any, time?: string) {
    if (!timestamp) return '';
    const date = this.toDate(timestamp) ?? new Date(NaN);
    const dateStr = date
      .toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\s/g, ''); // Remove spaces for YYYY.MM.DD. format
    return time ? `${dateStr} ${time}` : dateStr;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  canOpenGroup(groupId?: string) {
    if (!groupId) return false;
    if (this.authService.fullCurrentUser()?.role === 'siteadmin') return true;
    const viewerGroups = this.viewerGroups();
    return !!viewerGroups?.some((g) => g.id === groupId);
  }

  openGroup(groupId?: string) {
    if (!groupId || !this.canOpenGroup(groupId)) return;
    this.router.navigate(['/groups', groupId]);
  }
}
