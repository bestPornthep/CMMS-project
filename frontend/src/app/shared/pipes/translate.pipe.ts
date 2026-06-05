import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';

@Pipe({
  name: 'tr',
  standalone: true,
  pure: false // Impure so it updates immediately when the signal changes without needing template rerender
})
export class TranslatePipe implements PipeTransform {
  private translationService = inject(TranslationService);
  
  transform(value: string): string {
    if (!value) return '';
    return this.translationService.translate(value);
  }
}
