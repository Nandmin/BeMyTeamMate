import { Component, computed, inject } from '@angular/core';
import { AnalyticsService } from '../../services/analytics.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cookie-consent.html',
  styleUrl: './cookie-consent.scss',
})
export class CookieConsentComponent {
  private analyticsService = inject(AnalyticsService);
  protected showBanner = computed(() => this.analyticsService.consent() === 'unknown');

  accept() {
    this.analyticsService.grantConsent();
  }

  decline() {
    this.analyticsService.denyConsent();
  }
}
