import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppCheck } from '@angular/fire/app-check';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { SeoService } from '../../services/seo.service';
import { getAppCheckTokenOrNull } from '../../utils/app-check.util';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
})
export class ContactPage implements AfterViewInit {
  private authService = inject(AuthService);
  private appCheck = inject(AppCheck, { optional: true });
  private fb = inject(FormBuilder);
  private seo = inject(SeoService);

  @ViewChild('turnstileContainer', { static: false })
  turnstileContainer?: ElementRef<HTMLDivElement>;

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
  private readonly cooldownMs = 60 * 1000;
  private readonly cooldownKey = 'contact:lastSentAt';

  constructor() {
    this.seo.setPageMeta({
      title: 'Kapcsolat – BeMyTeamMate',
      description: 'Vedd fel velünk a kapcsolatot, és írj üzenetet a csapatnak.',
      path: '/contact',
      noindex: true,
    });
  }

  ngAfterViewInit() {
    this.loadTurnstile();
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
      this.errorMessage.set('A captcha nincs beállítva. Kérlek, próbáld meg később.');
      return;
    }

    if (this.isRateLimited()) {
      this.errorMessage.set('Túlléptél az adott időszak alatt küldhető üzenetek számán.');
      return;
    }

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const honeypot = this.contactForm.get('honeypot')?.value || '';
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      this.successMessage.set('Köszönjük, az üzenetet rögzítettük.');
      this.contactForm.reset();
      return;
    }

    const token = this.turnstileToken();
    if (!token) {
      this.errorMessage.set('Kérlek igazold, hogy nem vagy robot!');
      return;
    }

    const message = String(this.contactForm.get('message')?.value || '').trim();
    const contactEmail = String(this.contactForm.get('email')?.value || '').trim();

    if (!this.isWorkerConfigured()) {
      this.errorMessage.set('A kapcsolat endpoint nincs beállítva.');
      return;
    }

    const user = this.authService.currentUser();

    const payload = {
      message,
      contactEmail,
      honeypot,
      turnstileToken: token,
      user: user
        ? {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
          }
        : null,
    };

    this.isLoading.set(true);

    try {
      const appCheckToken = await getAppCheckTokenOrNull(this.appCheck);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
        throw new Error(detail || 'Az üzenet küldése sikertelen!');
      }

      this.successMessage.set('Köszönjük, az üzenetet rögzítettük!');
      this.contactForm.reset();
      this.turnstileToken.set('');
      this.storeCooldown();
      this.resetTurnstile();
    } catch (error: any) {
      console.error('Contact submit failed:', error);
      this.errorMessage.set('Sikertelen üzenetküldés! Kérlek, próbáld újra!');
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
      this.turnstileError.set('Turnstile site key nincs beállítva.');
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
      this.turnstileError.set('Nem sikerült betölteni a captchat.');
    };
    document.head.appendChild(script);
  }

  private resetTurnstile() {
    if (this.turnstileWidgetId && (window as any).turnstile) {
      (window as any).turnstile.reset(this.turnstileWidgetId);
    }
  }
}
