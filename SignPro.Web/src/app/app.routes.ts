import { Routes } from '@angular/router';

import { Login } from './pages/auth/login/login';
import { Register } from './pages/auth/register/register';
import { Dashboard } from './pages/dashboard/dashboard';
import { SignPdf } from './pages/sign-pdf/sign-pdf';
import { History } from './pages/history/history';
import { Admin } from './pages/admin/admin';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'register',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: Login
  },
  {
    path: 'register',
    component: Register
  },
  {
    path: 'dashboard',
    component: Dashboard
  },
  {
    path: 'sign-pdf',
    component: SignPdf
  },
  {
    path: 'history',
    component: History
  },
  {
    path: 'admin',
    component: Admin
  },
  {
    path: '**',
    redirectTo: 'register'
  }
];