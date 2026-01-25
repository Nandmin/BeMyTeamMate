import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cover-image-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cover-image-selector.component.html',
  styleUrl: './cover-image-selector.component.scss',
})
export class CoverImageSelectorComponent {
  @Input() show = false;
  @Input() images: string[] = [];
  @Input() selectedImage: string | null = null;
  @Input() disabled = false;
  @Input() offsetTopClass = '';

  @Output() close = new EventEmitter<void>();
  @Output() select = new EventEmitter<string>();

  onBackdropClick() {
    this.close.emit();
  }

  onSelect(imagePath: string) {
    if (this.disabled) return;
    this.select.emit(imagePath);
  }
}
