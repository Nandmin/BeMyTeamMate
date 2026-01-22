import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminGroupsSectionComponent } from '../../components/admin-groups-section/admin-groups-section.component';
import { AdminSidebarItemComponent } from '../../components/admin-sidebar-item/admin-sidebar-item.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, AdminGroupsSectionComponent, AdminSidebarItemComponent],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage {
  isSidebarCollapsed = false;
  activeSection: 'overview' | 'groups' | 'users' | 'stats' | 'messages' = 'overview';

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  setSection(section: 'overview' | 'groups' | 'users' | 'stats' | 'messages'): void {
    this.activeSection = section;
  }
}
