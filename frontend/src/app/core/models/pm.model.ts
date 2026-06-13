export interface Asset {
  id: string;
  name: string;
  department: string; // renamed from 'type' — matches domain language and backend schema
  location: string;   // = productId (customer/site code)
}

export type PMTaskStatus = 'Pending' | 'In Progress' | 'Pending Approval' | 'Done' | 'Overdue';
export type PMTaskFrequency = string; // 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | custom

export interface Template {
  id?: string;
  name: string;
  department: string;
  isDefault?: boolean;
  checklist: { text: string; requiresPhoto?: boolean }[];
  createdBy?: string;
}

export interface PMTask {
  id: string;
  title: string;
  description: string;
  frequency: PMTaskFrequency;
  assetId: string;
  nextDueDate: Date;
  estimatedHours: number;
  actualHours?: number;
  status: PMTaskStatus;

  productId?: string;
  department?: string;
  checklist?: { text: string; done: boolean; requiresPhoto?: boolean; photoUrl?: string }[];
  partsRequired?: string[];

  // Execution details
  assignedTo?: string;
  assignedAt?: Date;
  assignedBy?: string;
  completedBy?: string;
  completedAt?: Date;
  recordNotes?: string;
  partsUsed?: string[];

  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;

  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type Role = 'technician' | 'engineer' | 'manager' | 'admin';

export interface DelegatedProduct {
  id?: string;
  productId: string;
  status: 'active' | 'revoked';
  permissions: string[];
  validUntil?: Date;
}

export interface User {
  employeeId: string;
  name: string;
  initials: string;
  baseRole: Role;
  roleLabel: string;
  department: string;
  ownedProducts: string[];
  delegatedProducts: DelegatedProduct[];
  permissions: string[];
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  actor: { name: string; id: string };
  target: { name: string; id: string; isUser: boolean } | null;
  product: string;
  type: 'security' | 'system' | 'data';
}

// Backend migration helpers
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}