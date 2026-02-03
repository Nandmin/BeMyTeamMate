import { Injectable } from '@angular/core';

export interface CoverImageEntry {
  id: number;
  src: string;
  tag: string;
}

interface CoverImagesPayload {
  images?: CoverImageEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class CoverImagesService {
  private cache: CoverImageEntry[] | null = null;
  private inFlight: Promise<CoverImageEntry[]> | null = null;
  private idToSrc = new Map<number, string>();
  private readonly defaultImageId = 0;
  private readonly defaultImageSrc =
    'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&q=80&w=800';

  async getCoverImages(): Promise<CoverImageEntry[]> {
    if (this.cache) return this.cache;
    if (this.inFlight) return this.inFlight;

    this.inFlight = fetch('assets/data/cover-images.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Cover images load failed (${response.status})`);
        }
        return response.json() as Promise<CoverImagesPayload>;
      })
      .then((payload) => {
        const images = Array.isArray(payload?.images) ? payload.images : [];
        const sanitized = images.filter(
          (item) =>
            typeof item?.id === 'number' &&
            typeof item?.src === 'string' &&
            typeof item?.tag === 'string',
        );
        this.cache = sanitized;
        this.idToSrc = new Map(sanitized.map((item) => [item.id, item.src]));
        return sanitized;
      })
      .catch((error) => {
        console.error('Cover images load error:', error);
        this.cache = [];
        return [];
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  async getImagePaths(tag?: string): Promise<string[]> {
    const images = await this.getCoverImages();
    const filtered = tag ? images.filter((image) => image.tag === tag) : images;
    return filtered.map((image) => image.src);
  }

  async getImageEntries(tag?: string): Promise<CoverImageEntry[]> {
    const images = await this.getCoverImages();
    return tag ? images.filter((image) => image.tag === tag) : images;
  }

  async getImageIds(tag?: string): Promise<number[]> {
    const images = await this.getCoverImages();
    const filtered = tag ? images.filter((image) => image.tag === tag) : images;
    return filtered.map((image) => image.id);
  }

  resolveImageSrc(imageIdOrSrc?: number | string | null): string | null {
    if (!imageIdOrSrc) return null;
    if (typeof imageIdOrSrc === 'number') {
      const mapped = this.idToSrc.get(imageIdOrSrc);
      if (mapped) return mapped;
      void this.getCoverImages();
      return null;
    }
    if (imageIdOrSrc.startsWith('http') || imageIdOrSrc.startsWith('assets/')) {
      return imageIdOrSrc;
    }
    const numericId = Number(imageIdOrSrc);
    if (Number.isFinite(numericId)) {
      const mapped = this.idToSrc.get(numericId);
      if (mapped) return mapped;
    }
    return null;
  }

  getDefaultImageSrc(): string {
    return this.resolveImageSrc(this.defaultImageId) || this.defaultImageSrc;
  }
}
