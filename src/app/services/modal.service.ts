import { Injectable, signal } from '@angular/core';

export interface ModalConfig {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  confirmText?: string;
  cancelText?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ModalService {
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
    title: string = 'Figyelem',
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ): Promise<boolean> {
    return this.open({
      message,
      title,
      type,
      confirmText: 'Rendben',
    });
  }

  confirm(
    message: string,
    title: string = 'Megerősítés',
    confirmText: string = 'Igen',
    cancelText: string = 'Mégse'
  ): Promise<boolean> {
    return this.open({
      message,
      title,
      type: 'confirm',
      confirmText,
      cancelText,
    });
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
