import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { PmService } from './core/services/pm.service';
import { ThemeService } from './core/services/theme.service';

import { routes } from './app.routes';

export function initializeApp(authService: AuthService, pmService: PmService, themeService: ThemeService) {
  return async () => {
    // ThemeService constructor already applied the theme; nothing extra needed.
    void themeService;
    await authService.init();
    await pmService.loadData();
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
      deps: [AuthService, PmService, ThemeService],
      multi: true
    }
  ]
};
