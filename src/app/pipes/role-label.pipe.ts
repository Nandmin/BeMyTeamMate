import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'roleLabel',
  standalone: true,
})
export class RoleLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const normalized = value.toString().trim().toLowerCase();
    if (normalized === 'user' || normalized === 'member') return '';
    return value;
  }
}
