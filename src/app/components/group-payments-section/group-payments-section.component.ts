import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import {
  PaymentAuditLog,
  PaymentFilters,
  PaymentLedgerRow,
  PaymentMethod,
  PaymentService,
} from '../../services/payment.service';

@Component({
  selector: 'app-group-payments-section',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './group-payments-section.component.html',
  styleUrl: './group-payments-section.component.scss',
})
export class GroupPaymentsSectionComponent {
  private paymentService = inject(PaymentService);
  protected readonly languageService = inject(LanguageService);

  groupId = input.required<string>();

  today = new Date().toISOString().split('T')[0];
  isSubmitting = signal(false);
  message = signal('');
  error = signal('');
  filters = signal<PaymentFilters>({
    eventId: 'all',
    userId: 'all',
    period: 'all',
  });
  appliedFilters = signal<PaymentFilters>({
    eventId: 'all',
    userId: 'all',
    period: 'all',
  });
  selectedBookkeepingEventId = signal('');
  selectedBookkeepingUserId = signal('');
  paymentForms = signal<
    Record<
      string,
      {
        amount: number | '';
        method: PaymentMethod;
        paidAt: string;
        note: string;
      }
    >
  >({});

  overview = toSignal(
    toObservable(this.groupId).pipe(
      switchMap((groupId) => this.paymentService.getGroupPaymentOverview(groupId))
    ),
    {
      initialValue: {
        rows: [],
        summaries: [],
        payments: [],
        auditLogs: [],
        events: [],
        members: [],
      },
    }
  );

  paidEvents = computed(() =>
    this.overview()
      .events.filter((event) => event.payment?.enabled)
      .sort((a, b) => this.toDate(b.date).getTime() - this.toDate(a.date).getTime())
  );

  filteredRows = computed(() =>
    this.paymentService.applyFilters(this.overview().rows, this.appliedFilters())
  );

