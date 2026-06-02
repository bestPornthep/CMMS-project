export interface Asset {
    id: string;
    name: string;
    type: string;
    location: string;
}

export type PMTaskStatus = 'Pending' | 'In Progress' | 'Done' | 'Overdue';
export type PMTaskFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';

export interface Template {
  name: string;
  department: string;
  checklist: string[];
}

export interface PMTask {
    id: string;
    title: string;
    description: string;
    frequency: PMTaskFrequency;
    assetId: string;
    nextDueDate: Date;
    estimatedHours: number;
    status: PMTaskStatus;
    
    productId?: string;
    department?: string;
    checklist?: { text: string; done: boolean }[];
    partsRequired?: string[];
    
    // Execution details (merged from legacy WorkOrder)
    assignedTo?: string; // employeeId of assignee
    completedBy?: string; // employeeId of person who completed it
    completedAt?: Date;
    recordNotes?: string;
    partsUsed?: string[];
    
    createdBy?: string;
    createdAt?: Date;
}

export type Role = 'technician' | 'engineer' | 'manager' | 'admin';

export interface Permission {
    action: string;
}

export interface DelegatedProduct {
    productId: string;
    status: 'active' | 'revoked';
    permissions: string[];
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