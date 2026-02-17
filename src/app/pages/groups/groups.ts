import {
  Component,
  inject,
  Signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  effect,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GroupService, Group } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { ModalService } from '../../services/modal.service';
import { SeoService } from '../../services/seo.service';
import { CoverImagesService } from '../../services/cover-images.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './groups.html',
  styleUrl: './groups.scss',
})
export class GroupsPage implements AfterViewInit, OnDestroy {
  @ViewChild('carouselContainer') carouselContainer!: ElementRef<HTMLDivElement>;
  private didInitialCarouselReset = false;
  private previousScrollRestoration: History['scrollRestoration'] | null = null;

  scrollCarousel(direction: 'left' | 'right') {
    const container = this.carouselContainer.nativeElement;
    const scrollAmount = 300; // Adjust as needed, approx one card width + gap
    const currentScroll = container.scrollLeft;
    const targetScroll =
      direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount;

    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  }

  ngAfterViewInit() {
    if ('scrollRestoration' in history) {
      this.previousScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';
    }

    effect(() => {
      const groups = this.groups();
      if (this.didInitialCarouselReset || !this.carouselContainer || groups === undefined) return;

      afterNextRender(() => {
        const container = this.carouselContainer.nativeElement;
        const previousBehavior = container.style.scrollBehavior;
        container.style.scrollBehavior = 'auto';
        container.scrollLeft = 0;
        container.style.scrollBehavior = previousBehavior;
        this.didInitialCarouselReset = true;
      });
    });
  }

  ngOnDestroy() {
    if (this.previousScrollRestoration) {
      history.scrollRestoration = this.previousScrollRestoration;
      this.previousScrollRestoration = null;
    }
  }

  private groupService = inject(GroupService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  protected authService = inject(AuthService);
  private modalService = inject(ModalService);
  private seo = inject(SeoService);
  private coverImagesService = inject(CoverImagesService);

  groups: Signal<Group[] | undefined> = toSignal(
    this.authService.user$.pipe(
      // Fetch ONLY the groups the user is a member of, not all groups
      switchMap((user) => {
        if (!user) return of([]);
        return this.groupService.getUserGroups(user.uid);
      }),
      catchError((err) => {
        console.error('Error loading user groups:', err);
        return of([]);
      })
    )
  );

  showCreateModal = false;
  groupForm: FormGroup;
  isSubmitting = false;
  readonly groupNameMaxLength = 50;
  readonly groupDescriptionMaxLength = 250;

  constructor() {
    this.seo.setPageMeta({
      title: 'Csoportok kezelése – BeMyTeamMate',
      description: 'Hozz létre csoportokat, kezeld a tagságot, és szervezd a közös meccseket.',
      path: '/groups',
      noindex: true,
    });
    void this.coverImagesService.getCoverImages();
    this.groupForm = this.fb.group({
      name: [
        '',
        [Validators.required, Validators.minLength(3), Validators.maxLength(this.groupNameMaxLength)],
      ],
      type: ['closed', Validators.required],
      description: ['', [Validators.maxLength(this.groupDescriptionMaxLength)]],
    });
  }

  resolveCoverImage(imageId?: number | string | null): string {
    return (
      this.coverImagesService.resolveImageSrc(imageId) ||
      this.coverImagesService.getDefaultImageSrc()
    );
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
    if (this.groupForm.invalid) {
      this.groupForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      const { name, type, description } = this.groupForm.value;
      const normalizedName = (name ?? '').trim();
      const normalizedDescription = (description ?? '').trim();
      await this.groupService.createGroup(normalizedName, type, normalizedDescription);
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

  // --- Join Group ---
  showJoinModal = false;
  joinForm = this.fb.group({
    groupName: ['', [Validators.required]],
    joinConsent: [false, [Validators.requiredTrue]],
  });

  toggleJoinModal() {
    this.showJoinModal = !this.showJoinModal;
    if (!this.showJoinModal) {
      this.joinForm.reset({ joinConsent: false });
    }
  }

  async onJoinGroup() {
    if (this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const { groupName } = this.joinForm.value;

    try {
      const group = await this.groupService.findGroupByName(groupName!);
      if (!group) {
        await this.modalService.alert('Nem található csoport ezzel a névvel.', 'Hiba', 'error');
        return;
      }

      await this.groupService.requestJoinGroup(group.id!);
      await this.modalService.alert('Csatlakozási kérelem elküldve!', 'Siker', 'success');
      this.toggleJoinModal();
    } catch (error: any) {
      console.error('Join error:', error);
      await this.modalService.alert(
        error.message || 'Hiba történt a csatlakozás során.',
        'Hiba',
        'error'
      );
    } finally {
      this.isSubmitting = false;
    }
  }
}
