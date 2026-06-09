import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-liquid-glass-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './liquid-glass-toggle.component.html',
  styleUrls: ['./liquid-glass-toggle.component.scss']
})
export class LiquidGlassToggleComponent {
  public themeService = inject(ThemeService);
}
