import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalComponent {
  modalService = inject(ModalService);

  config = computed(() => this.modalService.modalState().config);
  isDeleteConfirm = computed(() => {
    const cfg = this.config();
    if (!cfg || cfg.type !== 'confirm') return false;
    const fields = [
      cfg.title || '',
      cfg.message || '',
      cfg.confirmText || '',
    ]
      .join(' ')
      .toLowerCase();
    return fields.includes('torl') || fields.includes('delete');
  });

  getIcon() {
    if (this.isDeleteConfirm()) return 'close';
    switch (this.config()?.type) {
      case 'success':
        return 'check_circle';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      case 'confirm':
        return 'help';
      default:
        return 'info';
    }
  }

  getIconColorClass() {
    if (this.isDeleteConfirm()) return 'bg-red-500';
    switch (this.config()?.type) {
      case 'success':
        return 'bg-primary';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      case 'confirm':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  }

  getTextColorClass() {
    if (this.isDeleteConfirm()) return 'text-red-500';
    switch (this.config()?.type) {
      case 'success':
        return 'text-primary';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      case 'confirm':
        return 'text-blue-500';
      default:
        return 'text-gray-400';
    }
  }

  getButtonClass() {
    if (this.isDeleteConfirm()) return 'bg-red-500 hover:bg-red-400 text-white';
    switch (this.config()?.type) {
      case 'success':
        return 'bg-primary hover:bg-primary-hover';
      case 'warning':
        return 'bg-yellow-500 hover:bg-yellow-400 text-black';
      case 'error':
        return 'bg-red-500 hover:bg-red-400 text-white';
      case 'confirm':
        return 'bg-primary hover:bg-primary-hover';
      default:
        return 'bg-white hover:bg-gray-200';
    }
  }

  extraAction() {
    const handler = this.config()?.onExtraAction;
    this.modalService.close(false);
    handler?.();
  }

  confirm() {
    this.modalService.close(true);
  }

  cancel() {
    this.modalService.close(false);
  }

  onBackdropClick() {
    // Optional: close on backdrop click for types other than confirm?
    // For now, let's allow closing info/success alerts by clicking backdrop, but maybe enforce choice for confirm.
    if (this.config()?.type !== 'confirm') {
      this.modalService.close(false);
    }
  }
}
