import {
  IsString, IsNotEmpty, IsNumber, IsPositive, IsDateString,
  IsArray, IsOptional, IsIn, ValidateNested, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;
}

export class CreatePmTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  frequency: string;

  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsDateString()
  nextDueDate: string;

  @IsNumber()
  @IsPositive()
  estimatedHours: number;

  @IsOptional()
  @IsIn(['Pending', 'In Progress', 'Pending Approval', 'Done', 'Overdue'])
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partsRequired?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partsUsed?: string[];

  @IsOptional()
  @IsString()
  recordNotes?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
