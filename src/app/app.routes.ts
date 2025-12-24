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
    path: 'events',
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  },
  {
    path: 'groups',
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  }, // TODO
  {
    path: 'results',
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  }, // TODO
  {
    path: 'profile',
    loadComponent: () => import('./pages/events-list/events-list').then((m) => m.EventsList),
  }, // TODO
];
