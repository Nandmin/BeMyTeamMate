import { Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';

type ConsentState = 'unknown' | 'granted' | 'denied';

const CONSENT_STORAGE_KEY = 'bmt_analytics_consent';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly measurementId = environment.firebase.measurementId;
  private readonly scriptId = 'ga-gtag';
  private readonly router: Router;
  private scriptLoaded = false;
  readonly consent = signal<ConsentState>('unknown');

  constructor(router: Router) {
    this.router = router;
    this.restoreConsent();
  }

  init() {
    if (!this.measurementId) return;

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.trackPageView(event.urlAfterRedirects);
      });

    this.loadGtag();
    this.applyConsent();
    if (this.consent() === 'granted') {
      this.trackPageView(this.router.url);
    }
  }

  grantConsent() {
    this.setConsent('granted');
    this.loadGtag();
    this.applyConsent();
    this.trackPageView(this.router.url);
  }

  denyConsent() {
    this.setConsent('denied');
    this.loadGtag();
    this.applyConsent();
  }

  private setConsent(state: ConsentState) {
    this.consent.set(state);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, state);
    }
  }

  private restoreConsent() {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY) as ConsentState | null;
    if (stored === 'granted' || stored === 'denied') {
      this.consent.set(stored);
    }
  }

  private loadGtag() {
    if (this.scriptLoaded || typeof window === 'undefined' || !this.measurementId) return;
    if (document.getElementById(this.scriptId)) {
      this.ensureGtag();
      this.scriptLoaded = true;
      return;
    }

    const script = document.createElement('script');
    script.id = this.scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
    document.head.appendChild(script);

    this.ensureGtag();
    const gtag = (window as any).gtag as ((...args: unknown[]) => void) | undefined;
    if (gtag && !(window as any).__bmtGtagConfigured) {
      gtag('js', new Date());
      gtag('config', this.measurementId, {
        anonymize_ip: true,
        send_page_view: false,
      });
      (window as any).__bmtGtagConfigured = true;
    }

    this.scriptLoaded = true;
  }

  private trackPageView(url: string) {
    if (this.consent() !== 'granted' || !this.scriptLoaded) return;
    const gtag = (window as any).gtag as ((...args: unknown[]) => void) | undefined;
    if (!gtag) return;
    gtag('event', 'page_view', {
      page_path: url,
      page_location: window.location.href,
      page_title: document.title,
    });
  }

  private ensureGtag() {
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    if (!w.gtag) {
      w.gtag = (...args: unknown[]) => {
        w.dataLayer.push(args);
      };
    }
  }

  private applyConsent() {
    if (typeof window === 'undefined') return;
    const gtag = (window as any).gtag as ((...args: unknown[]) => void) | undefined;
    if (!gtag) return;
    gtag('consent', 'update', {
      analytics_storage: this.consent() === 'granted' ? 'granted' : 'denied',
    });
  }
}
