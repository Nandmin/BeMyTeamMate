import { Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminGroupsSectionComponent } from '../../components/admin-groups-section/admin-groups-section.component';
import { AdminSidebarItemComponent } from '../../components/admin-sidebar-item/admin-sidebar-item.component';
import { AdminMessagesSectionComponent } from '../../components/admin-messages-section/admin-messages-section.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { SeoService } from '../../services/seo.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    AdminGroupsSectionComponent,
    AdminMessagesSectionComponent,
    AdminSidebarItemComponent,
    TranslatePipe,
  ],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage {
  private seo = inject(SeoService);
  protected readonly languageService = inject(LanguageService);

  readonly appVersion = environment.appVersion;
  isSidebarCollapsed = false;
  activeSection: 'overview' | 'groups' | 'users' | 'stats' | 'messages' = 'overview';

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('admin.dashboard.meta.title'),
        description: this.languageService.t('admin.dashboard.meta.description'),
        path: '/admin',
        noindex: true,
      });
    });
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  setSection(section: 'overview' | 'groups' | 'users' | 'stats' | 'messages'): void {
    this.activeSection = section;
  }
}
