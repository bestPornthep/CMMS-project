import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PmService } from '../../core/services/pm.service';
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
  private pmService = inject(PmService);
  private router = inject(Router);

  loginForm = this.fb.group({
    employeeId: ['', Validators.required],
    password: ['', Validators.required]
  });

  errorMessage = '';
  showPassword = false;
  isLoading = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid || this.isLoading) {
      if (this.loginForm.invalid) this.errorMessage = 'Please enter Employee ID and Password.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const { employeeId, password } = this.loginForm.value;

    try {
      if (await this.authService.login(employeeId!, password!)) {
        await this.pmService.loadData();
        this.router.navigate(['/dashboard']);
      } else {
        this.errorMessage = 'Invalid credentials. Please try again.';
      }
    } catch (e) {
      this.errorMessage = 'Invalid credentials. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
