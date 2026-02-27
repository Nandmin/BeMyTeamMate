import {
  Component,
  inject,
  signal,
  effect,
  computed,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppCheck } from '@angular/fire/app-check';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { environment } from '../../../environments/environment';
import { ModalService } from '../../services/modal.service';
import { EventService, SportEvent } from '../../services/event.service';
import { NotificationService } from '../../services/notification.service';
import { AppUser } from '../../models/user.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map, of, from, take, combineLatest, catchError } from 'rxjs';
import { SeoService } from '../../services/seo.service';
import { CoverImagesService } from '../../services/cover-images.service';
import { getAppCheckTokenOrNull } from '../../utils/app-check.util';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
})
export class UserProfilePage implements AfterViewInit {
  private readonly profileFieldLabels: Record<string, string> = {
    displayName: 'Felhasználónév',
    photoURL: 'Profilkép',
    bio: 'Bemutatkozás',
    elo: 'ELO pontszám',
    email: 'E-mail cím',
  };

  protected authService = inject(AuthService);
  protected modalService = inject(ModalService);
  private groupService = inject(GroupService);
  private eventService = inject(EventService);
  private notificationService = inject(NotificationService);
  private appCheck = inject(AppCheck, { optional: true });
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private seo = inject(SeoService);
  private coverImagesService = inject(CoverImagesService);
  private analyticsService = inject(AnalyticsService);

  @ViewChild('turnstileContainer', { static: false })
  turnstileContainer?: ElementRef<HTMLDivElement>;

  turnstileToken = signal('');
  turnstileError = signal('');
  private turnstileWidgetId: string | null = null;
  private turnstileThemeObserver: MutationObserver | null = null;
  private lastTurnstileTheme: 'light' | 'dark' | null = null;

