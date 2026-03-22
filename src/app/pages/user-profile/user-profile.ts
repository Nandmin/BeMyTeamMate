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
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { switchMap, map, of, combineLatest, catchError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { environment } from '../../../environments/environment';
import { ModalService } from '../../services/modal.service';
import { EventService, SportEvent } from '../../services/event.service';
import { NotificationService } from '../../services/notification.service';
import { AppUser } from '../../models/user.model';
import { SeoService } from '../../services/seo.service';
import { CoverImagesService } from '../../services/cover-images.service';
import { getAppCheckTokenOrNull } from '../../utils/app-check.util';
import { AnalyticsService } from '../../services/analytics.service';
import { LanguageService } from '../../services/language.service';
import { TranslationKey } from '../../i18n/translations';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslocoPipe],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
})
export class UserProfilePage implements AfterViewInit, OnDestroy {
  private readonly profileFieldLabelKeys: Record<string, TranslationKey> = {
    displayName: 'profile.field.displayName',
    photoURL: 'profile.field.photo',
    bio: 'profile.field.bio',
    elo: 'profile.field.elo',
    email: 'profile.field.email',
  };

  protected authService = inject(AuthService);
  protected modalService = inject(ModalService);
  protected readonly languageService = inject(LanguageService);
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
                .filter((event) => {
                  if (event.status === 'finished' || event.status === 'active') return false;

                  const eventDate = this.toDate(event.date);
                  if (!eventDate) return false;
                  if (event.time) {
                    const [h, m] = event.time.split(':').map(Number);
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

  isEditing = signal(false);
  activeSection = signal('personal');
  pushEnabled = signal(this.notificationService.isPushEnabled());
  pushBusy = signal(false);
  isLoading = signal(false);
  cookieConsentGranted = computed(() => this.analyticsService.consent() === 'granted');

  profileData = {
    displayName: '',
    email: '',
    bio: '',
  };

  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
    loading: false,
    error: '',
  };

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('profile.meta.title'),
        description: this.languageService.t('profile.meta.description'),
        path: '/profile',
        noindex: true,
      });
    });

    void this.coverImagesService.getCoverImages();

    effect(() => {
      const user = this.profileUser();
      if (user && this.isOwnProfile() && !this.isEditing()) {
        this.profileData.displayName = user.displayName || '';
        this.profileData.email = user.email || '';
        this.profileData.bio = user.bio || '';
      }

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

    let attempts = 0;
    const maxAttempts = 10;

    const tryRender = () => {
      if (!this.turnstileContainer?.nativeElement) {
        if (attempts++ < maxAttempts) {
          setTimeout(tryRender, 500);
        }
        return;
      }

      if (!(window as any).turnstile) {
        if (attempts++ < maxAttempts) {
          setTimeout(tryRender, 500);
        }
        return;
      }

      if (this.turnstileContainer.nativeElement.querySelector('iframe')) return;

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
              setTimeout(() => this.resetTurnstile(), 1000);
            },
          },
        );
      } catch (error) {
        console.warn('Turnstile render error', error);
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
    } catch (error) {
      console.warn('Turnstile remove failed', error);
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

    if (file.size > 1024 * 1024) {
      await this.modalService.alert(
        this.languageService.t('profile.photo.fileTooLarge'),
        this.languageService.t('profile.modal.errorTitle'),
        'error',
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent: any) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        void this.updateProfilePhoto(dataUrl);
      };
      img.src = loadEvent.target.result;
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
      await this.modalService.alert(
        this.languageService.t('profile.photo.updated'),
        this.languageService.t('profile.modal.successTitle'),
        'success',
      );
    } catch (error) {
      console.error('Error updating photo:', error);
      await this.modalService.alert(
        this.languageService.t('profile.photo.updateError'),
        this.languageService.t('profile.modal.errorTitle'),
        'error',
      );
    }
  }

  async onDeletePhoto() {
    const shouldDelete = await this.modalService.confirm(
      this.languageService.t('profile.photo.deleteConfirm'),
    );
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
        results.push(this.languageService.t('profile.save.profileSaved'));
      }

      const password = this.passwordData;
      if (password.currentPassword || password.newPassword || password.confirmNewPassword) {
        if (!password.currentPassword) {
          throw new Error(this.languageService.t('profile.password.currentRequired'));
        }
        if (!password.newPassword || password.newPassword.length < 6) {
          throw new Error(this.languageService.t('profile.password.newMinLength'));
        }
        if (password.newPassword !== password.confirmNewPassword) {
          throw new Error(this.languageService.t('profile.password.mismatch'));
        }

        await this.authService.changePassword(password.currentPassword, password.newPassword);
        results.push(this.languageService.t('profile.password.changed'));

        password.currentPassword = '';
        password.newPassword = '';
        password.confirmNewPassword = '';
      }

      const message =
        results.length > 0
          ? this.languageService.t('profile.save.completed', { items: results.join(', ') })
          : this.languageService.t('profile.defaults.noChanges');
      await this.modalService.alert(
        message,
        this.languageService.t('profile.modal.successTitle'),
        'success',
      );
    } catch (error: any) {
      console.error('Error saving profile or changing password:', error);
      const message = error?.message || error?.code || String(error);
      await this.modalService.alert(
        message,
        this.languageService.t('profile.modal.errorTitle'),
        'error',
      );
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
        await this.modalService.alert(
          this.languageService.t('profile.notifications.pushDisabled'),
          this.languageService.t('profile.modal.successTitle'),
          'success',
        );
      } else {
        await this.notificationService.enablePushForCurrentUser();
        this.pushEnabled.set(true);
        await this.modalService.alert(
          this.languageService.t('profile.notifications.pushEnabled'),
          this.languageService.t('profile.modal.successTitle'),
          'success',
        );
      }
    } catch (error: any) {
      console.error('Push toggle error:', error);
      const message =
        error?.message || this.languageService.t('profile.notifications.pushFallbackError');
      await this.modalService.alert(
        message,
        this.languageService.t('profile.modal.errorTitle'),
        'error',
      );
    } finally {
      this.pushBusy.set(false);
    }
  }

  async toggleCookieConsent() {
    if (this.cookieConsentGranted()) {
      this.analyticsService.denyConsent();
      await this.modalService.alert(
        this.languageService.t('profile.privacy.analyticsDisabled'),
        this.languageService.t('profile.modal.privacyTitle'),
        'success',
      );
    } else {
      this.analyticsService.grantConsent();
      await this.modalService.alert(
        this.languageService.t('profile.privacy.analyticsEnabled'),
        this.languageService.t('profile.modal.privacyTitle'),
        'success',
      );
    }
  }

  scrollTo(id: string, event?: Event) {
    if (event) event.preventDefault();
    try {
      this.activeSection.set(id);
      const el = document.getElementById(id);
      if (!el) return;

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
      const header = document.querySelector('header');
      const headerHeight = header ? (header as HTMLElement).getBoundingClientRect().height : 80;
      const parentRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const currentScroll = (scrollParent as any).scrollTop || window.pageYOffset || 0;
      const relativeTop = elRect.top - parentRect.top + currentScroll;
      let targetScrollTop = Math.round(relativeTop - headerHeight - 8);

      const maxScroll = scrollParent.scrollHeight - scrollParent.clientHeight;
      if (targetScrollTop > maxScroll) targetScrollTop = maxScroll;
      if (targetScrollTop < 0) targetScrollTop = 0;

      if (typeof (scrollParent as any).scrollTo === 'function') {
        (scrollParent as any).scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    } catch (error) {
      console.error('Scroll failed', error);
    }
  }

  getSportIcon(sport?: string): string {
    if (!sport) return 'groups';
    const normalized = sport.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
      .toLocaleDateString(this.currentLocale(), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\s/g, '');
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
    return fields
      .map((field) => {
        const key = this.profileFieldLabelKeys[field];
        return key ? this.languageService.t(key) : field;
      })
      .join(', ');
  }

  protected profileDisplayName(user: AppUser | null | undefined): string {
    return user?.displayName || this.languageService.t('profile.defaults.userName');
  }

  protected profileBioText(): string {
    return this.profileUser()?.bio || this.languageService.t('profile.defaults.noBio');
  }

  protected groupSectionDescription(): string {
    if (this.isOwnProfile()) {
      return this.languageService.t('profile.groups.descriptionOwn');
    }

    return this.languageService.t('profile.groups.descriptionOther', {
      name: this.profileDisplayName(this.profileUser()),
    });
  }

  protected groupAccessTitle(groupId?: string): string | null {
    return this.canOpenGroup(groupId)
      ? null
      : this.languageService.t('profile.groups.viewRestricted');
  }

  protected currentLocale(): string {
    return this.languageService.currentLanguage() === 'en' ? 'en-US' : 'hu-HU';
  }

  canOpenGroup(groupId?: string) {
    if (!groupId) return false;
    if (this.authService.fullCurrentUser()?.role === 'siteadmin') return true;
    const viewerGroups = this.viewerGroups();
    return !!viewerGroups?.some((group) => group.id === groupId);
  }

  openGroup(groupId?: string) {
    if (!groupId || !this.canOpenGroup(groupId)) return;
    this.router.navigate(['/groups', groupId]);
  }

  getAvatarUrl(user: AppUser | null | undefined): string {
    if (user?.photoURL) return user.photoURL;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'default'}`;
  }

  resolveCoverImage(imageId?: number | string | null): string {
    return (
      this.coverImagesService.resolveImageSrc(imageId) ||
      this.coverImagesService.getDefaultImageSrc()
    );
  }

  async onDeleteRegistration() {
    const confirmed = await this.modalService.confirm(
      this.languageService.t('profile.delete.confirmMessage'),
      this.languageService.t('profile.modal.deleteRegistrationTitle'),
      this.languageService.t('profile.delete.confirmAction'),
      this.languageService.t('common.cancel'),
    );

    if (!confirmed) return;

    if (environment.turnstileSiteKey && !this.turnstileToken()) {
      await this.modalService.alert(
        this.languageService.t('profile.delete.robotCheck'),
        this.languageService.t('profile.modal.errorTitle'),
        'error',
      );
      return;
    }

    const user = this.authService.currentUser();
    if (!user) return;

    this.isLoading.set(true);

    try {
      const payload = {
        message: `DELETE_ACCOUNT_REQUEST: User UID ${user.uid} initiated account deletion via profile page.`,
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
        throw new Error(
          this.languageService.t('profile.delete.requestFailed', {
            detail: detail || response.statusText,
          }),
        );
      }

      await this.modalService.alert(
        this.languageService.t('profile.delete.requestAccepted'),
        this.languageService.t('profile.modal.successTitle'),
        'success',
      );

      this.resetTurnstile();
      this.turnstileToken.set('');
    } catch (error: any) {
      console.error('Delete registration request failed:', error);
      await this.modalService.alert(
        this.languageService.t('profile.delete.requestSendFailed', {
          message: error?.message || this.languageService.t('common.error.unexpected'),
        }),
        this.languageService.t('profile.modal.errorTitle'),
        'error',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
