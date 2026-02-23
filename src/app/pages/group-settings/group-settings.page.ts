import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupMember, GroupInvite } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CoverImageSelectorComponent } from '../../components/cover-image-selector/cover-image-selector.component';
import { RoleLabelPipe } from '../../pipes/role-label.pipe';
import { SeoService } from '../../services/seo.service';
import { CoverImageEntry, CoverImagesService } from '../../services/cover-images.service';
import { ModalService } from '../../services/modal.service';

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
  private modalService = inject(ModalService);
  private settingsQueryParams = toSignal(this.route.queryParams, { initialValue: {} as any });

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

  groupInvites = toSignal(
    this.route.params.pipe(
      switchMap((params) =>
        this.groupService.getGroupInvites(params['id']).pipe(
          catchError((err) => {
            console.error('Group invites load error:', err);
            return of([]);
          }),
        ),
      ),
    ),
  );

  private getInviteCreatedAtMs(invite: GroupInvite): number {
    const value: any = invite?.createdAt;
    if (!value) return 0;
    if (typeof value?.toDate === 'function') {
      return value.toDate().getTime();
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  sortedInvites = computed(() => {
    const invites = this.groupInvites() || [];
    return [...invites].sort(
      (a, b) => this.getInviteCreatedAtMs(b) - this.getInviteCreatedAtMs(a),
    );
  });

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
  isMember = computed(() => {
    const user = this.authService.currentUser();
    const members = this.members();
    if (!user || !members) return false;
    return members.some((m) => m.userId === user.uid || m.id === user.uid);
  });

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
  readonly groupNameMaxLength = 50;
  readonly groupDescriptionMaxLength = 250;

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
      const tab = this.settingsQueryParams()['tab'];
      if (tab === 'settings' || tab === 'members') {
        this.activeTab.set(tab);
      }
    });

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
    const name = form.name.trim();
    const description = form.description.trim();

    if (!name) {
      this.errorMessage.set('A csoport neve kötelező.');
      return;
    }
    if (name.length > this.groupNameMaxLength) {
      this.errorMessage.set('A csoport neve legfeljebb ' + this.groupNameMaxLength + ' karakter lehet.');
      return;
    }
    if (description.length > this.groupDescriptionMaxLength) {
      this.errorMessage.set('A leírás legfeljebb ' + this.groupDescriptionMaxLength + ' karakter lehet.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      await this.groupService.updateGroup(this.groupId, {
        name,
        description,
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
    let nextValue: string | number | null = value;

    if (field === 'name' && typeof nextValue === 'string') {
      nextValue = nextValue.slice(0, this.groupNameMaxLength);
    }
    if (field === 'description' && typeof nextValue === 'string') {
      nextValue = nextValue.slice(0, this.groupDescriptionMaxLength);
    }

    this.editGroupForm.update((form) => ({ ...form, [field]: nextValue }));
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
      return 'role-badge role-badge--owner';
    if (member.isAdmin) return 'role-badge role-badge--admin';
    return 'role-badge role-badge--member';
  }

  getInviteStatusLabel(invite: GroupInvite): string {
    switch (invite.status) {
      case 'pending':
        return 'Függőben';
      case 'accepted':
        return 'Elfogadva';
      case 'declined':
        return 'Elutasítva';
      case 'revoked':
        return 'Visszavonva';
      default:
        return 'Ismeretlen';
    }
  }

  getInviteStatusClass(invite: GroupInvite): string {
    switch (invite.status) {
      case 'pending':
        return 'bg-white/10 text-white border-white/10';
      case 'accepted':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'declined':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'revoked':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-white/10 text-gray-300 border-white/10';
    }
  }

  async revokeInvite(invite: GroupInvite) {
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      await this.groupService.revokeGroupInvite(this.groupId, invite.id);
      this.successMessage.set(`${invite.targetUserName || 'Felhasználó'} meghívója visszavonva.`);
    } catch (error: any) {
      console.error('Revoke invite error:', error);
      this.errorMessage.set('Hiba történt a meghívó visszavonásakor.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onLeaveGroup() {
    const group = this.group();
    const user = this.authService.currentUser();
    if (!group || !user || !this.isMember()) return;

    if (group.ownerId === user.uid) {
      await this.modalService.alert(
        `A csoport tulajdonosa nem léphet ki.\nElőbb add át a tulajdonjogot, vagy töröld a csoportot.`,
        'Nem lehetséges',
        'warning',
      );
      return;
    }

    const confirmed = await this.modalService.confirm(
      'Biztosan kilépsz a csoportból? Ezután nem láthatod az eseményeket.',
      'Kilépés',
    );
    if (!confirmed) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      await this.groupService.leaveGroup(this.groupId);
      await this.modalService.alert('Sikeresen kiléptél a csoportból.', 'Kész', 'success');
      await this.router.navigate(['/groups']);
    } catch (error: any) {
      console.error('Error leaving group:', error);
      this.errorMessage.set(error?.message || 'Hiba történt a kilépés során.');
    } finally {
      this.isSubmitting.set(false);
    }
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