  // Viewed user data
  profileUser = toSignal<AppUser | null>(
    this.route.params.pipe(
      switchMap((params) => {
        const id = params['id'];
        if (id && id !== this.authService.currentUser()?.uid) {
          return this.authService.getUserProfile(id);
        }
        return this.authService.userData$;
      }),
    ),
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
            }),
          ),
        );

        return combineLatest(enrichedGroups$);
      }),
      catchError((error) => {
        console.warn('Failed to load user groups:', error);
        return of([]);
      }),
    ),
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
      }),
    ),
  );

  // Edit profile state
  isEditing = signal(false);
  activeSection = signal('personal');
  pushEnabled = signal(this.notificationService.isPushEnabled());
  pushBusy = signal(false);
  isLoading = signal(false);
  cookieConsentGranted = computed(() => this.analyticsService.consent() === 'granted');

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
    this.seo.setPageMeta({
      title: 'Profil – BeMyTeamMate',
      description: 'Felhasználói profil, statisztikák és csoportok áttekintése.',
      path: '/profile',
      noindex: true,
    });
    void this.coverImagesService.getCoverImages();

    effect(() => {
      const u = this.profileUser();
      if (u && this.isOwnProfile() && !this.isEditing()) {
        this.profileData.displayName = u.displayName || '';
        this.profileData.email = u.email || '';
        this.profileData.bio = u.bio || '';
      }

      // Re-load turnstile if we switch back to profile section
      if (this.isOwnProfile() && !this.isEditing()) {
        setTimeout(() => this.loadTurnstile(), 100);
      }
    });
  }

  ngAfterViewInit() {
    this.loadTurnstile();
    this.observeThemeChanges();
  }

  ngOnDestroy() {
    if (this.turnstileThemeObserver) {
      this.turnstileThemeObserver.disconnect();
      this.turnstileThemeObserver = null;
    }
  }

  private resolveTurnstileTheme(): 'light' | 'dark' {
    return document.documentElement.classList.contains('light') ? 'light' : 'dark';
  }

  private loadTurnstile() {
    if (!environment.turnstileSiteKey) return;

    // Robust retry logic to deal with race conditions and slow loading
    let attempts = 0;
    const maxAttempts = 10;

    // Reset any previous state if needed
    // if (this.turnstileWidgetId) return; // Wait, if we want to re-render we might need to be careful

    const tryRender = () => {
      // 1. Check if container element is available in DOM
      if (!this.turnstileContainer?.nativeElement) {
        if (attempts++ < maxAttempts) {
          setTimeout(tryRender, 500);
        }
        return;
      }

      // 2. Check if Turnstile script is loaded globally
      if (!(window as any).turnstile) {
        if (attempts++ < maxAttempts) {
          setTimeout(tryRender, 500);
        }
        return;
      }

      // 3. Check if already rendered (has children that are not text nodes or we have token)
      // If the container already has Turnstile iframe, skip re-render.
      if (this.turnstileContainer.nativeElement.querySelector('iframe')) return; // Already has iframe

      // Clear text content (Loading...)
      this.turnstileContainer.nativeElement.textContent = '';

      try {
        const theme = this.resolveTurnstileTheme();
        this.lastTurnstileTheme = theme;
        this.turnstileWidgetId = (window as any).turnstile.render(
          this.turnstileContainer.nativeElement,
          {
            sitekey: environment.turnstileSiteKey,
            theme,
            callback: (token: string) => {
              this.turnstileToken.set(token);
              this.turnstileError.set('');
            },
            'expired-callback': () => {
              this.turnstileToken.set('');
              this.resetTurnstile();
            },
            'error-callback': () => {
              this.turnstileToken.set('');
              // Retry reset after a short delay to recover from transient errors
              setTimeout(() => this.resetTurnstile(), 1000);
            },
          },
        );
      } catch (e) {
        console.warn('Turnstile render error', e);
      }
    };

    if (document.getElementById('cf-turnstile-script')) {
      tryRender();
      return;
    }

    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => tryRender();
    document.head.appendChild(script);
  }

  private observeThemeChanges() {
    if (typeof MutationObserver === 'undefined') return;

    const root = document.documentElement;
    this.lastTurnstileTheme = this.resolveTurnstileTheme();

    this.turnstileThemeObserver = new MutationObserver(() => {
      const nextTheme = this.resolveTurnstileTheme();
      if (nextTheme === this.lastTurnstileTheme) return;
      this.lastTurnstileTheme = nextTheme;
      this.rerenderTurnstileForTheme();
    });

    this.turnstileThemeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  private rerenderTurnstileForTheme() {
    if (!this.turnstileContainer?.nativeElement || !(window as any).turnstile) return;

    try {
      if (this.turnstileWidgetId && typeof (window as any).turnstile.remove === 'function') {
        (window as any).turnstile.remove(this.turnstileWidgetId);
      }
    } catch (err) {
      console.warn('Turnstile remove failed', err);
    }

    this.turnstileWidgetId = null;
    this.turnstileToken.set('');
    this.turnstileError.set('');
    this.turnstileContainer.nativeElement.textContent = '';
    this.loadTurnstile();
  }

  private resetTurnstile() {
    if (this.turnstileWidgetId && (window as any).turnstile) {
      (window as any).turnstile.reset(this.turnstileWidgetId);
    }
  }

  async onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Max 1MB
    if (file.size > 1024 * 1024) {
      await this.modalService.alert('A fájl mérete nem lehet nagyobb, mint 1MB.', 'Hiba', 'error');
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
        this.profileData.bio,
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
          this.profileData.bio,
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
        if (pw.newPassword !== pw.confirmNewPassword)
          throw new Error('Az új jelszavak nem egyeznek.');

        await this.authService.changePassword(pw.currentPassword, pw.newPassword);
        results.push('Jelszó megváltoztatva');

        // clear password fields
        pw.currentPassword = '';
        pw.newPassword = '';
        pw.confirmNewPassword = '';
      }

      const message =
        results.length > 0 ? results.join(', ') + ' sikeresen.' : 'Nincs változtatás.';
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

  async togglePushNotifications() {
    if (this.pushBusy()) return;
    this.pushBusy.set(true);
    try {
      if (this.pushEnabled()) {
        await this.notificationService.disablePushForCurrentUser();
        this.pushEnabled.set(false);
        await this.modalService.alert('Push értesítések kikapcsolva.', 'Siker', 'success');
      } else {
        await this.notificationService.enablePushForCurrentUser();
        this.pushEnabled.set(true);
        await this.modalService.alert('Push értesítések bekapcsolva.', 'Siker', 'success');
      }
    } catch (error: any) {
      console.error('Push toggle error:', error);
      const msg = error?.message || 'Nem sikerült a push értesítések kezelése.';
      await this.modalService.alert(msg, 'Hiba', 'error');
    } finally {
      this.pushBusy.set(false);
    }
  }

  async toggleCookieConsent() {
    if (this.cookieConsentGranted()) {
      this.analyticsService.denyConsent();
      await this.modalService.alert(
        'Az analitikai sütik tiltása sikeres. A következő oldalbetöltéstől érvényes.',
        'Adatvédelem',
        'success',
      );
    } else {
      this.analyticsService.grantConsent();
      await this.modalService.alert(
        'Az analitikai sütik engedélyezése sikeres.',
        'Adatvédelem',
        'success',
      );
    }
  }

  // Smooth-scroll to a section on this page (with small offset for sticky headers)
  scrollTo(id: string, event?: Event) {
    if (event) event.preventDefault();
    try {
      this.activeSection.set(id);
      const el = document.getElementById(id);
      if (!el) return;

      // Find nearest scrollable ancestor
      const getScrollParent = (
        node: HTMLElement | null,
      ): HTMLElement | (Element & { scrollTo?: any }) => {
        let parent = node?.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          const overflowY = style.overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            parent.scrollHeight > parent.clientHeight
          ) {
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
    if (
      normalized.includes('tenisz') ||
      normalized.includes('tennis') ||
      normalized.includes('padel')
    ) {
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

  protected toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  protected formatModifiedFields(fields?: string[] | null): string {
    if (!fields?.length) return '';
    return fields.map((field) => this.profileFieldLabels[field] ?? field).join(', ');
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

  getAvatarUrl(user: AppUser | null | undefined): string {
    if (user?.photoURL) return user.photoURL;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'default'}`;
    // return `https://api.dicebear.com/7.x/adventurer/svg?seed=${user?.uid || 'default'}`;
  }

  resolveCoverImage(imageId?: number | string | null): string {
    return (
      this.coverImagesService.resolveImageSrc(imageId) ||
      this.coverImagesService.getDefaultImageSrc()
    );
  }

  async onDeleteRegistration() {
    const confirmed = await this.modalService.confirm(
      'Biztosan törölni szeretnéd a regisztrációdat? A művelet nem vonható vissza és minden adatod véglegesen törlésre kerül.',
      'Regisztráció törlése',
      'Végleges törlés',
      'Mégse',
    );

    if (!confirmed) return;

    if (environment.turnstileSiteKey && !this.turnstileToken()) {
      await this.modalService.alert(
        'Kérlek igazold, hogy nem vagy robot! (Töltsd ki a Captchát a gomb közelében)',
        'Hiba',
        'error',
      );
      return;
    }

    const user = this.authService.currentUser();
    if (!user) return;

    this.isLoading.set(true);

    try {
      const payload = {
        message: `DELETE_ACCOUNT_REQUEST: A felhasználó (UID: ${user.uid}) kezdeményezte a fiókja törlését a profil oldalon keresztül.`,
        contactEmail: user.email || 'unknown@user.com',
        honeypot: '',
        turnstileToken: this.turnstileToken(),
        user: {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
        },
      };

      const appCheckToken = await getAppCheckTokenOrNull(this.appCheck);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      const response = await fetch(environment.contactWorkerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error('Delete request failed details:', response.status, detail);
        throw new Error(`Sikertelen kérelem: ${detail || response.statusText}`);
      }

      await this.modalService.alert(
        'A törlési kérelmedet fogadtuk. A fiókod hamarosan törlésre kerül.',
        'Kérelem elküldve',
        'success',
      );

      this.resetTurnstile();
      this.turnstileToken.set('');
    } catch (error: any) {
      console.error('Delete registration request failed:', error);
      await this.modalService.alert(
        `Nem sikerült elküldeni a kérelmet: ${error.message}`,
        'Hiba',
        'error',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
