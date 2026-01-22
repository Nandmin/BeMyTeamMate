import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { ModalService } from '../../services/modal.service';
import { AuthService } from '../../services/auth.service';

interface AdminMessageRow {
  id: string;
  senderLabel: string;
  senderEmail?: string;
  createdAtMs: number | null;
  createdAtLabel: string;
  message: string;
  preview: string;
  isRead: boolean;
  readAtLabel: string;
}

@Component({
  selector: 'app-admin-messages-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-messages-section.component.html',
  styleUrl: './admin-messages-section.component.scss',
})
export class AdminMessagesSectionComponent {
  @Output() backToOverview = new EventEmitter<void>();

  private firestore = inject(Firestore);
  private modalService = inject(ModalService);
  private authService = inject(AuthService);
  private adminMessagesCacheKey = 'admin:messages:list';
  private cacheTtlMs = 5 * 60 * 1000;

  isQuerying = false;
  hasQueried = false;
  pageSizeOptions = [10, 25, 50];
  pageSize = 10;
  currentPage = 1;
  messages: AdminMessageRow[] = [];

  constructor() {
    const loaded = this.loadCachedMessages();
    if (loaded) {
      this.hasQueried = true;
      this.currentPage = 1;
    }
  }

  async runQuery(): Promise<void> {
    if (this.isQuerying) return;
    this.isQuerying = true;

    try {
      const cached = this.loadCachedMessages();
      if (cached) {
        this.hasQueried = true;
        return;
      }

      const rows = await this.fetchMessages();
      this.messages = rows;
      this.saveCachedMessages(rows);
      this.currentPage = 1;
      this.hasQueried = true;
    } catch (error) {
      console.error('Admin messages query failed:', error);
    } finally {
      this.isQuerying = false;
    }
  }

  openMessage(message: AdminMessageRow): void {
    if (!message.isRead) {
      message.isRead = true;
      message.readAtLabel = this.formatDateTime(new Date());
      this.saveCachedMessages(this.messages);
      void this.markAsRead(message, undefined, true);
    }

    const title = message.senderLabel ? 'Üzenet - ' + message.senderLabel : 'Üzenet';
    void this.modalService.openWithAction({
      message: message.message,
      title,
      type: 'info',
      confirmText: 'Bezárás',
      extraActionText: 'Archiválás',
      extraActionIcon: 'archive',
      onExtraAction: () => {
        void this.archiveMessage(message);
      },
    });
  }

  async markAsRead(message: AdminMessageRow, event?: Event, force = false): Promise<void> {
    event?.stopPropagation();
    if (message.isRead && !force) return;

    try {
      const user = this.authService.currentUser();
      const profile = this.authService.fullCurrentUser();
      const messageRef = doc(this.firestore, `contactMessages/${message.id}`);
      await updateDoc(messageRef, {
        readAt: serverTimestamp(),
        readById: user?.uid || '',
        readByName: profile?.displayName || user?.displayName || user?.email || 'Ismeretlen',
        readByEmail: user?.email || '',
      });

      const now = Date.now();
      message.isRead = true;
      message.readAtLabel = this.formatDateTime(new Date(now));
      this.saveCachedMessages(this.messages);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }

  async archiveMessage(message: AdminMessageRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    const confirmed = await this.modalService.confirm(
      'Biztosan archiválod ezt az üzenetet?',
      'Archiválás megerősítése',
      'Archiválás',
      'Mégse'
    );
    if (!confirmed) return;

    try {
      const user = this.authService.currentUser();
      const profile = this.authService.fullCurrentUser();
      const messageRef = doc(this.firestore, `contactMessages/${message.id}`);
      const archivedRef = doc(this.firestore, `contactMessages_Archived/${message.id}`);
      const snap = await getDoc(messageRef);

      if (!snap.exists()) {
        this.removeFromList(message.id);
        return;
      }

      const batch = writeBatch(this.firestore);
      const data = snap.data();
      batch.set(archivedRef, {
        ...data,
        archivedAt: serverTimestamp(),
        archivedById: user?.uid || '',
        archivedByName: profile?.displayName || user?.displayName || user?.email || 'Ismeretlen',
        archivedByEmail: user?.email || '',
      });
      batch.delete(messageRef);
      await batch.commit();

      this.removeFromList(message.id);
    } catch (error) {
      console.error('Failed to archive message:', error);
    }
  }

  async deleteMessage(message: AdminMessageRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    const confirmed = await this.modalService.confirm(
      'Biztosan törlöd ezt az üzenetet?',
      'Törlés megerősítése',
      'Törlés',
      'Mégse'
    );
    if (!confirmed) return;

    try {
      const messageRef = doc(this.firestore, `contactMessages/${message.id}`);
      await deleteDoc(messageRef);
      this.removeFromList(message.id);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.messages.length / this.pageSize));
  }

  get pagedMessages(): AdminMessageRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.messages.slice(start, start + this.pageSize);
  }

  private removeFromList(messageId: string) {
    this.messages = this.messages.filter((item) => item.id !== messageId);
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    this.saveCachedMessages(this.messages);
  }

  private loadCachedMessages(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const raw = window.localStorage.getItem(this.adminMessagesCacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { data: AdminMessageRow[]; ts: number };
      if (!parsed?.data || !parsed?.ts) return false;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(this.adminMessagesCacheKey);
        return false;
      }
      this.messages = parsed.data
        .map((item) => ({
          ...item,
          createdAtLabel: item.createdAtMs ? this.formatDateTime(new Date(item.createdAtMs)) : '--',
          readAtLabel: item.readAtLabel || '--',
        }))
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      return true;
    } catch {
      return false;
    }
  }

  private saveCachedMessages(messages: AdminMessageRow[]): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const entry = { data: messages, ts: Date.now() };
      window.localStorage.setItem(this.adminMessagesCacheKey, JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private async fetchMessages(): Promise<AdminMessageRow[]> {
    const messagesRef = collection(this.firestore, 'contactMessages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    return snap.docs
      .map((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        const createdAt = this.toDate(data['createdAt']);
        const readAt = this.toDate(data['readAt']);
        const message = typeof data['message'] === 'string' ? data['message'] : '';
        const contactEmail = typeof data['contactEmail'] === 'string' ? data['contactEmail'] : '';
        const userEmail = typeof data['userEmail'] === 'string' ? data['userEmail'] : '';
        const userName = typeof data['userName'] === 'string' ? data['userName'] : '';
        const senderLabel = userName || contactEmail || userEmail || 'Ismeretlen';

        return {
          id: docSnap.id,
          senderLabel,
          senderEmail: contactEmail || userEmail || '',
          createdAtMs: createdAt ? createdAt.getTime() : null,
          createdAtLabel: createdAt ? this.formatDateTime(createdAt) : '--',
          message,
          preview: this.previewMessage(message),
          isRead: Boolean(readAt),
          readAtLabel: readAt ? this.formatDateTime(readAt) : '--',
        };
      })
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  }

  private previewMessage(message: string): string {
    if (!message) return '--';
    const trimmed = message.trim();
    if (trimmed.length <= 100) return trimmed;
    return `${trimmed.slice(0, 100)}...`;
  }

  private formatDateTime(date: Date): string {
    const datePart = date
      .toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\s/g, '');
    const timePart = date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}




