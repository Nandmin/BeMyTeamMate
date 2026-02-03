import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoverImageEntry } from '../../services/cover-images.service';

@Component({
  selector: 'app-cover-image-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cover-image-selector.component.html',
  styleUrl: './cover-image-selector.component.scss',
})
export class CoverImageSelectorComponent implements OnChanges {
  @Input() show = false;
  @Input() images: CoverImageEntry[] = [];
  @Input() selectedImage: number | string | null = null;
  @Input() disabled = false;
  @Input() offsetTopClass = '';

  @Output() close = new EventEmitter<void>();
  @Output() select = new EventEmitter<number>();

  selectedTag = '';
  availableTags: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['images']) {
      this.availableTags = this.buildTags(this.images);
      if (this.selectedTag && !this.availableTags.includes(this.selectedTag)) {
        this.selectedTag = '';
      }
    }

    if (changes['show']?.currentValue === true) {
      this.selectedTag = '';
    }
  }

  get filteredImages(): CoverImageEntry[] {
    if (!this.selectedTag) return this.images;
    return this.images.filter((image) => image.tag === this.selectedTag);
  }

  onTagChange(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    this.selectedTag = value;
  }

  onBackdropClick() {
    this.close.emit();
  }

  onSelect(imageId: number) {
    if (this.disabled) return;
    this.select.emit(imageId);
  }

  private buildTags(images: CoverImageEntry[]): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const image of images) {
      const tag = typeof image?.tag === 'string' ? image.tag.trim() : '';
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
    return tags;
  }
}
