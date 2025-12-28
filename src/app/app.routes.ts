import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing-page/landing-page').then((m) => m.LandingPage),
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
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  },
  {
    path: 'groups',
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
    path: 'results',
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  }, // TODO
  {
    path: 'profile',
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  }, // TODO
];
