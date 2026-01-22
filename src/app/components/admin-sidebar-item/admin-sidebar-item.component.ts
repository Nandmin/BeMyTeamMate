import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-sidebar-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-sidebar-item.component.html',
  styleUrl: './admin-sidebar-item.component.scss',
})
export class AdminSidebarItemComponent {
  @Input() icon = '';
  @Input() label = '';
  @Input() active = false;
  @Output() selected = new EventEmitter<void>();
}
