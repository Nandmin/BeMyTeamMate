import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../services/language.service';
import { normalizeGroupMemberRole } from '../utils/group-member-role';

@Pipe({
  name: 'roleLabel',
  standalone: true,
  pure: false,
})
export class RoleLabelPipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(value: string | null | undefined, isAdmin = false): string {
    const role = normalizeGroupMemberRole(value, isAdmin);

    switch (role) {
      case 'captain':
        return this.languageService.t('common.roles.captain');
      case 'admin':
        return this.languageService.t('common.roles.admin');
      case 'member':
      default:
        return this.languageService.t('common.roles.member');
    }
  }
}
