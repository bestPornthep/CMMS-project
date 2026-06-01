import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.component.html',
  styleUrls: []
})
export class LayoutComponent {
  private authService = inject(AuthService);
  
  user = this.authService.currentUser;
  
  // Expose permission check for sidebar links
  hasPermission(permission: string): boolean {
    return this.authService.hasPermission(permission);
  }
}
