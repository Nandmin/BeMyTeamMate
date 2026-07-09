import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { PaymentRecord, PaymentService } from '../../services/payment.service';

type MyBalancePayment = PaymentRecord & {
  groupName: string;
  eventTitle: string | null | undefined;
};

@Component({
  selector: 'app-my-balance',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './my-balance.component.html',
  styleUrl: './my-balance.component.scss',
})
export class MyBalanceComponent {
  private paymentService = inject(PaymentService);
  private authService = inject(AuthService);
  protected readonly languageService = inject(LanguageService);

  user = this.authService.currentUser;
  overviews = toSignal(this.paymentService.getCurrentUserOverview(), { initialValue: [] });
  rows = computed(() =>
    this.overviews()
      .flatMap((overview) =>
        overview.rows.map((row) => ({
          ...row,
          groupName: overview.groupName,
        }))
      )
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
  );
  payments = computed<MyBalancePayment[]>(() =>
    this.overviews()
      .flatMap((overview) => {
        const eventTitleById = new Map(
          overview.events.map((event) => [
            event.id,
            event.title || this.languageService.t('common.event.defaultName'),
          ])
        );

        return overview.payments.map((payment) => ({
          ...payment,
          groupName: overview.groupName,
          eventTitle: payment.eventId ? eventTitleById.get(payment.eventId) : null,
        }));
      })
      .sort((a, b) => this.toDate(b.paidAt).getTime() - this.toDate(a.paidAt).getTime())
  );
  totalRequired = computed(() => this.rows().reduce((sum, row) => sum + row.requiredAmount, 0));
  totalPaid = computed(() => this.payments().reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  balance = computed(() => this.totalPaid() - this.totalRequired());

  statusText = computed(() => {
    if (this.balance() >= 0) return this.languageService.t('myBalance.status.noDebt');
    if (this.totalPaid() > 0) return this.languageService.t('myBalance.status.partial');
    return this.languageService.t('myBalance.status.outstanding');
  });

  formatMoney(value: number): string {
    return this.paymentService.formatMoney(value);
  }

  statusLabel(status: 'paid' | 'partial' | 'unpaid'): string {
    return this.paymentService.statusLabel(status);
  }

  methodLabel(method: any): string {
    return this.paymentService.methodLabel(method);
  }

  formatDate(value: any): string {
    const date = this.toDate(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString(this.languageService.currentLanguage() === 'en' ? 'en-US' : 'hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  statusClass(status: 'paid' | 'partial' | 'unpaid'): string {
    if (status === 'paid') return 'my-balance-status my-balance-status--paid';
    if (status === 'partial') return 'my-balance-status my-balance-status--partial';
    return 'my-balance-status my-balance-status--unpaid';
  }

  private toDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }
}
