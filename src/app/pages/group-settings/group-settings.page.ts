import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupMember } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CoverImageSelectorComponent } from '../../components/cover-image-selector/cover-image-selector.component';
import { RoleLabelPipe } from '../../pipes/role-label.pipe';
import { SeoService } from '../../services/seo.service';
import { CoverImageEntry, CoverImagesService } from '../../services/cover-images.service';

export type MemberRole = 'owner' | 'admin' | 'member';

@Component({
  selector: 'app-group-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CoverImageSelectorComponent, RoleLabelPipe],
  templateUrl: './group-settings.page.html',
  styleUrl: './group-settings.page.scss',
})
export class GroupSettingsPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupService = inject(GroupService);
  protected authService = inject(AuthService);
  private seo = inject(SeoService);
  private coverImagesService = inject(CoverImagesService);

  group = toSignal(
    this.route.params.pipe(
      switchMap((params) =>
        this.groupService.getGroup(params['id']).pipe(
          catchError((err) => {
            console.error('Group load error:', err);
            this.errorMessage.set('Hiba a csoport betöltésekor: ' + (err.message || err));
            return of(undefined);
          }),
        ),
      ),
    ),
  );

  members = toSignal(
    this.route.params.pipe(
      switchMap((params) =>
        this.groupService.getGroupMembers(params['id']).pipe(
          catchError((err) => {
            console.error('Members load error:', err);
            // Don't block page, just log
            return of([]);
          }),
        ),
      ),
    ),
  );

  joinRequests = toSignal(
    this.route.params.pipe(
      switchMap((params) =>
        this.groupService.getJoinRequests(params['id']).pipe(
          catchError((err) => {
            console.error('Join requests load error:', err);
            // Don't block page, just log
            return of([]);
          }),
        ),
      ),
    ),
  );

  // Check if current user is owner or admin
  isOwner = computed(() => {
    const user = this.authService.currentUser();
    const group = this.group();
    if (!user || !group) return false;
    return group.ownerId === user.uid;
  });

  isAdmin = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    return members.some((m) => m.userId === user.uid && m.isAdmin);
  });

  isSiteAdmin = computed(() => this.authService.fullCurrentUser()?.role === 'siteadmin');

  canManageMembers = computed(() => this.isOwner() || this.isAdmin() || this.isSiteAdmin());

  // Form states
  isSubmitting = signal(false);
  activeTab = signal<'members' | 'settings'>('members');

  // Edit group form
  editGroupForm = signal({
    name: '',
    description: '',
    type: 'open' as 'open' | 'closed',
    image: null as number | string | null,
  });

  // Member to delete (for confirmation modal)
  memberToDelete = signal<GroupMember | null>(null);
  // Member to edit role
  memberToEditRole = signal<GroupMember | null>(null);
  selectedRole = signal<MemberRole>('member');

  successMessage = signal('');
  errorMessage = signal('');

  // Request to reject
  requestToReject = signal<any>(null);

  // Available cover images
  availableCoverImages: CoverImageEntry[] = [];

  // Image selector modal state
  showImageSelector = signal(false);

  constructor() {
    this.seo.setPageMeta({
      title: 'Csoport beállítások – BeMyTeamMate',
      description: 'Kezeld a csoport adatait, tagokat és jogosultságokat.',
      path: '/groups',
      noindex: true,
    });
    void this.loadCoverImages();

    // Initialize edit form when group loads
    effect(() => {
      const group = this.group();
      if (group) {
        untracked(() => {
          this.editGroupForm.set({
            name: group.name || '',
            description: group.description || '',
            type: group.type || 'open',
            image: group.image || '',
          });
        });
      }
    });
  }

  private async loadCoverImages(tag?: string) {
    this.availableCoverImages = await this.coverImagesService.getImageEntries(tag);
  }

  resolveCoverImage(imageId?: number | string | null): string {
    return (
      this.coverImagesService.resolveImageSrc(imageId) ||
      this.coverImagesService.getDefaultImageSrc()
    );
  }

  get groupId(): string {
    return this.route.snapshot.params['id'];
  }
  openDeleteModal(member: GroupMember) {
    if (member.userId === this.group()?.ownerId) {
      this.errorMessage.set('A csoport tulajdonosát nem lehet törölni.');
      return;
    }
    this.memberToDelete.set(member);
  }

  closeDeleteModal() {
    this.memberToDelete.set(null);
  }

  async confirmDeleteMember() {
    const member = this.memberToDelete();
    if (!member) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      await this.groupService.removeMember(this.groupId, member.id!);
      this.successMessage.set(`${member.name} sikeresen eltávolítva a csoportból.`);
      this.closeDeleteModal();
    } catch (error: any) {
      console.error('Error removing member:', error);
      this.errorMessage.set('Hiba történt a tag eltávolításakor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openRoleModal(member: GroupMember) {
    if (member.userId === this.group()?.ownerId) {
      this.errorMessage.set('A csoport tulajdonosának szerepét nem lehet módosítani.');
      return;
    }
    this.memberToEditRole.set(member);
    this.selectedRole.set(member.isAdmin ? 'admin' : 'member');
  }

  closeRoleModal() {
    this.memberToEditRole.set(null);
  }

  async confirmUpdateRole() {
    const member = this.memberToEditRole();
    if (!member) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const isAdmin = this.selectedRole() === 'admin';
      const role = this.selectedRole() === 'admin' ? 'Admin' : 'user';
      await this.groupService.updateMemberRole(this.groupId, member.id!, { isAdmin, role });
      this.successMessage.set(`${member.name} szerepe sikeresen módosítva.`);
      this.closeRoleModal();
    } catch (error: any) {
      console.error('Error updating role:', error);
      this.errorMessage.set('Hiba történt a szerep módosításakor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- Group Settings ---
  async saveGroupSettings() {
    const form = this.editGroupForm();
    if (!form.name.trim()) {
      this.errorMessage.set('A csoport neve kötelező.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      await this.groupService.updateGroup(this.groupId, {
        name: form.name.trim(),
        description: form.description.trim(),
        type: form.type,
        image: form.image ?? undefined,
      });
      this.successMessage.set('A csoport beállításai sikeresen mentve.');
    } catch (error: any) {
      console.error('Error updating group:', error);
      this.errorMessage.set('Hiba történt a mentéskor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  updateFormField(
    field: 'name' | 'description' | 'type' | 'image',
    value: string | number | null,
  ) {
    this.editGroupForm.update((form) => ({ ...form, [field]: value }));
  }

  // --- Image Selector ---
  openImageSelector() {
    this.showImageSelector.set(true);
  }

  closeImageSelector() {
    this.showImageSelector.set(false);
  }

  selectCoverImage(imageId: number) {
    this.updateFormField('image', imageId);
    this.closeImageSelector();
  }

  goBack() {
    this.router.navigate(['/groups', this.groupId]);
  }

  getRoleBadge(member: GroupMember): string {
    if (member.userId === this.group()?.ownerId) return 'Tulajdonos';
    if (member.isAdmin) return 'Admin';
    return 'Csapattag';
  }

  getRoleBadgeClass(member: GroupMember): string {
    if (member.userId === this.group()?.ownerId)
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (member.isAdmin) return 'bg-primary/20 text-primary border-primary/30';
    return 'bg-white/10 text-gray-300 border-white/10';
  }

  // --- Join Requests ---
  async onApproveRequest(request: any) {
    this.isSubmitting.set(true);
    try {
      await this.groupService.approveJoinRequest(request.id, this.groupId);
      this.successMessage.set(`${request.userName} csatlakozása jóváhagyva.`);
    } catch (error: any) {
      console.error('Approve error:', error);
      this.errorMessage.set('Hiba történt a jóváhagyás során.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- Reject Modal Logic ---
  openRejectModal(request: any) {
    this.requestToReject.set(request);
  }

  closeRejectModal() {
    this.requestToReject.set(null);
  }

  async confirmRejectRequest() {
    const request = this.requestToReject();
    if (!request) return;

    this.isSubmitting.set(true);
    try {
      await this.groupService.rejectJoinRequest(request.id, this.groupId);
      this.successMessage.set(`${request.userName} jelentkezése elutasítva.`);
      this.closeRejectModal();
    } catch (error: any) {
      console.error('Reject error:', error);
      this.errorMessage.set('Hiba történt az elutasítás során.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // --- Group Deletion ---
  showDeleteGroupModal = signal(false);

  openDeleteGroupModal() {
    this.showDeleteGroupModal.set(true);
  }

  closeDeleteGroupModal() {
    this.showDeleteGroupModal.set(false);
  }

  async confirmDeleteGroup() {
    this.isSubmitting.set(true);
    try {
      await this.groupService.deleteGroup(this.groupId);
      this.router.navigate(['/groups']);
    } catch (error: any) {
      console.error('Delete group error:', error);
      this.errorMessage.set('Hiba történt a csoport törlésekor.');
      this.isSubmitting.set(false);
      this.closeDeleteGroupModal();
    }
  }
}
