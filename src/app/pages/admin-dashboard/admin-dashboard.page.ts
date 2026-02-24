import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminGroupsSectionComponent } from '../../components/admin-groups-section/admin-groups-section.component';
import { AdminSidebarItemComponent } from '../../components/admin-sidebar-item/admin-sidebar-item.component';
import { AdminMessagesSectionComponent } from '../../components/admin-messages-section/admin-messages-section.component';
import { SeoService } from '../../services/seo.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, AdminGroupsSectionComponent, AdminMessagesSectionComponent, AdminSidebarItemComponent],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage {
  private seo = inject(SeoService);

  readonly appVersion = environment.appVersion;
  isSidebarCollapsed = false;
  activeSection: 'overview' | 'groups' | 'users' | 'stats' | 'messages' = 'overview';

  constructor() {
    this.seo.setPageMeta({
      title: 'Admin felület – BeMyTeamMate',
      description: 'Adminisztrációs vezérlőpult csoportokhoz, üzenetekhez és statisztikákhoz.',
      path: '/admin',
      noindex: true,
    });
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  setSection(section: 'overview' | 'groups' | 'users' | 'stats' | 'messages'): void {
    this.activeSection = section;
  }
}
