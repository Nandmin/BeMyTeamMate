import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoverImageEntry } from '../../services/cover-images.service';

@Component({
  selector: 'app-cover-image-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cover-image-selector.component.html',
  styleUrl: './cover-image-selector.component.scss',
})
export class CoverImageSelectorComponent {
  @Input() show = false;
  @Input() images: CoverImageEntry[] = [];
  @Input() selectedImage: number | string | null = null;
  @Input() disabled = false;
  @Input() offsetTopClass = '';

  @Output() close = new EventEmitter<void>();
  @Output() select = new EventEmitter<number>();

  onBackdropClick() {
    this.close.emit();
  }

  onSelect(imageId: number) {
    if (this.disabled) return;
    this.select.emit(imageId);
  }
}
