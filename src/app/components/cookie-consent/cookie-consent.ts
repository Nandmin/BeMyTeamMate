import { Component, computed, inject } from '@angular/core';
import { AnalyticsService } from '../../services/analytics.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './cookie-consent.html',
  styleUrl: './cookie-consent.scss',
})
export class CookieConsentComponent {
  private analyticsService = inject(AnalyticsService);
  protected showBanner = computed(
    () => this.analyticsService.consent() === 'unknown' && !this.analyticsService.isNativeApp()
  );

  accept() {
    this.analyticsService.grantConsent();
  }

  decline() {
    this.analyticsService.denyConsent();
  }
}
