import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { Inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-landing-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
})
export class LandingPage {
  protected authService = inject(AuthService);

  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {
    this.setSeoMeta();
  }

  scrollToHowItWorks() {
    const element = document.getElementById('how-it-works');
    const mainContent = document.querySelector('.main-content');
    if (element && mainContent) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = mainContent.getBoundingClientRect();
      const scrollTarget = mainContent.scrollTop + (elementRect.top - containerRect.top);

      mainContent.scrollTo({
        top: scrollTarget,
        behavior: 'smooth',
      });
    }
  }

  private setSeoMeta() {
    const origin = this.document?.location?.origin ?? '';
    const canonicalBase = 'https://bemyteammate.eu';
    const canonicalUrl = `${canonicalBase}/`;
    const imageUrl = origin
      ? `${origin}/assets/images/soccer-349821_640.jpg`
      : `${canonicalBase}/assets/images/soccer-349821_640.jpg`;

    const title = 'BeMyTeamMate – Fair csapatok, gyors szervezés';
    const description =
      'Kiegyensúlyozott csapatok másodpercek alatt, eseménykezelés, statisztikák és közösségi élmény egy helyen.';

    this.title.setTitle(title);

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.meta.updateTag({
      name: 'keywords',
      content:
        'csapatgenerátor, fociszervezés, amatőr sport, eseménykezelés, statisztikák, baráti foci',
    });

    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:locale', content: 'hu_HU' });
    this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });

    this.meta.removeTag(`name='twitter:card'`);
    this.meta.removeTag(`name='twitter:title'`);
    this.meta.removeTag(`name='twitter:description'`);
    this.meta.removeTag(`name='twitter:image'`);

    this.setCanonicalUrl(canonicalUrl);
    this.setPreloadImage(imageUrl);
    this.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'BeMyTeamMate',
      url: canonicalUrl,
      description,
      inLanguage: 'hu-HU',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${canonicalBase}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    });
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

  private setPreloadImage(url: string) {
    if (!this.document?.head) return;
    let link = this.document.querySelector('link[rel="preload"][as="image"]') as
      | HTMLLinkElement
      | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'preload');
      link.setAttribute('as', 'image');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setJsonLd(data: Record<string, unknown>) {
    if (!this.document?.head) return;
    let script = this.document.getElementById('ld-json-landing');
    if (!script) {
      script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('id', 'ld-json-landing');
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }
}
