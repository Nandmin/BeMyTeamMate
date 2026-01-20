import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { siteAdminGuard } from './guards/site-admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing-page/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'contact',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/contact/contact.page').then((m) => m.ContactPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'events',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  },
  {
    path: 'groups',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/groups/groups').then((m) => m.GroupsPage),
  },
  {
    path: 'groups/:id',
    loadComponent: () =>
      import('./pages/group-detail/group-detail.page').then((m) => m.GroupDetailPage),
  },
  {
    path: 'groups/:id/create-event',
    loadComponent: () =>
      import('./pages/create-event/create-event.page').then((m) => m.CreateEventPage),
  },
  {
    path: 'groups/:id/edit-event/:eventId',
    loadComponent: () =>
      import('./pages/create-event/create-event.page').then((m) => m.CreateEventPage),
  },
  {
    path: 'groups/:id/settings',
    loadComponent: () =>
      import('./pages/group-settings/group-settings.page').then((m) => m.GroupSettingsPage),
  },
  {
    path: 'groups/:id/events/:eventId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/event-detail/event-detail.page').then((m) => m.EventDetailPage),
  },
  {
    path: 'admin',
    canActivate: [siteAdminGuard],
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard.page').then((m) => m.AdminDashboardPage),
  },
  {
    path: 'results',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/results/results').then((m) => m.Results),
  }, // TODO
  {
    path: 'profile',
    loadComponent: () => import('./pages/user-profile/user-profile').then((m) => m.UserProfilePage),
  },
  {
    path: 'profile/:id',
    loadComponent: () => import('./pages/user-profile/user-profile').then((m) => m.UserProfilePage),
  },
];
