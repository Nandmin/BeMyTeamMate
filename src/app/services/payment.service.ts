import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  orderBy,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { EventService, SportEvent } from './event.service';
import { GroupMember, GroupService } from './group.service';
import { LanguageService } from './language.service';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'revolut' | 'other';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface PaymentRecord {
  id?: string;
  groupId: string;
  eventId?: string | null;
  userId: string;
  userName: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  paidAt: Timestamp;
  createdAt: any;
  createdBy: string;
  createdByName: string;
}

export interface PaymentAuditLog {
  id?: string;
  groupId: string;
  action: 'payment_create';
  paymentId?: string;
  targetUserId: string;
  targetUserName: string;
  eventId?: string | null;
  amount: number;
  method: PaymentMethod;
  actorId: string;
  actorName: string;
  createdAt: any;
}

export interface PaymentLedgerRow {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  dueDate: Date | null;
  userId: string;
  userName: string;
  requiredAmount: number;
  paidAmount: number;
  balance: number;
  status: PaymentStatus;
}

export interface UserPaymentSummary {
  userId: string;
  userName: string;
  requiredAmount: number;
  paidAmount: number;
  balance: number;
  status: PaymentStatus;
}

export interface GroupPaymentOverview {
  rows: PaymentLedgerRow[];
  summaries: UserPaymentSummary[];
  payments: PaymentRecord[];
  auditLogs: PaymentAuditLog[];
  events: SportEvent[];
  members: GroupMember[];
}

export interface PaymentFilters {
  eventId: string;
  userId: string;
  period: 'all' | 'week' | 'month' | 'year';
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private eventService = inject(EventService);
  private groupService = inject(GroupService);
  private languageService = inject(LanguageService);

  get paymentMethods(): Array<{ id: PaymentMethod; label: string }> {
    return [
      { id: 'cash', label: this.languageService.t('payments.methods.cash') },
      { id: 'bank_transfer', label: this.languageService.t('payments.methods.bankTransfer') },
      { id: 'revolut', label: this.languageService.t('payments.methods.revolut') },
      { id: 'other', label: this.languageService.t('payments.methods.other') },
    ];
  }

  getGroupPaymentOverview(groupId: string, includeAuditLogs = true): Observable<GroupPaymentOverview> {
    if (!groupId) {
      return of({
        rows: [],
        summaries: [],
        payments: [],
        auditLogs: [],
        events: [],
        members: [],
      });
    }

    return combineLatest([
      this.getPaymentEvents(groupId).pipe(
        catchError((error) => {
          console.error('Payment events load error:', error);
          return of([]);
        })
      ),
      this.groupService.getGroupMembers(groupId).pipe(
        catchError((error) => {
          console.error('Payment members load error:', error);
          return of([]);
        })
      ),
      this.getPayments(groupId).pipe(
        catchError((error) => {
          console.error('Payments load error:', error);
          return of([]);
        })
      ),
      includeAuditLogs
        ? this.getAuditLogs(groupId).pipe(
            catchError((error) => {
              console.error('Payment audit logs load error:', error);
              return of([]);
            })
          )
        : of([]),
    ]).pipe(
      map(([events, members, payments, auditLogs]) => {
        const rows = this.buildLedgerRows(events, members, payments);
        const summaries = this.buildSummaries(rows, payments, members);
        return { rows, summaries, payments, auditLogs, events, members };
      })
    );
  }

  getCurrentUserOverview(): Observable<Array<GroupPaymentOverview & { groupId: string; groupName: string }>> {
    return this.authService.user$.pipe(
      switchMap((user) => {
        if (!user) return of([]);
        return this.groupService.getUserGroups(user.uid).pipe(
          switchMap((groups) => {
            if (!groups.length) return of([]);
            return combineLatest(
              groups.map((group) =>
                this.getGroupPaymentOverview(group.id || '', false).pipe(
                  map((overview) => ({
                    ...overview,
                    groupId: group.id || '',
                    groupName: group.name,
                    rows: overview.rows.filter((row) => row.userId === user.uid),
                    summaries: overview.summaries.filter((summary) => summary.userId === user.uid),
                    payments: overview.payments.filter((payment) => payment.userId === user.uid),
                  }))
                )
              )
            );
          })
        );
      })
    );
  }

