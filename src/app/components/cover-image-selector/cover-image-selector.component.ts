import {
  Component,
  EventEmitter,
  inject,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationKey } from '../../i18n/translations';
import { CoverImageEntry } from '../../services/cover-images.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-cover-image-selector',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './cover-image-selector.component.html',
  styleUrl: './cover-image-selector.component.scss',
})
export class CoverImageSelectorComponent implements OnChanges {
  private readonly languageService = inject(LanguageService);

  @Input() show = false;
  @Input() images: CoverImageEntry[] = [];
  @Input() selectedImage: number | string | null = null;
  @Input() disabled = false;
  @Input() offsetTopClass = '';

  @Output() close = new EventEmitter<void>();
  @Output() select = new EventEmitter<number>();

  selectedTag = '';
  availableTags: string[] = [];
  private readonly desktopPageSize = 12;
  private readonly mobilePageSize = 4;
  currentPage = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['images']) {
      this.availableTags = this.buildTags(this.images);
      if (this.selectedTag && !this.availableTags.includes(this.selectedTag)) {
        this.selectedTag = '';
        this.currentPage = 0;
      }
      this.ensurePageInRange();
    }

    if (changes['show']?.currentValue === true) {
      this.selectedTag = '';
      this.currentPage = 0;
    }
  }

  get filteredImages(): CoverImageEntry[] {
    if (!this.selectedTag) return this.images;
    return this.images.filter((image) => image.tag === this.selectedTag);
  }

  get totalPages(): number {
    const pages = Math.ceil(this.filteredImages.length / this.pageSize);
    return Math.max(1, pages);
  }

  get pagedImages(): CoverImageEntry[] {
    const start = this.currentPage * this.pageSize;
    return this.filteredImages.slice(start, start + this.pageSize);
  }

  private get pageSize(): number {
    if (typeof window !== 'undefined' && window.innerWidth < 530) {
      return this.mobilePageSize;
    }
    return this.desktopPageSize;
  }

  get canGoPrev(): boolean {
    return this.currentPage > 0;
  }

  get canGoNext(): boolean {
    return this.currentPage < this.totalPages - 1;
  }

  getTagLabel(tag: string): string {
    const key = this.getTagTranslationKey(tag);
    return key ? this.languageService.t(key) : tag;
  }

  onTagChange(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    this.selectedTag = value;
    this.currentPage = 0;
  }

  onBackdropClick() {
    this.close.emit();
  }

  onSelect(imageId: number) {
    if (this.disabled) return;
    this.select.emit(imageId);
  }

  goPrevPage() {
    if (!this.canGoPrev) return;
    this.currentPage -= 1;
  }

  goNextPage() {
    if (!this.canGoNext) return;
    this.currentPage += 1;
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.ensurePageInRange();
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

  private ensurePageInRange() {
    const maxPageIndex = Math.max(0, this.totalPages - 1);
    if (this.currentPage > maxPageIndex) {
      this.currentPage = maxPageIndex;
    }
  }

  private getTagTranslationKey(tag: string): TranslationKey | null {
    const normalized = tag
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    switch (normalized) {
      case 'vegyes':
        return 'coverImageSelector.tags.mixed';
      case 'foci':
      case 'soccer':
      case 'football':
        return 'createEvent.sport.soccer';
      case 'kosarlabda':
      case 'basketball':
        return 'createEvent.sport.basketball';
      case 'jegkorong':
      case 'hockey':
        return 'createEvent.sport.hockey';
      case 'tenisz':
      case 'tennis':
        return 'createEvent.sport.tennis';
      case 'amerikai foci':
      case 'american football':
        return 'coverImageSelector.tags.americanFootball';
      case 'tollaslabda':
      case 'badminton':
        return 'coverImageSelector.tags.badminton';
      case 'pingpong':
      case 'table tennis':
        return 'coverImageSelector.tags.tableTennis';
      default:
        return null;
    }
  }
}
