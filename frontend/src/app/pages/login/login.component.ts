import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PmStore } from '../../core/services/pm-store.service';
import { MasterPlanService } from '../../core/services/master-plan.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private pmStore = inject(PmStore);
  private masterPlan = inject(MasterPlanService);
  private router = inject(Router);

  loginForm = this.fb.group({
    employeeId: ['', Validators.required],
    password: ['', Validators.required]
  });

  errorMessage = signal('');
  showPassword = signal(false);
  isLoading = signal(false);

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid || this.isLoading()) {
      if (this.loginForm.invalid) this.errorMessage.set('Please enter Employee ID and Password.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    const { employeeId, password } = this.loginForm.value;

    try {
      if (await this.authService.login(employeeId!, password!)) {
        await this.pmStore.loadData();
        await this.masterPlan.load().catch(e => console.error('Master Plan load failed', e));
        this.router.navigate(['/dashboard']);
      } else {
        this.errorMessage.set('Invalid credentials. Please try again.');
      }
    } catch (e) {
      this.errorMessage.set('Invalid credentials. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
