import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { PmStore } from './core/services/pm-store.service';
import { ThemeService } from './core/services/theme.service';

import { routes } from './app.routes';

export function initializeApp(authService: AuthService, pmStore: PmStore, themeService: ThemeService) {
  return async () => {
    // ThemeService constructor already applied the theme; nothing extra needed.
    void themeService;
    try {
      await authService.init();
    } catch (e) {
      console.error('Auth init failed', e);
    }
    try {
      await pmStore.loadData();
    } catch (e) {
      console.error('PM data load failed', e);
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AuthService, PmStore, ThemeService],
      multi: true
    }
  ]
};
