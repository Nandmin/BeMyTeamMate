import { Injectable } from '@angular/core';

export interface AdminMessageRow {
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

@Injectable({
  providedIn: 'root',
})
export class AdminMessagesCacheService {
  private cache: { data: AdminMessageRow[]; ts: number } | null = null;
  private readonly ttlMs = 5 * 60 * 1000;

  get(): AdminMessageRow[] | null {
    if (!this.cache) return null;
    if (Date.now() - this.cache.ts > this.ttlMs) {
      this.cache = null;
      return null;
    }
    return this.cloneRows(this.cache.data);
  }

  set(rows: AdminMessageRow[]): void {
    this.cache = {
      data: this.cloneRows(rows),
      ts: Date.now(),
    };
  }

  markAsRead(messageId: string, readAtLabel: string): void {
    if (!this.cache) return;
    const row = this.cache.data.find((item) => item.id === messageId);
    if (!row) return;
    row.isRead = true;
    row.readAtLabel = readAtLabel;
    this.cache.ts = Date.now();
  }

  remove(messageId: string): void {
    if (!this.cache) return;
    this.cache.data = this.cache.data.filter((item) => item.id !== messageId);
    this.cache.ts = Date.now();
  }

  clear(): void {
    this.cache = null;
  }

  private cloneRows(rows: AdminMessageRow[]): AdminMessageRow[] {
    return rows.map((row) => ({ ...row }));
  }
}
