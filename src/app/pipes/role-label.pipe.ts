import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'roleLabel',
  standalone: true,
})
export class RoleLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return 'Csapattag';
    const normalized = value.toString().trim().toLowerCase();
    if (normalized === 'user' || normalized === 'member' || normalized === 'tag') return 'Csapattag';
    if (normalized === 'admin') return 'Admin';
    if (normalized === 'csapatkapitany') return 'Csapatkapitány';
    return value;
  }
}
