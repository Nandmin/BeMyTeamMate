import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppCheck } from '@angular/fire/app-check';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { SeoService } from '../../services/seo.service';
import { LanguageService } from '../../services/language.service';
import { getAppCheckTokenOrNull } from '../../utils/app-check.util';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
})
export class ContactPage implements AfterViewInit, OnDestroy {
  private authService = inject(AuthService);
  private appCheck = inject(AppCheck, { optional: true });
  private fb = inject(FormBuilder);
  private seo = inject(SeoService);
  protected readonly languageService = inject(LanguageService);

  @ViewChild('turnstileContainer', { static: false })
  turnstileContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('turnstileShell', { static: false })
  turnstileShell?: ElementRef<HTMLDivElement>;

  contactForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
    honeypot: [''],
  });

  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  turnstileToken = signal('');
  turnstileError = signal('');

  private turnstileWidgetId: string | null = null;
  private resizeObserver?: ResizeObserver;
  private readonly turnstileBaseWidth = 300;
  private readonly turnstileBaseHeight = 65;
  private readonly onWindowResize = () => this.updateTurnstileScale();
  private readonly cooldownMs = 60 * 1000;
  private readonly cooldownKey = 'contact:lastSentAt';

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('contact.meta.title'),
        description: this.languageService.t('contact.meta.description'),
        path: '/contact',
        noindex: true,
      });
    });
  }

  ngAfterViewInit() {
    this.loadTurnstile();
  }

  ngOnDestroy() {
    this.cleanupTurnstileScaling();
  }

  get messageCount() {
    const value = this.contactForm.get('message')?.value || '';
    return typeof value === 'string' ? value.length : 0;
  }

  async onSubmit() {
    if (this.isLoading()) return;
    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.isTurnstileConfigured()) {
      this.errorMessage.set(this.languageService.t('contact.error.captchaMissing'));
      return;
    }

    if (this.isRateLimited()) {
      this.errorMessage.set(this.languageService.t('contact.error.rateLimited'));
      return;
    }

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const honeypot = this.contactForm.get('honeypot')?.value || '';
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      this.successMessage.set(this.languageService.t('contact.success.recorded'));
      this.contactForm.reset();
      return;
    }

    const token = this.turnstileToken();
    if (!token) {
      this.errorMessage.set(this.languageService.t('contact.error.robotCheck'));
      return;
    }

    const message = String(this.contactForm.get('message')?.value || '').trim();
    const contactEmail = String(this.contactForm.get('email')?.value || '').trim();

    if (!this.isWorkerConfigured()) {
      this.errorMessage.set(this.languageService.t('contact.error.endpointMissing'));
      return;
    }

    const payload = {
      message,
      contactEmail,
      honeypot,
      turnstileToken: token,
    };

    this.isLoading.set(true);

    try {
      const user = this.authService.currentUser();
      if (!user) {
        throw new Error(this.languageService.t('common.error.authRequired'));
      }

      let authToken = '';
      try {
        authToken = await user.getIdToken();
      } catch {}

      const appCheckToken = await getAppCheckTokenOrNull(this.appCheck);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      const response = await fetch(environment.contactWorkerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || this.languageService.t('contact.error.sendFailedDetail'));
      }

      this.successMessage.set(this.languageService.t('contact.success.recordedWithBang'));
      this.contactForm.reset();
      this.turnstileToken.set('');
      this.storeCooldown();
      this.resetTurnstile();
    } catch (error: any) {
      console.error('Contact submit failed:', error);
      this.errorMessage.set(this.languageService.t('contact.error.sendFailed'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private isWorkerConfigured() {
    const url = environment.contactWorkerUrl || '';
    if (!url) return false;
    return !url.includes('your-worker.workers.dev');
  }

  private isTurnstileConfigured() {
    return Boolean(environment.turnstileSiteKey);
  }

  private isRateLimited() {
    try {
      const raw = window.localStorage.getItem(this.cooldownKey);
      if (!raw) return false;
      const last = Number(raw);
      if (!Number.isFinite(last)) return false;
      return Date.now() - last < this.cooldownMs;
    } catch {
      return false;
    }
  }

  private storeCooldown() {
    try {
      window.localStorage.setItem(this.cooldownKey, String(Date.now()));
    } catch {
      // Ignore storage issues.
    }
  }

  private loadTurnstile() {
    if (!this.isTurnstileConfigured()) {
      this.turnstileError.set(this.languageService.t('contact.error.turnstileSiteKeyMissing'));
      return;
    }

    const renderWidget = () => {
      if (!this.turnstileContainer?.nativeElement) return;
      if (!(window as any).turnstile) return;
      this.turnstileWidgetId = (window as any).turnstile.render(
        this.turnstileContainer.nativeElement,
        {
          sitekey: environment.turnstileSiteKey,
          theme: 'auto',
          callback: (token: string) => this.turnstileToken.set(token),
          'expired-callback': () => this.turnstileToken.set(''),
          'error-callback': () => this.turnstileToken.set(''),
        }
      );
      this.initializeTurnstileScaling();
    };

    if (document.getElementById('cf-turnstile-script')) {
      renderWidget();
      return;
    }

    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    script.onerror = () => {
      this.turnstileError.set(this.languageService.t('contact.error.turnstileLoadFailed'));
    };
    document.head.appendChild(script);
  }

  private resetTurnstile() {
    if (this.turnstileWidgetId && (window as any).turnstile) {
      (window as any).turnstile.reset(this.turnstileWidgetId);
    }
  }

  private initializeTurnstileScaling() {
    const shell = this.turnstileShell?.nativeElement;
    if (!shell) return;

    this.cleanupTurnstileScaling();
    this.updateTurnstileScale();
    requestAnimationFrame(() => this.updateTurnstileScale());

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.updateTurnstileScale());
      this.resizeObserver.observe(shell);
      return;
    }

    window.addEventListener('resize', this.onWindowResize, { passive: true });
  }

  private cleanupTurnstileScaling() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
    window.removeEventListener('resize', this.onWindowResize);
  }

  private updateTurnstileScale() {
    const shell = this.turnstileShell?.nativeElement;
    if (!shell) return;

    const availableWidth = shell.clientWidth;
    if (!availableWidth) return;

    const scale = Math.min(1, availableWidth / this.turnstileBaseWidth);
    shell.style.setProperty('--turnstile-scale', scale.toString());
    shell.style.setProperty('--turnstile-height', `${this.turnstileBaseHeight * scale}px`);
  }
}
