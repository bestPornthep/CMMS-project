import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { authGuard, authGuardChild } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    canActivateChild: [authGuardChild],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'unauthorized',
        loadComponent: () => import('./pages/unauthorized/unauthorized').then(m => m.Unauthorized),
        data: { section: 'Error', title: 'Unauthorized Access' }
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        data: { permission: 'pm.dashboard.view', section: 'Overview', title: 'Dashboard' }
      },
      {
        path: 'pm-create',
        loadComponent: () => import('./pages/pm-create/pm-create.component').then(m => m.PmCreateComponent),
        data: { permission: 'pm.create.view', section: 'PM Work', title: 'Create PM' }
      },
      {
        path: 'pm-assign',
        loadComponent: () => import('./pages/pm-assign/pm-assign.component').then(m => m.PmAssignComponent),
        data: { permission: 'pm.assign.view', section: 'PM Work', title: 'Assign PM' }
      },
      {
        path: 'pm-record',
        loadComponent: () => import('./pages/pm-record/pm-record.component').then(m => m.PmRecordComponent),
        data: { permission: 'pm.record.view', section: 'PM Work', title: 'Record PM' }
      },
      {
        path: 'pm-calendar',
        loadComponent: () => import('./pages/pm-calendar/pm-calendar.component').then(m => m.PmCalendarComponent),
        data: { permission: 'pm.calendar.view', section: 'PM Work', title: 'PM Calendar' }
      },
      {
        path: 'pm-reports',
        loadComponent: () => import('./pages/pm-reports/pm-reports.component').then(m => m.PmReportsComponent),
        data: { permission: 'pm.reports.view', section: 'PM Work', title: 'PM Reports' }
      },
      {
        path: 'pm-audit',
        loadComponent: () => import('./pages/pm-audit/pm-audit.component').then(m => m.PmAuditComponent),
        data: { permission: 'pm.audit.view', section: 'Administration', title: 'Audit Log' }
      }
    ]
  },
  { path: '**', redirectTo: '' }
];