  bookkeepingRows = computed(() =>
    this.overview()
      .rows.filter((row) => {
        if (this.selectedBookkeepingEventId() && row.eventId !== this.selectedBookkeepingEventId()) {
          return false;
        }
        if (this.selectedBookkeepingUserId() && row.userId !== this.selectedBookkeepingUserId()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.userName.localeCompare(b.userName, this.currentLocale()))
  );

  bookkeepingOpenRows = computed(() =>
    this.overview()
      .rows.filter((row) => row.requiredAmount > row.paidAmount)
      .sort((a, b) => this.startOfDay(b.eventDate).getTime() - this.startOfDay(a.eventDate).getTime())
  );

  bookkeepingEvents = computed(() => {
    const selectedUserId = this.selectedBookkeepingUserId();
    const selectedEventId = this.selectedBookkeepingEventId();
    const sourceRows = selectedUserId ? this.bookkeepingOpenRows() : this.overview().rows;
    const visibleRows = sourceRows.filter((row) => !selectedEventId || row.eventId === selectedEventId);
    const eventIds = new Set(visibleRows.map((row) => row.eventId));

    return this.paidEvents().filter((event) => !!event.id && eventIds.has(event.id));
  });

  bookkeepingSelectableUsers = computed(() => {
    const selectedEventId = this.selectedBookkeepingEventId();
    const sourceRows = selectedEventId
      ? this.overview().rows.filter((row) => row.eventId === selectedEventId)
      : this.bookkeepingOpenRows();

    const seen = new Set<string>();
    return sourceRows
      .filter((row) => {
        if (seen.has(row.userId)) return false;
        seen.add(row.userId);
        return true;
      })
      .map((row) => ({
        userId: row.userId,
        userName: row.userName,
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName, this.currentLocale()));
  });

  bookkeepingUsers = computed(() => this.bookkeepingSelectableUsers());

  selectedBookkeepingRow = computed(
    () =>
      this.overview().rows.find(
        (row) =>
          row.eventId === this.selectedBookkeepingEventId() &&
          row.userId === this.selectedBookkeepingUserId()
      ) || null
  );

  filteredSummary = computed(() => {
    const rows = this.filteredRows();
    const paidByUser = new Map<string, number>();
    for (const row of rows) {
      paidByUser.set(row.userId, (paidByUser.get(row.userId) || 0) + row.paidAmount);
    }

    const requiredByUser = new Map<string, number>();
    for (const row of rows) {
      requiredByUser.set(row.userId, (requiredByUser.get(row.userId) || 0) + row.requiredAmount);
    }

    const userIds = new Set([...paidByUser.keys(), ...requiredByUser.keys()]);
    return Array.from(userIds)
      .map((userId) => {
        const member = this.overview().members.find((item) => item.userId === userId);
        const requiredAmount = requiredByUser.get(userId) || 0;
        const paidAmount = paidByUser.get(userId) || 0;
        return {
          userId,
          userName: member?.name || rows.find((row) => row.userId === userId)?.userName || userId,
          requiredAmount,
          paidAmount,
          balance: paidAmount - requiredAmount,
          status: this.statusFor(requiredAmount, paidAmount),
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName, this.currentLocale()));
  });

  paymentMethods = this.paymentService.paymentMethods;
  periodOptions: Array<{ id: PaymentFilters['period']; labelKey: string }> = [
    { id: 'all', labelKey: 'payments.filters.period.all' },
    { id: 'week', labelKey: 'payments.filters.period.week' },
    { id: 'month', labelKey: 'payments.filters.period.month' },
    { id: 'year', labelKey: 'payments.filters.period.year' },
  ];

  setFilter<K extends keyof PaymentFilters>(key: K, value: PaymentFilters[K]) {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
  }

  applyCurrentFilters() {
    this.appliedFilters.set({ ...this.filters() });
  }

  selectBookkeepingEvent(eventId: string) {
    this.selectedBookkeepingEventId.set(eventId);
    if (
      this.selectedBookkeepingUserId() &&
      eventId &&
      !this.overview().rows.some(
        (row) => row.eventId === eventId && row.userId === this.selectedBookkeepingUserId()
      )
    ) {
      this.selectedBookkeepingUserId.set('');
    }
    this.error.set('');
    this.message.set('');
    this.paymentForms.set({});
  }

  selectBookkeepingUser(userId: string) {
    this.selectedBookkeepingUserId.set(userId);
    if (
      this.selectedBookkeepingEventId() &&
      userId &&
      !this.overview().rows.some(
        (row) => row.eventId === this.selectedBookkeepingEventId() && row.userId === userId
      )
    ) {
      this.selectedBookkeepingEventId.set('');
    }
    this.error.set('');
    this.message.set('');
  }

  rowPaymentForm(userId: string, eventId: string) {
    return (
      this.paymentForms()[this.formKey(userId, eventId)] || {
        amount: 0,
        method: 'cash' as PaymentMethod,
        paidAt: '',
        note: '',
      }
    );
  }

  updateRowPaymentForm(
    row: PaymentLedgerRow,
    field: 'amount' | 'method' | 'paidAt' | 'note',
    value: string | number
  ) {
    const key = this.formKey(row.userId, row.eventId);
    const current = this.rowPaymentForm(row.userId, row.eventId);
    this.paymentForms.update((forms) => ({
      ...forms,
      [key]: {
        ...current,
        [field]: field === 'amount' ? (value === '' ? '' : Number(value)) : value,
      },
    }));
  }

  isRowPaymentValid(row: PaymentLedgerRow): boolean {
    const form = this.rowPaymentForm(row.userId, row.eventId);
    const amount = Number(form.amount || 0);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const hasDate = !!form.paidAt;

    if (!hasAmount && !hasDate) return false;
    if (hasAmount !== hasDate) return false;

    const paidAt = this.parseDate(form.paidAt);
    if (!paidAt) return false;

    const paymentDate = this.startOfDay(paidAt);
    const eventDate = this.startOfDay(row.eventDate);
    const today = this.startOfDay(new Date());
    return paymentDate >= eventDate && paymentDate <= today;
  }

  async recordPaymentForRow(row: PaymentLedgerRow) {
    const form = this.rowPaymentForm(row.userId, row.eventId);
    const amount = Number(form.amount || 0);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const hasDate = !!form.paidAt;

    if (!hasAmount && !hasDate) {
      this.error.set(this.languageService.t('payments.record.errors.amountAndDateRequired'));
      return;
    }
    if (hasAmount !== hasDate) {
      this.error.set(this.languageService.t('payments.record.errors.amountAndDateTogether'));
      return;
    }

    const paidAt = this.parseDate(form.paidAt);
    if (!paidAt) {
      this.error.set(this.languageService.t('payments.record.errors.invalidDate'));
      return;
    }

    const paymentDate = this.startOfDay(paidAt);
    const eventDate = this.startOfDay(row.eventDate);
    const today = this.startOfDay(new Date());
    if (paymentDate < eventDate || paymentDate > today) {
      this.error.set(this.languageService.t('payments.record.errors.dateRange'));
      return;
    }

    this.isSubmitting.set(true);
    this.message.set('');
    this.error.set('');
    try {
      await this.paymentService.recordPayment(this.groupId(), {
        userId: row.userId,
        userName: row.userName,
        eventId: row.eventId,
        amount,
        method: form.method,
        paidAt,
        note: form.note,
      });
      this.message.set(this.languageService.t('payments.record.success.saved'));
      this.paymentForms.update((forms) => {
        const next = { ...forms };
        delete next[this.formKey(row.userId, row.eventId)];
        return next;
      });
    } catch (error: any) {
      this.error.set(error?.message || this.languageService.t('payments.record.errors.saveFailed'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  exportCsv() {
    const rows = this.filteredRows();
    if (!rows.length) return;
    const header = [
      this.languageService.t('payments.ledger.headers.event'),
      this.languageService.t('payments.ledger.headers.date'),
      this.languageService.t('payments.ledger.headers.dueDate'),
      this.languageService.t('payments.ledger.headers.name'),
      this.languageService.t('payments.ledger.headers.amountDue'),
      this.languageService.t('payments.ledger.headers.amountPaid'),
      this.languageService.t('payments.ledger.headers.balance'),
      this.languageService.t('payments.ledger.headers.status'),
    ];
    const body = rows.map((row) => [
      row.eventTitle,
      this.formatDate(row.eventDate),
      row.dueDate ? this.formatDate(row.dueDate) : '',
      row.userName,
      Math.round(row.requiredAmount),
      Math.round(row.paidAmount),
      Math.round(row.balance),
      this.statusLabel(row.status),
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    this.downloadBlob(
      new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }),
      this.languageService.t('payments.export.csvFile')
    );
  }

  async exportExcel() {
    const rows = this.filteredRows();
    if (!rows.length) return;
    const ExcelJS = (await import('exceljs/dist/exceljs.min.js')) as any;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(this.languageService.t('payments.export.sheet'), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: this.languageService.t('payments.ledger.headers.event'), key: 'eventTitle', width: 28 },
      { header: this.languageService.t('payments.ledger.headers.date'), key: 'eventDate', width: 12 },
      { header: this.languageService.t('payments.ledger.headers.dueDate'), key: 'dueDate', width: 12 },
      { header: this.languageService.t('payments.ledger.headers.name'), key: 'userName', width: 24 },
      { header: this.languageService.t('payments.ledger.headers.amountDue'), key: 'requiredAmount', width: 14 },
      { header: this.languageService.t('payments.ledger.headers.amountPaid'), key: 'paidAmount', width: 14 },
      { header: this.languageService.t('payments.ledger.headers.balance'), key: 'balance', width: 14 },
      { header: this.languageService.t('payments.ledger.headers.status'), key: 'status', width: 18 },
    ];
    sheet.addRows(
      rows.map((row) => ({
        eventTitle: row.eventTitle,
        eventDate: this.formatDate(row.eventDate),
        dueDate: row.dueDate ? this.formatDate(row.dueDate) : '',
        userName: row.userName,
        requiredAmount: Math.round(row.requiredAmount),
        paidAmount: Math.round(row.paidAmount),
        balance: Math.round(row.balance),
        status: this.statusLabel(row.status),
      }))
    );
    sheet.getRow(1).eachCell((cell: any) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    });
    const buffer = await workbook.xlsx.writeBuffer();
    this.downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      this.languageService.t('payments.export.xlsxFile')
    );
  }

  statusLabel(status: PaymentLedgerRow['status']): string {
    return this.paymentService.statusLabel(status);
  }

  methodLabel(method: PaymentMethod): string {
    return this.paymentService.methodLabel(method);
  }

  formatMoney(value: number): string {
    return this.paymentService.formatMoney(value);
  }

  formatDate(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) return '-';
    return value.toLocaleDateString(this.currentLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  toDateInputValue(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  statusClass(status: PaymentLedgerRow['status']): string {
    if (status === 'paid') return 'payment-status payment-status--paid';
    if (status === 'partial') return 'payment-status payment-status--partial';
    return 'payment-status payment-status--unpaid';
  }

  auditLogMessage(audit: PaymentAuditLog): string {
    return this.languageService.t('payments.audit.entryCreate', {
      actorName: audit.actorName,
      amount: this.formatMoney(audit.amount),
      targetUserName: audit.targetUserName,
      method: this.methodLabel(audit.method),
    });
  }

  private statusFor(requiredAmount: number, paidAmount: number) {
    if (requiredAmount <= 0 || paidAmount >= requiredAmount) return 'paid' as const;
    if (paidAmount > 0) return 'partial' as const;
    return 'unpaid' as const;
  }

  private parseDate(value: string): Date | null {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  private startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private formKey(userId: string, eventId: string): string {
    return `${eventId}::${userId}`;
  }

  toDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private currentLocale(): string {
    return this.languageService.currentLanguage() === 'en' ? 'en-US' : 'hu-HU';
  }
}
