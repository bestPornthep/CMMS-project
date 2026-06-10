import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.type }}" role="alert">
          <span class="toast__icon">{{ icons[toast.type] }}</span>
          <span class="toast__message">{{ toast.message }}</span>
          <button class="toast__close" (click)="toastService.dismiss(toast.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 380px;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 500;
      color: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      animation: slideIn 0.25s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .toast--success { background: #1a7f4b; }
    .toast--error   { background: #c0392b; }
    .toast--warning { background: #b7680d; }
    .toast--info    { background: #1a5c8f; }
    .toast__icon { font-size: 1.1rem; flex-shrink: 0; }
    .toast__message { flex: 1; line-height: 1.4; }
    .toast__close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.8);
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0;
      flex-shrink: 0;
    }
    .toast__close:hover { color: #fff; }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);
  icons: Record<string, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
}
