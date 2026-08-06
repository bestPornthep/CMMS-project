import { Injectable, inject, signal } from '@angular/core';
import { TranslationService } from './translation.service';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 0;
  private translationService = inject(TranslationService);

  show(message: string, type: ToastType = 'info', durationMs = 4000): void {
    const id = this.nextId++;
    const translated = this.translationService.translate(message);
    this._toasts.update(t => [...t, { id, message: translated, type }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number): void {
    this._toasts.update(t => t.filter(toast => toast.id !== id));
  }

  success(message: string) { this.show(message, 'success'); }
  error(message: string)   { this.show(message, 'error'); }
  warning(message: string) { this.show(message, 'warning'); }
}
