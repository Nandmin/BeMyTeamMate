export type CanonicalGroupMemberRole = 'captain' | 'admin' | 'member';

function normalizeRoleValue(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeGroupMemberRole(
  value: string | null | undefined,
  isAdmin = false,
): CanonicalGroupMemberRole {
  const normalized = normalizeRoleValue(value);

  if (
    normalized === 'captain' ||
    normalized === 'owner' ||
    normalized === 'groupowner' ||
    normalized === 'csapatkapitany'
  ) {
    return 'captain';
  }

  if (normalized === 'admin' || normalized === 'administrator') {
    return 'admin';
  }

  if (
    normalized === 'member' ||
    normalized === 'user' ||
    normalized === 'tag' ||
    normalized === 'csapattag'
  ) {
    return 'member';
  }

  return isAdmin ? 'admin' : 'member';
}

export function getStoredGroupMemberRole(role: CanonicalGroupMemberRole): string {
  return role;
}

export function isElevatedGroupMemberRole(
  value: string | null | undefined,
  isAdmin = false,
): boolean {
  const role = normalizeGroupMemberRole(value, isAdmin);
  return isAdmin || role === 'captain' || role === 'admin';
}
