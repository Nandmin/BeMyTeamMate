import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

type PageMeta = {
  title: string;
  description: string;
  path: string;
  imagePath?: string;
  noindex?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly canonicalBase = 'https://bemyteammate.eu';
  private readonly defaultImagePath = '/assets/images/soccer-349821_640.jpg';

  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  setPageMeta({ title, description, path, imagePath, noindex }: PageMeta) {
    const canonicalUrl = this.buildCanonicalUrl(path);
    const imageUrl = this.buildImageUrl(imagePath);

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow',
    });

    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:locale', content: 'hu_HU' });
    this.meta.updateTag({ property: 'og:site_name', content: 'BeMyTeamMate' });
    this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });

    this.removeTwitterMeta();
    this.setCanonicalUrl(canonicalUrl);
  }

  private buildCanonicalUrl(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.canonicalBase}${normalized}`;
  }

  private buildImageUrl(imagePath?: string): string {
    if (imagePath?.startsWith('http')) return imagePath;
    const normalized = imagePath ? (imagePath.startsWith('/') ? imagePath : `/${imagePath}`) : this.defaultImagePath;
    return `${this.canonicalBase}${normalized}`;
  }

  private setCanonicalUrl(url: string) {
    if (!this.document?.head) return;
    let link = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private removeTwitterMeta() {
    this.meta.removeTag(`name='twitter:card'`);
    this.meta.removeTag(`name='twitter:title'`);
    this.meta.removeTag(`name='twitter:description'`);
    this.meta.removeTag(`name='twitter:image'`);
  }
}
