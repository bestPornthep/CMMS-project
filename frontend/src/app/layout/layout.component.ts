import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { filter, map, mergeMap } from 'rxjs/operators';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.component.html',
  styleUrls: []
})
export class LayoutComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  
  user = this.authService.currentUser;
  
  currentSection = signal('Overview');
  currentTitle = signal('Dashboard');

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      mergeMap(route => route.data)
    ).subscribe(data => {
      if (data['section']) this.currentSection.set(data['section']);
      if (data['title']) this.currentTitle.set(data['title']);
    });
  }
  
  // Expose permission check for sidebar links
  hasPermission(permission: string): boolean {
    return this.authService.hasPermission(permission);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