  async recordPayment(
    groupId: string,
    input: {
      userId: string;
      userName: string;
      eventId?: string | null;
      amount: number;
      method: PaymentMethod;
      paidAt: Date;
      note?: string;
    }
  ) {
    const user = this.authService.currentUser();
    if (!user) throw new Error(this.languageService.t('common.error.authRequired'));

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(this.languageService.t('payments.record.errors.positiveAmount'));
    }

    const paymentData: Omit<PaymentRecord, 'id'> = {
      groupId,
      eventId: input.eventId || null,
      userId: input.userId,
      userName: input.userName,
      amount,
      method: input.method,
      note: (input.note || '').trim(),
      paidAt: Timestamp.fromDate(input.paidAt),
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.displayName || this.languageService.t('common.unknownUser'),
    };

    const paymentRef = await addDoc(collection(this.firestore, `groups/${groupId}/payments`), paymentData);

    await addDoc(collection(this.firestore, `groups/${groupId}/paymentAuditLogs`), {
      groupId,
      action: 'payment_create',
      paymentId: paymentRef.id,
      targetUserId: input.userId,
      targetUserName: input.userName,
      eventId: input.eventId || null,
      amount,
      method: input.method,
      actorId: user.uid,
      actorName: user.displayName || this.languageService.t('common.unknownUser'),
      createdAt: serverTimestamp(),
    } satisfies Omit<PaymentAuditLog, 'id'>);

