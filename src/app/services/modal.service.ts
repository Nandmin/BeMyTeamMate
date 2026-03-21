import { Injectable, inject, signal } from '@angular/core';
import { LanguageService } from './language.service';

export interface ModalConfig {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  extraActionText?: string;
  extraActionIcon?: string;
  extraActionClass?: string;
  onExtraAction?: (() => void) | null;
}

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private readonly languageService = inject(LanguageService);

  modalState = signal<{
    isOpen: boolean;
    config: ModalConfig | null;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    config: null,
    resolve: null,
  });

  alert(
    message: string,
    title?: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ): Promise<boolean> {
    return this.open({
      message,
      title: title ?? this.languageService.t('common.attention'),
      type,
      confirmText: this.languageService.t('common.ok'),
    });
  }

  confirm(
    message: string,
    title?: string,
    confirmText?: string,
    cancelText?: string
  ): Promise<boolean> {
    return this.open({
      message,
      title: title ?? this.languageService.t('common.confirmation'),
      type: 'confirm',
      confirmText: confirmText ?? this.languageService.t('common.confirm'),
      cancelText: cancelText ?? this.languageService.t('common.cancel'),
    });
  }

  openWithAction(config: ModalConfig): Promise<boolean> {
    return this.open(config);
  }

  private open(config: ModalConfig): Promise<boolean> {
    return new Promise((resolve) => {
      this.modalState.set({
        isOpen: true,
        config,
        resolve,
      });
    });
  }

  close(result: boolean) {
    const state = this.modalState();
    if (state.resolve) {
      state.resolve(result);
    }
    this.modalState.set({
      isOpen: false,
      config: null,
      resolve: null,
    });
  }
}

