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
  readonly isNativeWebView = signal(false);

  constructor(router: Router) {
    this.router = router;
    this.isNativeWebView.set(this.detectNativeWebView());
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
    if (this.isNativeWebView()) {
      this.setConsent('granted');
    }
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
      const payload = JSON.stringify({ state, day: this.currentDayKey() });
      window.localStorage.setItem(CONSENT_STORAGE_KEY, payload);
    }
  }

  private restoreConsent() {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { state?: ConsentState; day?: string };
      const state = parsed.state;
      const day = parsed.day;
      if ((state === 'granted' || state === 'denied') && typeof day === 'string') {
        if (day === this.currentDayKey()) {
          this.consent.set(state);
          return;
        }
      }
    } catch {
      const legacy = stored as ConsentState;
      if (legacy === 'granted' || legacy === 'denied') {
        this.consent.set(legacy);
        return;
      }
    }
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  }

  private currentDayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
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

  private detectNativeWebView() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const w = window as any;
    if (w.__BMT_NATIVE_APP === true) return true;
    const ua = navigator.userAgent?.toLowerCase?.() ?? '';
    return ua.includes('dotnetmaui') || ua.includes('maui');
  }

  isNativeApp() {
    return this.isNativeWebView();
  }
}
