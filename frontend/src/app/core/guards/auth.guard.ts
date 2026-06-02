import { inject } from '@angular/core';
import { Router, CanActivateFn, CanActivateChildFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    // Check specific permission if provided in route data
    const requiredPermission = route.data?.['permission'];
    if (requiredPermission && !authService.hasPermission(requiredPermission)) {
      return router.parseUrl('/unauthorized');
    }
    return true;
  }

  // Not logged in, redirect to login
  return router.parseUrl('/login');
};

export const authGuardChild: CanActivateChildFn = (childRoute, state) => {
  return authGuard(childRoute, state);
};
