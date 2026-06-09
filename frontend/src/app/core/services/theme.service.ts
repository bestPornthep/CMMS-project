import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'assetintel_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _isDark = signal(false);
  readonly isDark = this._isDark.asReadonly();

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const dark = saved === 'dark'; // default: light
    this._apply(dark);
  }

  toggle(): void {
    this._apply(!this._isDark());
  }

  private _apply(dark: boolean): void {
    this._isDark.set(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  }
}