    return paymentRef;
  }

  applyFilters(rows: PaymentLedgerRow[], filters: PaymentFilters): PaymentLedgerRow[] {
    const now = new Date();
    const start = this.periodStart(now, filters.period);
    return rows.filter((row) => {
      if (filters.eventId !== 'all' && row.eventId !== filters.eventId) return false;
      if (filters.userId !== 'all' && row.userId !== filters.userId) return false;
      if (start && row.eventDate < start) return false;
      return true;
    });
  }

  statusLabel(status: PaymentStatus): string {
    switch (status) {
      case 'paid':
        return this.languageService.t('payments.status.paid');
      case 'partial':
        return this.languageService.t('payments.status.partial');
      default:
        return this.languageService.t('payments.status.unpaid');
    }
  }

  methodLabel(method: PaymentMethod): string {
    return this.paymentMethods.find((item) => item.id === method)?.label || method;
  }

  formatMoney(value: number): string {
    const locale = this.languageService.currentLanguage() === 'en' ? 'en-US' : 'hu-HU';
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      style: 'currency',
      currency: 'HUF',
    }).format(Math.round(value || 0));
  }

  private getPayments(groupId: string): Observable<PaymentRecord[]> {
    const q = query(collection(this.firestore, `groups/${groupId}/payments`), orderBy('paidAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<PaymentRecord[]>;
  }

  private getPaymentEvents(groupId: string): Observable<SportEvent[]> {
    const q = query(
      collection(this.firestore, `groups/${groupId}/events`),
      where('payment.enabled', '==', true)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((events) => this.sortPaymentEvents(events as SportEvent[])),
      catchError((error) => {
        console.error('Payment-enabled events query failed, falling back to event list queries:', error);
        return combineLatest([
          this.eventService.getUpcomingEvents(groupId),
          this.eventService.getPastEvents(groupId),
        ]).pipe(
          map(([upcomingEvents, pastEvents]) =>
            this.sortPaymentEvents(this.dedupeEvents([...upcomingEvents, ...pastEvents]))
          )
        );
      })
    );
  }

  private sortPaymentEvents(events: SportEvent[]): SportEvent[] {
    return events
      .filter((event) => event.payment?.enabled && this.toAmount(event.payment?.amount) > 0)
      .sort((a, b) => this.coerceDate(b.date).getTime() - this.coerceDate(a.date).getTime());
  }

  private getAuditLogs(groupId: string): Observable<PaymentAuditLog[]> {
    const q = query(
      collection(this.firestore, `groups/${groupId}/paymentAuditLogs`),
      orderBy('createdAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<PaymentAuditLog[]>;
  }

  private buildLedgerRows(
    events: SportEvent[],
    members: GroupMember[],
    payments: PaymentRecord[]
  ): PaymentLedgerRow[] {
    const memberById = new Map(members.map((member) => [member.userId, member]));
    return events
      .filter((event) => event.payment?.enabled)
      .flatMap((event) => {
        const attendees = event.attendees || [];
        const perPerson = this.eventPerPersonAmount(event, attendees.length);
        return attendees.map((userId) => {
          const member = memberById.get(userId);
          const paidAmount = payments
            .filter((payment) => payment.userId === userId && payment.eventId === event.id)
            .reduce((sum, payment) => sum + this.toAmount(payment.amount), 0);
          const requiredAmount = perPerson;
          const balance = paidAmount - requiredAmount;
          return {
            eventId: event.id || '',
            eventTitle: event.title || this.languageService.t('common.event.defaultName'),
            eventDate: this.coerceDate(event.date),
            dueDate: event.payment?.dueDate ? this.coerceDate(event.payment.dueDate) : null,
            userId,
            userName: member?.name || userId,
            requiredAmount,
            paidAmount,
            balance,
            status: this.paymentStatus(requiredAmount, paidAmount),
          };
        });
      })
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
  }

  private buildSummaries(
    rows: PaymentLedgerRow[],
    payments: PaymentRecord[],
    members: GroupMember[]
  ): UserPaymentSummary[] {
    const userIds = new Set<string>([
      ...members.map((member) => member.userId),
      ...rows.map((row) => row.userId),
      ...payments.map((payment) => payment.userId),
    ]);

    return Array.from(userIds)
      .map((userId) => {
        const member = members.find((item) => item.userId === userId);
        const userRows = rows.filter((row) => row.userId === userId);
        const requiredAmount = userRows.reduce((sum, row) => sum + row.requiredAmount, 0);
        const paidAmount = payments
          .filter((payment) => payment.userId === userId)
          .reduce((sum, payment) => sum + this.toAmount(payment.amount), 0);
        return {
          userId,
          userName:
            member?.name ||
            userRows[0]?.userName ||
            payments.find((p) => p.userId === userId)?.userName ||
            userId,
          requiredAmount,
          paidAmount,
          balance: paidAmount - requiredAmount,
          status: this.paymentStatus(requiredAmount, paidAmount),
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName, this.sortLocale()));
  }

  private eventPerPersonAmount(event: SportEvent, attendeeCount: number): number {
    const amount = this.toAmount(event.payment?.amount);
    if (!event.payment?.enabled || amount <= 0) return 0;
    if (event.payment.mode === 'total') {
      return attendeeCount > 0 ? Math.ceil(amount / attendeeCount) : 0;
    }
    return amount;
  }

  private paymentStatus(requiredAmount: number, paidAmount: number): PaymentStatus {
    if (requiredAmount <= 0 || paidAmount >= requiredAmount) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
  }

  private periodStart(now: Date, period: PaymentFilters['period']): Date | null {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === 'week') {
      start.setDate(start.getDate() - 7);
      return start;
    }
    if (period === 'month') {
      start.setMonth(start.getMonth() - 1);
      return start;
    }
    if (period === 'year') {
      start.setFullYear(start.getFullYear() - 1);
      return start;
    }
    return null;
  }

  private dedupeEvents(events: SportEvent[]): SportEvent[] {
    const byId = new Map<string, SportEvent>();
    for (const event of events) {
      if (!event.id) continue;
      byId.set(event.id, event);
    }
    return Array.from(byId.values());
  }

  private toAmount(value: unknown): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private coerceDate(value: any): Date {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(value);
  }

  private sortLocale(): string {
    return this.languageService.currentLanguage() === 'en' ? 'en-US' : 'hu-HU';
  }
}
